import { byCodeUnits, canHold, LinkId } from '@dazbee/schema'

type Json = Record<string, unknown>
type NodeJson = { parentId: string; link?: unknown } & Json
type Snapshot = { pages: Record<string, unknown>; frames: Record<string, unknown>; nodes: Record<string, Json> }

/** The longest part of a layer id a new link id keeps: a link id's longest, less room for `-<n>` up to 999. */
const LINK_STEM = (LinkId.maxLength ?? 64) - 4

/** The page a design with no page left gets; the page commands write it with their next edit. */
const EMPTY_PAGE = { name: 'Page 1', order: 'a0' }

const field = (value: unknown, key: string) => (value as Json | undefined)?.[key]
const byOrder = ([a, x]: [string, unknown], [b, y]: [string, unknown]) =>
  byCodeUnits(String(field(x, 'order')), String(field(y, 'order'))) || byCodeUnits(a, b)

/**
 * Concurrent edits can merge into a state no single command allows: two tabs each deleting one
 * of the last two pages, a frame added to a page another tab deleted, a layer added to a frame or
 * group another tab deleted, two moves that put layers inside each other (whose links may then
 * reach another page), two layers of one frame with one link id, a key an undo left unset. These rules turn any merged state into a valid one.
 * They read only the merged state, so every device repairs it the same way, and they never write:
 * the next edit carries on from the repaired view. The snapshot is not changed either: a repaired
 * layer is a copy, and every other object comes back as it was, so a reader can keep what it
 * validated for them.
 */
