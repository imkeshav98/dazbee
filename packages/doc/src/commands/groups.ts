import { nanoid } from 'nanoid'
import { z } from 'zod'

import { AnyScope, BooleanOp, canHold, formatIdOf, Layer, type Layer as LayerT, NodeId, Scope } from '@dazbee/schema'

import { ancestorsOf, childrenOf, descendants, isInside } from '../children.ts'
import { DELETED, overrideKey, toYNode } from '../design-doc.ts'
import { boundsOf, centreOf, normalAngle, round, turn } from '../geometry.ts'
import { idProblem, lockProblem, parentProblem } from './checks.ts'
import { type CommandContext, defineCommand } from './define.ts'
import { mergedProps, Placement } from './placement.ts'
import { depthOf, indexBetween } from './tree.ts'

/**
 * Where layers are drawn, by scope, as the caller sees them: inside an auto layout frame the flow
 * places them, not their stored boxes, and only the renderer lays the flow out.
 */
const DrawnBoxes = z.record(
  z.string().refine((s) => formatIdOf(s) !== undefined, 'drawn boxes are by format:<id>'),
  z.record(NodeId, z.object({ x: z.number(), y: z.number(), width: z.number().min(0), height: z.number().min(0) })),
)
type DrawnBoxes = z.infer<typeof DrawnBoxes>

/**
 * Wraps layers that share a parent in a new group where the topmost of them was, without moving
 * anything on screen. The group's box hugs them in each format. Returns the group's id.
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
 * Wraps layers that share a parent in a new frame where the topmost of them was, without changing
 * anything on screen: its box hugs them in each format, it has no fill, and it doesn't clip, so a
 * stroke or shadow past a layer's box still shows. Returns the frame's id.
 */
export const nodeFrame = defineCommand({
  name: 'node.frame',
  input: z.object({
    ids: NodeId.array().min(1),
    id: NodeId.optional(),
    name: z.string().default('Frame'),
    drawn: DrawnBoxes.optional(),
  }),
  check: (ctx, { ids, id }) => wrapProblem(ctx, ids, id, 'frame'),
  apply: (ctx, { ids, id = nanoid(), name, drawn }) =>
    wrap(ctx, ids, id, { type: 'frame', name, props: { clip: false } }, drawn),
})

/**
 * Moves layers into a frame beside them, as when a frame is drawn around them, without moving them
 * on screen. The frame was drawn in one format (`scope`); in every other scope it is placed around
 * the layers as they are there, as far from them and as large against them as where it was drawn,
 * so it holds them in every format. They keep their order inside it.
 */
