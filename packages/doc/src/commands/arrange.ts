// Commands that move layers to another parent or another place among their siblings, copy them, and place a
// tree of them.
import { nanoid } from 'nanoid'
import { z } from 'zod'

import { type Design, Layer, type Layer as LayerT, LayerTree, NodeId, PageId } from '@dazbee/schema'

import { ancestorsOf, childrenOf, descendants, isInside } from '../children.ts'
import { toYNode } from '../design-doc.ts'
import { centreOf, normalAngle, turn } from '../geometry.ts'
import { missingLayer, parentProblem } from './checks.ts'
import { type CommandContext, defineCommand } from './define.ts'
import { Placement } from './placement.ts'
import { copyLayers, indexBetween } from './tree.ts'

export const nodeMove = defineCommand({
  name: 'node.move',
  /** `keepDrawn` false leaves the layer's box as stored, for a caller that places it itself. */
  input: z.object({
    id: NodeId,
    parentId: z.union([PageId, NodeId]),
    before: NodeId.optional(),
    keepDrawn: z.boolean().default(true),
  }),
  check: ({ design }, { id, parentId, before }) => {
    const node = design.nodes[id]
    if (!node) return missingLayer(design, [id])
    const problem = parentProblem(design, parentId, node.type)
    if (problem) return problem
    if (isInside(design, parentId, id)) return `can't move "${id}" inside itself`
    if (before === id) return `can't place "${id}" before itself`
    if (before && design.nodes[before]?.parentId !== parentId) return `"${before}" is not under "${parentId}"`
    return undefined
  },
  apply: ({ r, design }, { id, parentId, before, keepDrawn }) => {
    const siblings = childrenOf(design, parentId).filter(([sibling]) => sibling !== id)
    const at = before ? siblings.findIndex(([sibling]) => sibling === before) : siblings.length
    const index = indexBetween(siblings[at - 1]?.[1].index ?? null, siblings[at]?.[1].index ?? null)
    if (keepDrawn) keepDrawnPlace(r, design, id, parentId)
    const node = r.nodes.get(id)
    node?.set('parentId', parentId)
    node?.set('index', index)
  },
})

/**
 * Brings layers forward or back one step, or to the front or back, among their siblings. Only the
 * moved layers get new indexes, so a concurrent change to the others merges.
 */
export const nodeReorder = defineCommand({
  name: 'node.reorder',
  input: z.object({ ids: NodeId.array().min(1), to: z.enum(['forward', 'backward', 'front', 'back']) }),
  check: ({ design }, { ids }) => missingLayer(design, ids),
  apply: ({ r, design }, { ids, to }) => {
    const moving = new Set(ids)
    const parents = new Set(ids.map((id) => design.nodes[id]?.parentId as string))
    for (const parentId of parents) {
      const before = childrenOf(design, parentId)
      const indexOf = new Map(before.map(([id, node]) => [id, node.index]))
      const after = restack(
        before.map(([id]) => id),
        moving,
        to,
      )
      // Runs of moved layers get indexes between the unmoved neighbours around them, unless the
      // ones they have already sit in order there.
      for (let i = 0; i < after.length; i++) {
        if (!moving.has(after[i] as string)) continue
        let end = i
        while (end + 1 < after.length && moving.has(after[end + 1] as string)) end++
        const run = after.slice(i, end + 1)
        const low = i > 0 ? (indexOf.get(after[i - 1] as string) ?? null) : null
        const high = end + 1 < after.length ? (indexOf.get(after[end + 1] as string) ?? null) : null
        const current = run.map((id) => indexOf.get(id) as string)
        const fits =
          current.every((index, k) => (k === 0 ? low === null || index > low : index > (current[k - 1] as string))) &&
          (high === null || (current.at(-1) as string) < high)
        if (!fits) {
          let at = low
          for (const id of run) {
            at = indexBetween(at, high)
            indexOf.set(id, at)
            r.nodes.get(id)?.set('index', at)
          }
        }
        i = end
      }
    }
  },
})

/** Copies layers in place, each right above its original. Returns the copies' ids, in order. */
export const nodeDuplicate = defineCommand({
  name: 'node.duplicate',
  input: z.object({ ids: NodeId.array().min(1) }),
  check: ({ design }, { ids }) => missingLayer(design, ids),
  apply: ({ r, design }, { ids }) => {
    // A layer inside another one being copied comes along with it.
    const roots = ids.filter((id) => !ids.some((other) => other !== id && isInside(design, id, other)))
    const copies = copyLayers(r, design, roots, (root) => {
      const node = design.nodes[root] as LayerT
      const siblings = childrenOf(design, node.parentId)
      const next = siblings[siblings.findIndex(([id]) => id === root) + 1]?.[1].index ?? null
      return { parentId: node.parentId, index: indexBetween(node.index, next) }
    })
    return roots.map((root) => copies.get(root) as string)
  },
})

