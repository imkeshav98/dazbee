// What auto layout decides about a layer: whether a box lays out what it holds, in a row or a
// column, and which layers its flow places.
import { ancestorsOf, childrenOf } from '@dazbee/doc'
import type { Design, Layer } from '@dazbee/schema'

/** A box's auto layout, as the schema has it. */
export type AutoLayoutOf = NonNullable<Extract<Layer, { type: 'box' }>['props']['layout']>

/** A layer's value of one property. */
export const propIn = (id: string, key: string, from: Design) =>
  (from.nodes[id]?.props as Readonly<Record<string, unknown>> | undefined)?.[key]
/** Whether a flow runs in a row (not a column). */
export const rowIn = (id: string, from: Design) =>
  (propIn(id, 'layout', from) as AutoLayoutOf | undefined)?.direction !== 'column'
/** Whether a box lays out what it holds with auto layout. */
export const layoutIn = (id: string, from: Design) =>
  from.nodes[id]?.type === 'box' && propIn(id, 'layout', from) !== undefined
/** Whether a layer is in an auto layout box's flow, so the box places it. */
export const inFlow = (id: string, from: Design) =>
  layoutIn(from.nodes[id]?.parentId ?? '', from) && !propIn(id, 'absolute', from)

/** Whether auto layout sizes or places a layer: an auto layout box, or a layer anywhere inside one. */
export function laidOut(id: string, from: Design) {
  for (const up of ancestorsOf(from, id)) {
    const node = from.nodes[up]
    if (node?.type === 'box' && node.props.layout) return true
  }
  return false
}
/** Whether auto layout places a layer that is inside `root`, with whatever between them it is part of. */
export function placedInside(id: string, root: string, from: Design) {
  for (const up of ancestorsOf(from, id)) {
    if (up === root) break
    if (inFlow(up, from)) return true
  }
  return false
}

/** The flow siblings of layers in an auto layout box, without them, in the box's order. */
export function flowSiblings(parentId: string, moving: string[], from: Design) {
  return childrenOf(from, parentId)
    .map(([id]) => id)
    .filter((id) => !moving.includes(id) && inFlow(id, from))
}
