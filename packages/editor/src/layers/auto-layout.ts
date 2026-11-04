// What auto layout decides about a layer in one frame: whether a box lays out what it
// holds there, in a row or a column, and which layers its flow places.
import { ancestorsOf, childrenOf, mergedProps } from '@dazbee/doc'
import type { Design, Layer } from '@dazbee/schema'

import { type Frame, scope } from '../canvas/grid.ts'

/** A box's auto layout, as the schema has it. */
export type AutoLayoutOf = NonNullable<Extract<Layer, { type: 'box' }>['props']['layout']>

/** A layer's value of one property as a frame's format has it: the base with the format's override. */
export const propIn = (frame: Frame, id: string, key: string, from: Design) => mergedProps(from, scope(frame), id)[key]
/** Whether a flow runs in a row (not a column) in a frame's format. */
export const rowIn = (frame: Frame, id: string, from: Design) =>
  (propIn(frame, id, 'layout', from) as AutoLayoutOf | undefined)?.direction !== 'column'
/** Whether a box lays out what it holds with auto layout in a frame's format. */
export const layoutIn = (frame: Frame, id: string, from: Design) =>
  from.nodes[id]?.type === 'box' && propIn(frame, id, 'layout', from) !== undefined
/** Whether a layer is in an auto layout box's flow in a frame's format, so the box places it. */
export const inFlow = (frame: Frame, id: string, from: Design) =>
  layoutIn(frame, from.nodes[id]?.parentId ?? '', from) && !propIn(frame, id, 'absolute', from)

/** Whether auto layout sizes or places a layer: an auto layout box, or a layer anywhere inside one. */
export function laidOut(id: string, from: Design) {
  for (const up of ancestorsOf(from, id)) {
    const node = from.nodes[up]
    if (node?.type === 'box' && (node.props.layout || Object.values(from.overrides).some((o) => o[up]?.layout)))
      return true
  }
  return false
}
/** Whether auto layout places a layer that is inside `root`, with whatever between them it is part of. */
export function placedInside(frame: Frame, id: string, root: string, from: Design) {
  for (const up of ancestorsOf(from, id)) {
    if (up === root) break
    if (inFlow(frame, up, from)) return true
  }
  return false
}

/** The flow siblings of layers in an auto layout box, without them, in the box's order. */
export function flowSiblings(frame: Frame, parentId: string, moving: string[], from: Design) {
  return childrenOf(from, parentId)
    .map(([id]) => id)
    .filter((id) => !moving.includes(id) && inFlow(frame, id, from))
}