export function repair<S extends Snapshot>(snapshot: S): { snapshot: S; repairs: string[] } {
  let s = snapshot
  const repairs: string[] = []

  // 0. A design keeps a page: with none left it gets one empty page, at an id no frame or layer has.
  if (Object.keys(s.pages).length === 0) {
    let id = 'page'
    for (let n = 2; Object.hasOwn(s.frames, id) || Object.hasOwn(s.nodes, id); n++) id = `page-${n}`
    repairs.push(`no page was left; added the empty page "${id}"`)
    s = { ...s, pages: { [id]: EMPTY_PAGE } }
  }

  // 1. A frame whose page is gone goes: a tab added it while another deleted the page.
  const frames = Object.entries(s.frames).filter(([id, frame]) => {
    const pageId = String(field(frame, 'pageId'))
    if (Object.hasOwn(s.pages, pageId)) return true
    repairs.push(`dropped frame "${id}", whose page "${pageId}" is gone`)
    return false
  })
  const isFrame = new Set(frames.map(([id]) => id))
  const framesDropped = frames.length !== Object.keys(s.frames).length

  // 2. Layers that can't be read at all go, before anyone looks for parents among them.
  const nodes = new Map<string, NodeJson>()
  for (const id of Object.keys(s.nodes).sort(byCodeUnits)) {
    const node = s.nodes[id] as NodeJson
    if (typeof node.type !== 'string' || typeof node.props !== 'object' || node.props === null) {
      repairs.push(`dropped "${id}", which lost its type or props`)
    } else {
      nodes.set(id, node)
    }
  }
  const change = (id: string, patch: Json) => nodes.set(id, { ...(nodes.get(id) as NodeJson), ...patch })

  // 3. A layer that lost its index goes to the back.
  for (const [id, node] of nodes) {
    if (typeof node.index === 'string') continue
    repairs.push(`"${id}" lost its index; put at the back`)
    change(id, { index: 'a0' })
  }

  // 4. A cycle breaks at its smallest id, so all devices pick the same layer. It has no frame to
  // go back to, so it goes to the top of the first frame there is.
  /** The layers a broken cycle moved into a frame. */
  const outOfCycles = new Set<string>()
  const fallback = Object.entries(s.pages)
    .sort(byOrder)
    .map(([pageId]) => frames.filter(([, frame]) => field(frame, 'pageId') === pageId).sort(byOrder)[0]?.[0])
    .find((id) => id !== undefined)
  for (const id of [...nodes.keys()]) {
    const path: string[] = []
    for (let up: string | undefined = id; up !== undefined && nodes.has(up); up = nodes.get(up)?.parentId) {
      const at = path.indexOf(up)
      if (at === -1) {
        path.push(up)
        continue
      }
      const cycle = path.slice(at).sort(byCodeUnits)
      if (fallback === undefined) {
        for (const inside of cycle) {
          repairs.push(`dropped "${inside}", which was inside itself, with no frame to move it to`)
          nodes.delete(inside)
        }
      } else {
        repairs.push(`"${cycle[0]}" was inside itself; moved to frame "${fallback}"`)
        change(cycle[0] as string, { parentId: fallback })
        outOfCycles.add(cycle[0] as string)
      }
      break
    }
  }

  // The frame each layer's chain of parents ends at, if it ends at one. Moving a layer to the top
  // of the frame its chain ends at changes no layer's frame.
  const frameOf = new Map<string, string | undefined>()
  const frameOfLayer = (id: string): string | undefined => {
    if (frameOf.has(id)) return frameOf.get(id)
    const parentId = nodes.get(id)?.parentId as string
    const frame = isFrame.has(parentId) ? parentId : nodes.has(parentId) ? frameOfLayer(parentId) : undefined
    frameOf.set(id, frame)
    return frame
  }

  // 5. A layer whose parent can't hold it goes to the top of the frame that parent is in.
  for (const [id, node] of nodes) {
    const parent = nodes.get(node.parentId)
    if (!parent || canHold(String(parent.type), String(node.type))) continue
    const frame = frameOfLayer(node.parentId)
    if (frame === undefined) continue
    repairs.push(`"${id}" can't be held by "${node.parentId}"; moved to frame "${frame}"`)
    change(id, { parentId: frame })
  }

  // 6. A layer in no frame goes, with everything under it: a tab added it to a frame or group
  // that another tab deleted. The delete wins; its undo brings the layer back.
  for (const id of [...nodes.keys()]) {
    if (frameOfLayer(id) !== undefined) continue
    repairs.push(`dropped "${id}", which is in no frame`)
    nodes.delete(id)
  }

  // 7. A broken cycle may bring layers from another page into the fallback frame, while their
  // linked copies stay there. So each layer it brought keeps its link only when no other layer
  // holds it, else takes its own id, or that id numbered from 2, whichever no layer holds.
  const holders = new Map<string, number>()
  for (const node of nodes.values()) holders.set(String(node.link), (holders.get(String(node.link)) ?? 0) + 1)
  const cameOut = (id: string) => {
    const seen = new Set<string>()
    for (
      let up: string | undefined = id;
      up !== undefined && nodes.has(up) && !seen.has(up);
      up = nodes.get(up)?.parentId
    ) {
      if (outOfCycles.has(up)) return true
      seen.add(up)
    }
    return false
  }
  for (const id of [...nodes.keys()].filter(cameOut).sort(byCodeUnits)) {
    const link = String(nodes.get(id)?.link)
    if ((holders.get(link) ?? 0) < 2) continue
    let fresh = id
    for (let n = 2; holders.has(fresh); n++) fresh = `${id.slice(0, LINK_STEM)}-${n}`
    holders.set(link, (holders.get(link) ?? 1) - 1)
    holders.set(fresh, 1)
    repairs.push(
      `"${id}" came out of a cycle with link "${link}", which another layer holds; its link is now "${fresh}"`,
    )
    change(id, { link: fresh })
  }

  // 8. No frame holds a link id twice: the holder whose id sorts first keeps it, and each other
  // one takes its own id, or that id numbered from 2, whichever its frame doesn't hold yet.
  const held = new Map<string, Map<string, string[]>>()
  for (const [id, node] of nodes) {
    const frame = frameOfLayer(id) as string
    const links = held.get(frame) ?? new Map<string, string[]>()
    held.set(frame, links)
    const link = String(node.link)
    links.set(link, [...(links.get(link) ?? []), id])
  }
  const relinked: [string, string, string, string][] = []
  for (const [frame, links] of held) {
    for (const [link, holders] of links) {
      if (holders.length < 2) continue
      const [keeper, ...others] = holders
      for (const id of others) relinked.push([id, link, frame, keeper as string])
    }
  }
  for (const [id, link, frame, keeper] of relinked.sort(([a], [b]) => byCodeUnits(a, b))) {
    const links = held.get(frame) as Map<string, string[]>
    let fresh = id
    for (let n = 2; links.has(fresh); n++) fresh = `${id.slice(0, LINK_STEM)}-${n}`
    links.set(fresh, [id])
    repairs.push(`"${id}" held link "${link}" in frame "${frame}" with "${keeper}"; its link is now "${fresh}"`)
    change(id, { link: fresh })
  }

  if (repairs.length === 0) return { snapshot: s, repairs }
  return {
    snapshot: {
      ...s,
      frames: framesDropped ? Object.fromEntries(frames) : s.frames,
      nodes: Object.fromEntries(nodes),
    },
    repairs,
  }
}
