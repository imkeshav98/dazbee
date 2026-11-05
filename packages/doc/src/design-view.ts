import type * as Y from 'yjs'

import { canHold, deepFreeze, type Design, type Layer, parseDesignIncrementally, parseLayer } from '@dazbee/schema'

import { buildChildIndex, registerChildIndex, siblingOrder } from './children.ts'
import { DELETED, type DesignDoc, nodeToJson, readDesign, root } from './design-doc.ts'
import { repair } from './repair.ts'

type Json = Record<string, unknown>
type Head = Pick<Design, 'meta' | 'pages' | 'frames'>

/**
 * A tab's validated design, kept up to date as the document changes (#23, #29). An edit that
 * changes layers' properties, which is nearly every edit, re-reads and validates only what it
 * touched: nothing it does grows with the number of layers. An edit that changes the meta, pages
 * or frames reads and repairs the whole design, as `readDesign` does, and so does one that adds,
 * removes, re-parents or re-links a layer in a way only repair can settle. Either way the design
 * equals what `readDesign` returns.
 *
 * The design it hands out is live: it always shows the document as it is now, so it never needs
 * copying. It can't be changed through, and each layer in it is frozen and replaced, never
 * changed, when the document changes, so holding one is safe.
 */
export function designView(doc: DesignDoc) {
  const r = root(doc)
  /** Each live layer as plain JSON, as the document holds it, before repair and validation. */
  const rawNodes = new Map<string, Json>()
  /** The validated design's layers. */
  const layers = new Map<string, Layer>()
  /** Each parent's children, back to front. */
  let children = new Map<string, string[]>()
  /** The frame each layer is in. */
  const frameOfLayer = new Map<string, string>()
  /** The layer holding each link id, by frame. */
  const linkHolder = new Map<string, Map<string, string>>()
  /** The validated meta, pages and frames; null until the first whole read. */
  let head: Head | null = null
  /**
   * Whether the last whole read moved, dropped or re-linked a layer, or gave it an index: a later
   * change can undo what made repair do it, so only a whole read can tell.
   */
  let layersRepaired = false
  /** Whether the whole design must be read again. */
  let whole = true
  /** The layers changed since the last read. */
  const dirtyNodes = new Set<string>()

  const nodes = readOnlyRecord(() => {
    refresh()
    return layers
  })
  const design = Object.freeze({
    get meta() {
      return current().meta
    },
    get pages() {
      return current().pages
    },
    get frames() {
      return current().frames
    },
    nodes,
  }) as unknown as Design

  function current() {
    refresh()
    if (!head) throw new Error('the design view was read inside a transaction before its first read')
    return head
  }

  function read(onRepair?: (repairs: string[]) => void): Design {
    // Inside a transaction the changes so far haven't been reported yet: read them directly.
    if (doc._transaction) return readDesign(doc, onRepair)
    refresh(onRepair)
    return design
  }

  const loadNode = (id: string) => {
    const ynode = r.nodes.get(id)
    if (!ynode || ynode.get(DELETED) === true) rawNodes.delete(id)
    else rawNodes.set(id, nodeToJson(ynode))
  }
  const holdLink = (id: string, layer: Layer, frameId: string) => {
    frameOfLayer.set(id, frameId)
    const links = linkHolder.get(frameId) ?? new Map<string, string>()
    linkHolder.set(frameId, links)
    links.set(layer.link, id)
  }
  const releaseLink = (id: string, layer: Layer) => {
    const frameId = frameOfLayer.get(id)
    const links = frameId === undefined ? undefined : linkHolder.get(frameId)
    if (links?.get(layer.link) === id) links.delete(layer.link)
    frameOfLayer.delete(id)
  }

  /** Reads, repairs and validates the whole design, as `readDesign` does. */
  function readWhole(onRepair?: (repairs: string[]) => void) {
    for (const id of dirtyNodes) loadNode(id)
    const rawHead = { meta: r.meta.toJSON(), pages: r.pages.toJSON(), frames: r.frames.toJSON() }
    const repaired = repair({ ...rawHead, nodes: Object.fromEntries(rawNodes) })
    if (repaired.repairs.length > 0) onRepair?.(repaired.repairs)
    const result = parseDesignIncrementally(repaired.snapshot)
    if (!result.success) throw new Error(`design document is invalid:\n${result.errors.join('\n')}`)
    const d = result.design
    head = { meta: deepFreeze(d.meta), pages: deepFreeze(d.pages), frames: deepFreeze(d.frames) }
    layers.clear()
    for (const [id, layer] of Object.entries(d.nodes)) layers.set(id, layer)
    children = buildChildIndex(layers)
    frameOfLayer.clear()
    linkHolder.clear()
    const frameOf = (id: string): string => {
      const known = frameOfLayer.get(id)
      if (known !== undefined) return known
      const parentId = (layers.get(id) as Layer).parentId
      return Object.hasOwn(d.frames, parentId) ? parentId : frameOf(parentId)
    }
    for (const [id, layer] of layers) holdLink(id, layer, frameOf(id))
    layersRepaired =
      rawNodes.size !== layers.size ||
      [...layers].some(([id, layer]) => {
        const raw = rawNodes.get(id)
        return raw?.parentId !== layer.parentId || raw.index !== layer.index || raw.link !== layer.link
      })
  }

  /**
   * Takes in an edit by checking only the layers it touched. Returns false, having changed
   * nothing, when repair has to decide instead: something is invalid, a layer changed type, a
   * move would put a layer inside itself or into another frame, a removed layer leaves children
   * behind, a layer takes a link id its frame holds, or the last whole read repaired a layer,
   * which a later change can undo.
   */
  function readChanges(): boolean {
    if (!head) return false
    const frames = head.frames
    const staged = new Map<string, Layer>()
    const removed = new Set<string>()
    let structural = false
    for (const id of dirtyNodes) {
      const was = layers.get(id)
      loadNode(id)
      const raw = rawNodes.get(id)
      if (!raw) {
        if (was) removed.add(id)
        continue
      }
      if (was && raw.type !== was.type) return false
      const parsed = parseLayer(raw)
      if (!parsed.success) return false
      staged.set(id, parsed.layer)
      if (!was || was.parentId !== parsed.layer.parentId || was.link !== parsed.layer.link) structural = true
    }
    if (removed.size > 0) structural = true
    if (structural && layersRepaired) return false

    // The layers as they will be: what a parent check or a walk up to the frame sees.
    const next = (id: string) => staged.get(id) ?? (removed.has(id) ? undefined : layers.get(id))
    /** The frame and link of each staged layer that came, moved or changed its link id. */
    const relinks = new Map<string, string>()
    const claimed = new Map<string, Map<string, string>>()
    for (const [id, layer] of staged) {
      const was = layers.get(id)
      const moved = !was || was.parentId !== layer.parentId
      if (!moved && was.link === layer.link) continue
      if (moved) {
        if (Object.hasOwn(frames, id)) return false
        if (!Object.hasOwn(frames, layer.parentId)) {
          const parent = next(layer.parentId)
          if (!parent || !canHold(parent.type, layer.type)) return false
        }
      }
      let up = layer.parentId
      for (let steps = 0; !Object.hasOwn(frames, up); steps++) {
        const above = next(up)
        if (up === id || !above || steps > layers.size + staged.size) return false
        up = above.parentId
      }
      // Moving to another frame takes everything under the layer along: repair decides.
      if (was && up !== frameOfLayer.get(id)) return false
      const holder = linkHolder.get(up)?.get(layer.link)
      if (holder !== undefined && holder !== id) return false
      const claims = claimed.get(up) ?? new Map<string, string>()
      claimed.set(up, claims)
      if (claims.has(layer.link)) return false
      claims.set(layer.link, id)
      relinks.set(id, up)
    }
    for (const id of removed) {
      for (const child of children.get(id) ?? []) if (next(child)?.parentId === id) return false
    }

    // Every list that changes is a new array, so a list handed out before stays as it was.
    const lists = new Map<string, string[]>()
    const listOf = (parentId: string) => {
      let list = lists.get(parentId)
      if (!list) {
        list = [...(children.get(parentId) ?? [])]
        lists.set(parentId, list)
      }
      return list
    }
    const drop = (parentId: string, id: string) => {
      const list = listOf(parentId)
      const at = list.indexOf(id)
      if (at !== -1) list.splice(at, 1)
    }
    for (const id of removed) {
      const layer = layers.get(id) as Layer
      drop(layer.parentId, id)
      releaseLink(id, layer)
      layers.delete(id)
    }
    for (const [id, layer] of staged) {
      const was = layers.get(id)
      if (!was || was.parentId !== layer.parentId) {
        if (was) drop(was.parentId, id)
        listOf(layer.parentId).push(id)
      } else if (was.index !== layer.index) {
        listOf(layer.parentId)
      }
      const frameId = relinks.get(id)
      if (frameId !== undefined) {
        if (was) releaseLink(id, was)
        holdLink(id, layer, frameId)
      }
      layers.set(id, layer)
    }
    const order = siblingOrder(layers)
    for (const [parentId, list] of lists) {
      if (list.length > 0) children.set(parentId, list.sort(order))
      else children.delete(parentId)
    }
    for (const id of removed) if (!layers.has(id)) children.delete(id)
    return true
  }

  /** Brings the validated design up to date with the document. Not inside a transaction: the changes so far aren't reported yet. */
  function refresh(onRepair?: (repairs: string[]) => void) {
    if (doc._transaction) return
    if (!whole && dirtyNodes.size === 0) return
    if (whole || !readChanges()) readWhole(onRepair)
    whole = false
    dirtyNodes.clear()
  }

  // The document as it is when the view opens.
  for (const id of r.nodes.keys()) loadNode(id)

  // Every change is seen before any observer of the document runs, so an observer that reads the
  // view gets the new design. The changed types name the touched layers.
  const heads = new Set<unknown>([r.meta, r.pages, r.frames])
  const onChange = (tr: Y.Transaction) => {
    for (const [changed, keys] of tr.changed) {
      const type: unknown = changed
      if (heads.has(type)) {
        whole = true
        continue
      }
      if (type === r.nodes) {
        for (const id of keys) if (id !== null) dirtyNodes.add(id)
        continue
      }
      // A change inside a layer or a head map: walk up to the root map it hangs from.
      let item = changed._item
      while (item && item.parent !== r.nodes && !heads.has(item.parent))
        item = (item.parent as Y.AbstractType<unknown>)._item
      if (!item) continue
      if (item.parent === r.nodes && typeof item.parentSub === 'string') dirtyNodes.add(item.parentSub)
      else whole = true
    }
  }
  doc.on('beforeObserverCalls', onChange)
  registerChildIndex(nodes, (parentId) => {
    refresh()
    return children.get(parentId) ?? []
  })

  function destroy() {
    doc.off('beforeObserverCalls', onChange)
  }

  return { read, destroy }
}

/**
 * A plain-looking record over a map that can't be changed through: setting, defining or deleting
 * a key fails, which throws in strict mode code. Keys and values always come from `entries()`.
 */
function readOnlyRecord<V>(entries: () => ReadonlyMap<string, V>): Record<string, V> {
  return new Proxy({} as Record<string, V>, {
    get: (target, key) => {
      if (typeof key === 'string') {
        const map = entries()
        if (map.has(key)) return map.get(key)
      }
      return Reflect.get(target, key) as unknown
    },
    has: (_, key) => typeof key === 'string' && entries().has(key),
    ownKeys: () => [...entries().keys()],
    getOwnPropertyDescriptor: (_, key) => {
      const map = entries()
      if (typeof key !== 'string' || !map.has(key)) return undefined
      return { value: map.get(key), writable: false, enumerable: true, configurable: true }
    },
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
    setPrototypeOf: () => false,
  })
}
