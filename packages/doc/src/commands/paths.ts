import type * as Y from 'yjs'
import { z } from 'zod'

import { AnyScope, type Design, NodeId } from '@dazbee/schema'

import { centreOf, turn } from '../geometry.ts'
import { lockProblem } from './checks.ts'
import { type CommandContext, defineCommand } from './define.ts'
import { Placement } from './placement.ts'

/**
 * Gives a path layer new path data (#45), as edited in `scope` (the base when left out). The data
 * is in that scope's drawn coordinates as they were, moved so the new outline starts at 0, 0: `dx`
 * and `dy` are how far its box's corner moves there, and `width` and `height` its new size there,
 * the box the data is now drawn in. Every other scope's box changes in proportion to its own size,
 * so it scales the same outline; a turned box also shifts with its new centre, so the points that
 * didn't change stay where they are drawn.
 */
export const nodeReshape = defineCommand({
  name: 'node.reshape',
  input: z.object({
    id: NodeId,
    d: z.string().min(1),
    dx: z.number(),
    dy: z.number(),
    width: z.number().min(0),
    height: z.number().min(0),
    scope: AnyScope,
  }),
  check: ({ design }, { id }) => {
    const node = design.nodes[id]
    if (!node) return `no layer "${id}"`
    if (node.type !== 'graphic' || node.props.shape.kind !== 'path') return `"${id}" is not a path`
    for (const flag of ['style', 'move', 'resize'] as const) {
      const locked = lockProblem(id, node, flag)
      if (locked) return locked
    }
    return undefined
  },
  apply: ({ r, design }, { id, d, dx, dy, width, height, scope: edited }) => {
    const node = design.nodes[id]
    if (node?.type !== 'graphic' || node.props.shape.kind !== 'path') return
    const props = r.nodes.get(id)?.get('props') as Y.Map<unknown>
    props.set('shape', { ...node.props.shape, d, drawnIn: { width, height } })
    const place = new Placement(design)
    const from = place.get(edited, id)
    // Each scope's box against the edited one's: an axis with no length there scales by 1.
    const ratio = (was: number, there: number) => (there > 0 ? was / there : 1)
    for (const scope of place.scopes) {
      const was = place.get(scope, id)
      const kx = ratio(was.width, from.width)
      const ky = ratio(was.height, from.height)
      const next = { x: was.x + dx * kx, y: was.y + dy * ky, width: width * kx, height: height * ky }
      const v = {
        x: centreOf({ ...next, rotation: 0 }).x - centreOf(was).x,
        y: centreOf({ ...next, rotation: 0 }).y - centreOf(was).y,
      }
      const turned = turn(v, { x: 0, y: 0 }, was.rotation)
      place.set(scope, id, { ...next, x: next.x + turned.x - v.x, y: next.y + turned.y - v.y })
    }
    place.write(r)
  },
})

/**
 * Gives a path with no box it was drawn in its base box as that box, before its size changes, so
 * the new size scales its drawing from there; a path that has one keeps it.
 */
export function keepDrawnIn(r: CommandContext['r'], design: Design, id: string) {
  const node = design.nodes[id]
  if (node?.type !== 'graphic' || node.props.shape.kind !== 'path' || node.props.shape.drawnIn) return
  const props = r.nodes.get(id)?.get('props') as Y.Map<unknown> | undefined
  props?.set('shape', { ...node.props.shape, drawnIn: { width: node.props.width, height: node.props.height } })
}
