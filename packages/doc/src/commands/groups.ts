// Commands that put layers in a new group, box or boolean without moving them on screen, take them out
// again, and fit groups to what they hold. Each acts in the layers' own frame.
import { nanoid } from 'nanoid'
import { z } from 'zod'

import { BooleanOp, canHold, type Design, Layer, type Layer as LayerT, NodeId } from '@dazbee/schema'

import { ancestorsOf, childrenOf, descendants, isInside } from '../children.ts'
import { DELETED, toYNode } from '../design-doc.ts'
import { boundsOf, centreOf, normalAngle, round, turn } from '../geometry.ts'
import { boxPlan } from './box-plan.ts'
import { idProblem, lockProblem, missingLayer, parentProblem } from './checks.ts'
import { type CommandContext, defineCommand } from './define.ts'
import { depthOf, indexBetween } from './tree.ts'

/**
 * Where layers are drawn, by layer, as the caller sees them: inside an auto layout box the flow
 * places them, not their stored boxes, and only the renderer lays the flow out.
 */
const DrawnBoxes = z.record(
  NodeId,
  z.object({ x: z.number(), y: z.number(), width: z.number().min(0), height: z.number().min(0) }),
)
type DrawnBoxes = z.infer<typeof DrawnBoxes>

/**
 * Wraps layers that share a parent in a new group where the topmost of them was, without moving
 * anything on screen. The group's box hugs them. Returns the group's id.
 */
export const nodeGroup = defineCommand({
  name: 'node.group',
  input: z.object({
    ids: NodeId.array().min(1),
    id: NodeId.optional(),
    name: z.string().default('Group'),
    drawn: DrawnBoxes.optional(),
  }),
  check: (ctx, { ids, id }) => wrapProblem(ctx, ids, id, 'group'),
  apply: (ctx, { ids, id = nanoid(), name, drawn }) => wrap(ctx, ids, id, { type: 'group', name }, drawn),
})

/**
 * Wraps layers that share a parent in a new box where the topmost of them was, without changing
 * anything on screen: it hugs them, it has no fill, and it doesn't clip, so a stroke or shadow
 * past a layer's box still shows. Returns the box's id.
 */
export const nodeBox = defineCommand({
  name: 'node.box',
  input: z.object({
    ids: NodeId.array().min(1),
    id: NodeId.optional(),
    name: z.string().default('Box'),
    drawn: DrawnBoxes.optional(),
  }),
  check: (ctx, { ids, id }) => wrapProblem(ctx, ids, id, 'box'),
  apply: (ctx, { ids, id = nanoid(), name, drawn }) =>
    wrap(ctx, ids, id, { type: 'box', name, props: { clip: false } }, drawn),
})

/**
 * Moves layers into a box beside them, as when a box is drawn around them, without moving them
 * on screen. They keep their order inside it.
 */
export const nodeEnclose = defineCommand({
  name: 'node.enclose',
  input: z.object({ id: NodeId, ids: NodeId.array().min(1) }),
  check: ({ design }, { id, ids }) => {
    const box = design.nodes[id]
    if (!box) return missingLayer(design, [id])
    if (box.type !== 'box') return `"${id}" is a ${box.type}, not a box`
    for (const layer of ids) {
      const node = design.nodes[layer]
      if (!node) return missingLayer(design, [layer])
      if (layer === id) return `can't put "${id}" inside itself`
      if (node.parentId !== box.parentId) return `"${layer}" is not beside "${id}"`
      if (!canHold('box', node.type)) return `a box can't hold a ${node.type}`
    }
    return undefined
  },
  apply: ({ r }, { id, ids }) => {
    // Their indexes already order them; they only change parent.
    for (const layer of ids) r.nodes.get(layer)?.set('parentId', id)
  },
})

/**
 * Combines shapes that share a parent into a live boolean (#44) where the topmost of them was,
 * without moving them. It paints with the bottom shape's fills and strokes, the shape the others
 * add to or cut from. Returns the boolean's id.
 */