/**
 * Places a tree of layers, such as the clipboard's, in a page or container (#49): every layer gets
 * a fresh id, the roots go on top in their order, and everything moves by `dx`, `dy`. Placing the
 * same tree twice gives two copies. Returns the new roots' ids, bottom to top.
 */
export const designPlace = defineCommand({
  name: 'design.place',
  input: z.object({
    parentId: z.union([PageId, NodeId]),
    tree: LayerTree,
    dx: z.number().default(0),
    dy: z.number().default(0),
  }),
  check: ({ design }, { parentId, tree }) =>
    tree.roots.map((root) => parentProblem(design, parentId, tree.nodes[root]?.type ?? '')).find(Boolean),
  apply: ({ r, design }, { parentId, tree, dx, dy }) => {
    const ids = new Map(Object.keys(tree.nodes).map((id) => [id, nanoid()]))
    let index = childrenOf(design, parentId).at(-1)?.[1].index ?? null
    const placed = new Map<string, { parentId: string; index: string }>()
    for (const root of tree.roots) {
      index = indexBetween(index, null)
      placed.set(root, { parentId, index })
    }
    for (const [old, node] of Object.entries(tree.nodes)) {
      const where = placed.get(old) ?? { parentId: ids.get(node.parentId) as string, index: node.index }
      const props = { ...node.props, x: node.props.x + dx, y: node.props.y + dy }
      r.nodes.set(ids.get(old) as string, toYNode(Layer.parse({ ...node, ...where, props })))
    }
    return tree.roots.map((root) => ids.get(root) as string)
  },
})

/**
 * Keeps a layer where it is drawn as it moves under `parentId`, in every format: each layer it sits
 * in turns what it holds around its own centre, so the layer takes the turns it leaves and gives
 * back the ones it enters, and what it holds moves with it.
 */
function keepDrawnPlace(r: CommandContext['r'], design: Design, id: string, parentId: string) {
  const node = design.nodes[id]
  if (!node || node.parentId === parentId) return
  // A layer an auto layout places is drawn where the layout puts it, not where it is stored, and is
  // placed again by the one it enters: there is nothing to keep.
  const flows = (container: string) =>
    (design.nodes[container]?.props as { layout?: unknown } | undefined)?.layout !== undefined && !node.props.absolute
  if (flows(node.parentId) || flows(parentId)) return
  const leaving = ancestorsOf(design, node.parentId)
  const entering = ancestorsOf(design, parentId)
  const place = new Placement(design)
  for (const scope of place.scopes) {
    const was = place.get(scope, id)
    const from = centreOf(was)
    let drawn = from
    let turned = 0
    for (const up of leaving) {
      const outer = place.get(scope, up)
      drawn = turn(drawn, centreOf(outer), outer.rotation)
      turned += outer.rotation
    }
    for (const up of [...entering].reverse()) {
      const outer = place.get(scope, up)
      drawn = turn(drawn, centreOf(outer), -outer.rotation)
      turned -= outer.rotation
    }
    const dx = drawn.x - from.x
    const dy = drawn.y - from.y
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9 && normalAngle(turned) === 0) continue
    place.set(scope, id, { x: was.x + dx, y: was.y + dy, rotation: normalAngle(was.rotation + turned) })
    for (const inner of descendants(design, id)) {
      const at = place.get(scope, inner)
      place.set(scope, inner, { x: at.x + dx, y: at.y + dy })
    }
  }
  place.write(r)
}

/** Each sibling list after a z-order change, as ids bottom to top. */
function restack(order: string[], moving: Set<string>, to: 'forward' | 'backward' | 'front' | 'back') {
  if (to === 'front') return [...order.filter((id) => !moving.has(id)), ...order.filter((id) => moving.has(id))]
  if (to === 'back') return [...order.filter((id) => moving.has(id)), ...order.filter((id) => !moving.has(id))]
  const next = [...order]
  // One step past the nearest sibling that isn't moving; a moving block keeps its own order.
  const up = to === 'forward'
  for (let i = up ? next.length - 2 : 1; up ? i >= 0 : i < next.length; i += up ? -1 : 1) {
    const id = next[i] as string
    const j = up ? i + 1 : i - 1
    if (!moving.has(id) || moving.has(next[j] as string)) continue
    next[i] = next[j] as string
    next[j] = id
  }
  return next
}