export const nodeEnclose = defineCommand({
  name: 'node.enclose',
  input: z.object({ id: NodeId, ids: NodeId.array().min(1), scope: Scope }),
  check: ({ design }, { id, ids, scope }) => {
    const frame = design.nodes[id]
    if (!frame) return `no layer "${id}"`
    if (frame.type !== 'frame') return `"${id}" is a ${frame.type}, not a frame`
    if (!design.formats[formatIdOf(scope) ?? '']) return `no format "${formatIdOf(scope) ?? scope}"`
    for (const layer of ids) {
      const node = design.nodes[layer]
      if (!node) return `no layer "${layer}"`
      if (layer === id) return `can't put "${id}" inside itself`
      if (node.parentId !== frame.parentId) return `"${layer}" is not beside "${id}"`
      if (!canHold('frame', node.type)) return `a frame can't hold a ${node.type}`
    }
    return undefined
  },
  apply: ({ r, design }, { id, ids, scope }) => {
    const place = new Placement(design)
    const drawn = place.get(scope, id)
    const was = boundsOf(ids.map((layer) => place.get(scope, layer)))
    for (const other of place.scopes) {
      if (other === scope) continue
      const now = boundsOf(ids.map((layer) => place.get(other, layer)))
      const kx = was.width > 0 ? now.width / was.width : 1
      const ky = was.height > 0 ? now.height / was.height : 1
      place.set(other, id, {
        x: now.x + (drawn.x - was.x) * kx,
        y: now.y + (drawn.y - was.y) * ky,
        width: drawn.width * kx,
        height: drawn.height * ky,
      })
    }
    place.write(r)
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
 * Takes the layers out of groups or booleans and removes them, without moving anything on
 * screen: a turned group's turn goes into each layer it held, and a group hidden in a format
 * hides them there. Shapes out of a boolean show their own paints again. The layers take the group's place among its siblings. Returns their ids, in order.
 */
export const nodeUngroup = defineCommand({
  name: 'node.ungroup',
  input: z.object({ ids: NodeId.array().min(1) }),
  check: ({ design }, { ids }) => {
    for (const id of ids) {
      const node = design.nodes[id]
      if (!node) return `no layer "${id}"`
      if (node.type !== 'group' && node.type !== 'boolean') return `"${id}" is a ${node.type}, not a group or boolean`
      const locked = lockProblem(id, node, 'delete')
      if (locked) return locked
    }
    return undefined
  },
  apply: ({ r, design }, { ids }) => {
    const freed: string[] = []
    const groups = ids.filter((id) => !ids.some((other) => other !== id && isInside(design, id, other)))
    const place = new Placement(design)
    for (const id of groups) {
      const kids = childrenOf(design, id).map(([child]) => child)
      for (const scope of place.scopes) {
        const group = place.get(scope, id)
        for (const kid of kids) {
          const was = place.get(scope, kid)
          if (group.rotation !== 0) {
            const c = centreOf(was)
            const to = turn(c, centreOf(group), group.rotation)
            const dx = to.x - c.x
            const dy = to.y - c.y
            place.set(scope, kid, {
              x: was.x + dx,
              y: was.y + dy,
              rotation: normalAngle(was.rotation + group.rotation),
            })
            for (const inner of descendants(design, kid)) {
              const at = place.get(scope, inner)
              place.set(scope, inner, { x: at.x + dx, y: at.y + dy })
            }
          }
          if (!group.visible) place.set(scope, kid, { visible: false })
        }
      }
    }
    place.write(r)
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
 * Fits groups and booleans to what they hold, in every format: each named one, and every one the
 * named layers are in, innermost first. A turned group's layers shift with its new centre so nothing
 * moves on screen. The editor runs it after a change to layers inside a group, in the same step.
 */
export const nodeHug = defineCommand({
  name: 'node.hug',
  input: z.object({ ids: NodeId.array().min(1) }),
  check: ({ design }, { ids }) => ids.map((id) => (design.nodes[id] ? undefined : `no layer "${id}"`)).find(Boolean),
  apply: ({ r, design }, { ids }) => {
    const groups = new Set<string>()
    for (const id of ids) {
      for (const up of ancestorsOf(design, id)) {
        const type = design.nodes[up]?.type
        if (type === 'group' || type === 'boolean') groups.add(up)
      }
    }
    const place = new Placement(design)
    for (const id of [...groups].sort((a, b) => depthOf(design, b) - depthOf(design, a))) {
      const kids = childrenOf(design, id).map(([child]) => child)
      if (kids.length === 0) continue
      for (const scope of place.scopes) {
        const group = place.get(scope, id)
        const fit = boundsOf(kids.map((kid) => place.get(scope, kid)))
        // Turned about its new centre instead of the old one, the group would draw its layers
        // elsewhere; moving them and the box by d keeps every one where it was.
        const v = { x: centreOf(group).x - centreOf(fit).x, y: centreOf(group).y - centreOf(fit).y }
        const turned = turn(v, { x: 0, y: 0 }, group.rotation)
        const d = { x: v.x - turned.x, y: v.y - turned.y }
        const next = { x: fit.x + d.x, y: fit.y + d.y, width: fit.width, height: fit.height }
        // Within what rounding to hundredths leaves, it already fits: fitting again changes nothing.
        if ((['x', 'y', 'width', 'height'] as const).every((k) => Math.abs(next[k] - group[k]) < 0.02)) continue
        place.set(scope, id, next)
        if (Math.hypot(d.x, d.y) < 0.005) continue
        for (const inner of descendants(design, id)) {
          const at = place.get(scope, inner)
          place.set(scope, inner, { x: at.x + d.x, y: at.y + d.y })
        }
      }
    }
    place.write(r)
  },
})

/** What wrapping layers in a new group, frame or boolean checks: they exist, share a parent, and the parent can hold the wrapper. */
function wrapProblem(ctx: CommandContext, ids: string[], id: string | undefined, type: 'group' | 'frame' | 'boolean') {
  const { design } = ctx
  const missing = ids.map((layer) => (design.nodes[layer] ? undefined : `no layer "${layer}"`)).find(Boolean)
  if (missing) return missing
  if (new Set(ids.map((layer) => design.nodes[layer]?.parentId)).size > 1)
    return `layers to ${type === 'boolean' ? 'combine' : type} must share a parent`
  const parentId = design.nodes[ids[0] as string]?.parentId as string
  return parentProblem(design, parentId, type) ?? idProblem(ctx, id)
}

/**
 * Puts layers that share a parent inside a new layer of `type` where the topmost of them was,
 * without moving anything on screen: its box hugs them in each format. Layers with `drawn` boxes
 * are first stored where they are drawn, what they hold moved with them, so the new layer hugs them
 * as drawn and takes the room they took in a flow. In a format where they all keep where they are
 * in a flow, the new layer keeps where it is there too.
 */
function wrap(
  { r, design }: CommandContext,
  ids: string[],
  id: string,
  layer: { type: 'group' | 'frame' | 'boolean'; name: string; props?: Record<string, unknown> },
  drawn: DrawnBoxes = {},
) {
  const parentId = design.nodes[ids[0] as string]?.parentId as string
  const inside = childrenOf(design, parentId).filter(([child]) => ids.includes(child))
  const top = inside.at(-1)?.[1] as LayerT
  const place = new Placement(design)
  for (const scope of place.scopes) {
    for (const [child, box] of Object.entries(drawn[scope] ?? {})) {
      if (!ids.includes(child)) continue
      const was = place.get(scope, child)
      place.set(scope, child, box)
      // What it holds is drawn where the flow put it too: it moves by as much.
      for (const inner of descendants(design, child)) {
        const at = place.get(scope, inner)
        place.set(scope, inner, { x: at.x + box.x - was.x, y: at.y + box.y - was.y })
      }
    }
  }
  place.write(r)
  const keptIn = (scope: AnyScope) =>
    inside.every(([child]) => (mergedProps(design, scope, child) as { absolute?: boolean }).absolute)
  const absolute = keptIn('base')
  const boxIn = (scope: AnyScope) => boundsOf(inside.map(([child]) => place.get(scope, child)))
  const base = boxIn('base')
  const box = { x: round(base.x), y: round(base.y), width: round(base.width), height: round(base.height) }
  r.nodes.set(
    id,
    toYNode(
      Layer.parse({
        type: layer.type,
        name: layer.name,
        parentId,
        index: top.index,
        props: { ...layer.props, ...box, ...(absolute ? { absolute } : {}) },
      }),
    ),
  )
  for (const scope of place.scopes) {
    if (scope === 'base') continue
    const b = boxIn(scope)
    for (const [path, value] of Object.entries({ x: b.x, y: b.y, width: b.width, height: b.height })) {
      if (Math.abs(round(value) - box[path as keyof typeof box]) >= 0.005)
        r.overrides.set(overrideKey(scope, id, path), round(value))
    }
    if (keptIn(scope) !== absolute) r.overrides.set(overrideKey(scope, id, 'absolute'), keptIn(scope))
  }
  // Their indexes already order them; they only change parent.
  for (const [child] of inside) r.nodes.get(child)?.set('parentId', id)
  return id
}
