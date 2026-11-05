// Switching a box's auto layout on or off (#46), with its settings read off where its children are, so
// that switching moves nothing when the children already sit in an even row or column.
import type * as Y from 'yjs'
import { z } from 'zod'

import { NodeId, type Rect } from '@dazbee/schema'

import { childrenOf } from '../children.ts'
import { round } from '../geometry.ts'
import { boxPlan } from './box-plan.ts'
import { lockProblem, missingLayer } from './checks.ts'
import { defineCommand } from './define.ts'

interface Inferred {
  direction: 'row' | 'column'
  gap: number
  padding: { top: number; right: number; bottom: number; left: number }
  justify: 'start'
  align: 'start' | 'center' | 'end'
  wrap: false
  lineGap: number
}

/**
 * Switches a box's auto layout on or off (#46). On, its settings are read off where its children
 * are, and the children are put in the order the flow takes them, so a box whose children already
 * sit in an even row or column looks the same. Off, the layout goes. Its linked copies in other
 * frames stay as they are.
 */
export const nodeAutoLayout = defineCommand({
  name: 'node.autoLayout',
  input: z.object({ id: NodeId, on: z.boolean() }),
  check: ({ design }, { id }) => {
    const node = design.nodes[id]
    if (!node) return missingLayer(design, [id])
    if (node.type !== 'box') return `"${id}" is a ${node.type}; only boxes have auto layout`
    return lockProblem(id, node, 'style')
  },
  apply: ({ r, design }, { id, on }) => {
    const props = r.nodes.get(id)?.get('props') as Y.Map<unknown>
    if (!on) {
      props.delete('layout')
      return
    }
    const plan = boxPlan(design)
    const flow = childrenOf(design, id).filter(([, node]) => !node.props.absolute)
    const { order, layout } = inferLayout(
      plan.get(id),
      flow.map(([kid]) => [kid, plan.get(kid)]),
    )
    props.set('layout', layout)
    // The flow follows the children's order: they swap places in it, leaving absolute ones where they are.
    const slots = flow.map(([, node]) => node.index).sort()
    order.forEach((kid, i) => {
      if (design.nodes[kid]?.index !== slots[i]) r.nodes.get(kid)?.set('index', slots[i])
    })
  },
})

const NEAR = 0.5
const same = (values: number[]) => values.every((v) => Math.abs(v - (values[0] ?? 0)) <= NEAR)

/**
 * Reads a row or column off the children's boxes: the axis along which they follow each other
 * without overlapping (the longer run if both), the gap between them (their average where they
 * differ), the paddings to the box's edges, and how they line up across the flow.
 */
function inferLayout(outer: Rect, kids: [string, Rect][]): { layout: Inferred; order: string[] } {
  const along = (row: boolean) => {
    const sorted = [...kids].sort(([, a], [, b]) => (row ? a.x - b.x : a.y - b.y))
    const gaps = sorted.slice(1).map(([, b], i) => {
      const a = (sorted[i] as [string, Rect])[1]
      return row ? b.x - (a.x + a.width) : b.y - (a.y + a.height)
    })
    return { sorted, gaps, clear: gaps.every((g) => g >= -NEAR) }
  }
  const asRow = along(true)
  const asColumn = along(false)
  const span = (row: boolean) => {
    const starts = kids.map(([, b]) => (row ? b.x : b.y))
    const ends = kids.map(([, b]) => (row ? b.x + b.width : b.y + b.height))
    return Math.max(...ends) - Math.min(...starts)
  }
  const row = asRow.clear && asColumn.clear ? span(true) >= span(false) : asRow.clear || !asColumn.clear
  const { sorted, gaps } = row ? asRow : asColumn
  const gap = gaps.length === 0 ? 0 : round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
  const boxes = kids.map(([, b]) => b)
  const left = Math.min(...boxes.map((b) => b.x)) - outer.x
  const top = Math.min(...boxes.map((b) => b.y)) - outer.y
  const right = outer.x + outer.width - Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = outer.y + outer.height - Math.max(...boxes.map((b) => b.y + b.height))
  const across = (part: 0 | 0.5 | 1) => boxes.map((b) => (row ? b.y + b.height * part : b.x + b.width * part))
  const align = same(across(0)) ? 'start' : same(across(0.5)) ? 'center' : same(across(1)) ? 'end' : 'start'
  const padding =
    kids.length === 0
      ? { top: 0, right: 0, bottom: 0, left: 0 }
      : { top: round(top), right: round(right), bottom: round(bottom), left: round(left) }
  // Centred across the flow, the paddings either side must differ by as much as the centre line
  // is off the box's middle; at the start or end, the paddings read off already hold them there.
  if (align === 'center' && kids.length > 0) {
    const centre = (across(0.5)[0] ?? 0) - (row ? outer.y : outer.x)
    if (row) padding.bottom = round(padding.top + outer.height - 2 * centre)
    else padding.right = round(padding.left + outer.width - 2 * centre)
  }
  return {
    layout: { direction: row ? 'row' : 'column', gap, padding, justify: 'start', align, wrap: false, lineGap: 0 },
    // The children in the order the flow takes them.
    order: sorted.map(([id]) => id),
  }
}
