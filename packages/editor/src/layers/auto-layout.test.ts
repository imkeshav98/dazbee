import { describe, expect, it } from 'vitest'

import { type Design, parseDesign } from '@dazbee/schema'

import { type Frame, frameGrid } from '../canvas/grid.ts'
import { flowSiblings, inFlow, laidOut, layoutIn, placedInside, propIn, rowIn } from './auto-layout.ts'

const box = { x: 0, y: 0, width: 100, height: 100 }
const rect = (parentId: string, index: string, extra: Record<string, unknown> = {}) => ({
  type: 'graphic',
  parentId,
  index,
  name: 'Rect',
  props: { ...box, shape: { kind: 'rect' }, ...extra },
})

/**
 * One page in a square and a banner: `row` lays out `a`, `b` (absolute) and the group `g` in a
 * row in every format; `col` lays out `c` in a column in the banner only; `free` is on the page.
 */
const design: Design = (() => {
  const parsed = parseDesign({
    meta: { designId: 'd', name: 'D', kind: 'single', primaryFormatId: 'sq' },
    formats: {
      sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
      banner: { name: 'Banner', width: 320, height: 50, order: 'a1' },
    },
    pages: { p1: { name: 'Page 1', order: 'a0' } },
    nodes: {
      row: {
        type: 'frame',
        parentId: 'p1',
        index: 'a0',
        name: 'Row',
        props: { ...box, layout: { direction: 'row', gap: 8 } },
      },
      a: rect('row', 'a0'),
      b: rect('row', 'a1', { absolute: true }),
      g: { type: 'group', parentId: 'row', index: 'a2', name: 'Group', props: box },
      inner: rect('g', 'a0'),
      col: { type: 'frame', parentId: 'p1', index: 'a1', name: 'Column', props: box },
      c: rect('col', 'a0'),
      free: rect('p1', 'a2'),
    },
    overrides: { 'format:banner': { col: { layout: { direction: 'column' } } } },
  })
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  return parsed.design
})()
const frameIn = (formatId: string) => frameGrid(design).frames.find((f) => f.formatId === formatId) as Frame
const sq = frameIn('sq')
const banner = frameIn('banner')

describe('propIn', () => {
  it('reads a property as the frame’s format has it, its override over the base', () => {
    expect(propIn(sq, 'col', 'layout', design)).toBeUndefined()
    expect(propIn(banner, 'col', 'layout', design)).toMatchObject({ direction: 'column' })
    expect(propIn(banner, 'row', 'layout', design)).toMatchObject({ direction: 'row', gap: 8 })
  })
})

describe('rowIn', () => {
  it('is a row unless the format’s layout runs in a column', () => {
    expect(rowIn(sq, 'row', design)).toBe(true)
    expect(rowIn(banner, 'col', design)).toBe(false)
    expect(rowIn(sq, 'col', design)).toBe(true)
  })
})

describe('layoutIn', () => {
  it('holds for a frame with auto layout in the frame’s format', () => {
    expect(layoutIn(sq, 'row', design)).toBe(true)
    expect(layoutIn(sq, 'col', design)).toBe(false)
    expect(layoutIn(banner, 'col', design)).toBe(true)
    expect(layoutIn(sq, 'a', design)).toBe(false)
    expect(layoutIn(sq, 'missing', design)).toBe(false)
  })
})

describe('inFlow', () => {
  it('holds for a layer its parent places, not an absolute one', () => {
    expect(inFlow(sq, 'a', design)).toBe(true)
    expect(inFlow(sq, 'g', design)).toBe(true)
    expect(inFlow(sq, 'b', design)).toBe(false)
    expect(inFlow(sq, 'inner', design)).toBe(false)
    expect(inFlow(sq, 'free', design)).toBe(false)
  })

  it('follows the format: a column only the banner lays out', () => {
    expect(inFlow(sq, 'c', design)).toBe(false)
    expect(inFlow(banner, 'c', design)).toBe(true)
  })
})

describe('laidOut', () => {
  it('holds for an auto layout frame in any format, and anything inside one', () => {
    for (const id of ['row', 'a', 'b', 'g', 'inner', 'col', 'c']) expect(laidOut(id, design), id).toBe(true)
    expect(laidOut('free', design)).toBe(false)
  })
})

describe('placedInside', () => {
  it('holds when the layer, or what holds it below the root, is in a flow', () => {
    expect(placedInside(sq, 'inner', 'row', design)).toBe(true)
    expect(placedInside(sq, 'a', 'row', design)).toBe(true)
    expect(placedInside(sq, 'inner', 'g', design)).toBe(false)
    expect(placedInside(sq, 'c', 'col', design)).toBe(false)
    expect(placedInside(banner, 'c', 'col', design)).toBe(true)
  })
})

describe('flowSiblings', () => {
  it('lists the layers in the flow, in order, without the ones moving', () => {
    expect(flowSiblings(sq, 'row', [], design)).toEqual(['a', 'g'])
    expect(flowSiblings(sq, 'row', ['a'], design)).toEqual(['g'])
    expect(flowSiblings(sq, 'col', [], design)).toEqual([])
    expect(flowSiblings(banner, 'col', [], design)).toEqual(['c'])
  })
})