export const nodeBoolean = defineCommand({
  name: 'node.boolean',
  input: z.object({
    ids: NodeId.array().min(2),
    op: BooleanOp,
    id: NodeId.optional(),
    name: z.string().optional(),
    drawn: DrawnBoxes.optional(),
  }),
  check: (ctx, { ids, id }) => {
    for (const layer of ids) {
      const type = ctx.design.nodes[layer]?.type
      if (type && type !== 'graphic' && type !== 'boolean')
        return `"${layer}" is a ${type}; only shapes and booleans combine`
    }
    return wrapProblem(ctx, ids, id, 'boolean')
  },
  apply: (ctx, { ids, op, id = nanoid(), name, drawn }) => {
    const parentId = ctx.design.nodes[ids[0] as string]?.parentId as string
    const bottom = childrenOf(ctx.design, parentId).find(([child]) => ids.includes(child))?.[1]
    const paint =
      bottom && (bottom.type === 'graphic' || bottom.type === 'boolean')
        ? { fills: bottom.props.fills, strokes: bottom.props.strokes }
        : {}
    const names = { union: 'Union', subtract: 'Subtract', intersect: 'Intersect', exclude: 'Exclude' } as const
    return wrap(ctx, ids, id, { type: 'boolean', name: name ?? names[op], props: { op, ...paint } }, drawn)
  },
})

/**
 * Takes the layers out of groups, boxes or booleans and removes them, without moving anything on
 * screen: what a box's auto layout placed goes where `drawn` says it is drawn, a turned group's
 * turn goes into each layer it held, and a hidden group hides them. Shapes out of a boolean show
 * their own paints again. The layers take the group's place among its siblings. Returns their ids,
 * in order.
 */
export const nodeUngroup = defineCommand({
  name: 'node.ungroup',
  input: z.object({ ids: NodeId.array().min(1), drawn: DrawnBoxes.optional() }),
  check: ({ design }, { ids }) => {
    for (const id of ids) {
      const node = design.nodes[id]
      if (!node) return missingLayer(design, [id])
      if (node.type !== 'group' && node.type !== 'box' && node.type !== 'boolean')
        return `"${id}" is a ${node.type}, not a group, box or boolean`
      const locked = lockProblem(id, node, 'delete')
      if (locked) return locked
    }
    return undefined
  },
  apply: ({ r, design }, { ids, drawn = {} }) => {
    const freed: string[] = []
    const groups = ids.filter((id) => !ids.some((other) => other !== id && isInside(design, id, other)))
    const plan = boxPlan(design)
    placeDrawn(plan, design, drawn)
    for (const id of groups) {
      const group = plan.get(id)
      for (const [kid] of childrenOf(design, id)) {
        const was = plan.get(kid)
        if (group.rotation !== 0) {
          const c = centreOf(was)
          const to = turn(c, centreOf(group), group.rotation)
          const dx = to.x - c.x
          const dy = to.y - c.y
          plan.set(kid, { x: was.x + dx, y: was.y + dy, rotation: normalAngle(was.rotation + group.rotation) })
          for (const inner of descendants(design, kid)) {
            const at = plan.get(inner)
            plan.set(inner, { x: at.x + dx, y: at.y + dy })
          }
        }
        if (!group.visible) plan.set(kid, { visible: false })
      }
    }
    plan.write(r)
    for (const id of groups) {
      const group = design.nodes[id] as LayerT
      const siblings = childrenOf(design, group.parentId)
      const next = siblings[siblings.findIndex(([sibling]) => sibling === id) + 1]?.[1].index ?? null
      let at = group.index
      for (const [kid] of childrenOf(design, id)) {
        at = indexBetween(at, next)
        r.nodes.get(kid)?.set('parentId', group.parentId)
        r.nodes.get(kid)?.set('index', at)
        freed.push(kid)
      }
      r.nodes.get(id)?.set(DELETED, true)
    }
    return freed
  },
})

/**
 * Fits groups and booleans to what they hold: each named one, and every one the named layers are
 * in, innermost first. A turned group's layers shift with its new centre so nothing moves on
 * screen. The editor runs it after a change to layers inside a group, in the same step.
 */
export const nodeHug = defineCommand({
  name: 'node.hug',
  input: z.object({ ids: NodeId.array().min(1) }),
  check: ({ design }, { ids }) => missingLayer(design, ids),
  apply: ({ r, design }, { ids }) => {
    const groups = new Set<string>()
    for (const id of ids) {
      for (const up of ancestorsOf(design, id)) {
        const type = design.nodes[up]?.type
        if (type === 'group' || type === 'boolean') groups.add(up)
      }
    }
    const plan = boxPlan(design)
    for (const id of [...groups].sort((a, b) => depthOf(design, b) - depthOf(design, a))) {
      const kids = childrenOf(design, id).map(([child]) => child)
      if (kids.length === 0) continue
      const group = plan.get(id)
      const fit = boundsOf(kids.map((kid) => plan.get(kid)))
      // Turned about its new centre instead of the old one, the group would draw its layers
      // elsewhere; moving them and the box by d keeps every one where it was.
      const v = { x: centreOf(group).x - centreOf(fit).x, y: centreOf(group).y - centreOf(fit).y }
      const turned = turn(v, { x: 0, y: 0 }, group.rotation)
      const d = { x: v.x - turned.x, y: v.y - turned.y }
      const next = { x: fit.x + d.x, y: fit.y + d.y, width: fit.width, height: fit.height }
      // Within what rounding to hundredths leaves, it already fits: fitting again changes nothing.
      if ((['x', 'y', 'width', 'height'] as const).every((k) => Math.abs(next[k] - group[k]) < 0.02)) continue
      plan.set(id, next)
      if (Math.hypot(d.x, d.y) < 0.005) continue
      for (const inner of descendants(design, id)) {
        const at = plan.get(inner)
        plan.set(inner, { x: at.x + d.x, y: at.y + d.y })
      }
    }
    plan.write(r)
  },
})

/** What wrapping layers in a new group, box or boolean checks: they exist, share a parent, and the parent can hold the wrapper. */
function wrapProblem(ctx: CommandContext, ids: string[], id: string | undefined, type: 'group' | 'box' | 'boolean') {
  const { design } = ctx
  const missing = missingLayer(design, ids)
  if (missing) return missing
  if (new Set(ids.map((layer) => design.nodes[layer]?.parentId)).size > 1)
    return `layers to ${type === 'boolean' ? 'combine' : type} must share a parent`
  const parentId = design.nodes[ids[0] as string]?.parentId as string
  return parentProblem(design, parentId, type) ?? idProblem(ctx, id)
}

/**
 * Puts layers that share a parent inside a new layer of `type` where the topmost of them was,
 * without moving anything on screen: its box hugs them, and it gets a link id of its own. Layers
 * with `drawn` boxes are first stored where they are drawn, what they hold moved with them, so the
 * new layer hugs them as drawn and takes the room they took in a flow. When they all keep where
 * they are in a flow, the new layer keeps where it is too.
 */
function wrap(
  { r, design }: CommandContext,
  ids: string[],
  id: string,
  layer: { type: 'group' | 'box' | 'boolean'; name: string; props?: Record<string, unknown> },
  drawn: DrawnBoxes = {},
) {
  const parentId = design.nodes[ids[0] as string]?.parentId as string
  const inside = childrenOf(design, parentId).filter(([child]) => ids.includes(child))
  const top = inside.at(-1)?.[1] as LayerT
  const plan = boxPlan(design)
  placeDrawn(plan, design, Object.fromEntries(Object.entries(drawn).filter(([child]) => ids.includes(child))))
  plan.write(r)
  const absolute = inside.every(([, child]) => child.props.absolute)
  const hug = boundsOf(inside.map(([child]) => plan.get(child)))
  const box = { x: round(hug.x), y: round(hug.y), width: round(hug.width), height: round(hug.height) }
  r.nodes.set(
    id,
    toYNode(
      Layer.parse({
        type: layer.type,
        name: layer.name,
        parentId,
        link: nanoid(),
        index: top.index,
        props: { ...layer.props, ...box, ...(absolute ? { absolute } : {}) },
      }),
    ),
  )
  // Their indexes already order them; they only change parent.
  for (const [child] of inside) r.nodes.get(child)?.set('parentId', id)
  return id
}

/** Plans each layer at the box it is drawn in, as an auto layout box places it, and what it holds moved by as much. */
function placeDrawn(plan: ReturnType<typeof boxPlan>, design: Design, drawn: DrawnBoxes) {
  for (const [child, box] of Object.entries(drawn)) {
    if (!design.nodes[child]) continue
    const was = plan.get(child)
    plan.set(child, box)
    for (const inner of descendants(design, child)) {
      const at = plan.get(inner)
      plan.set(inner, { x: at.x + box.x - was.x, y: at.y + box.y - was.y })
    }
  }
}
