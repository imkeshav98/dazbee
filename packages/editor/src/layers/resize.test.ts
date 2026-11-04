import { describe, expect, it } from 'vitest'

import type { DesignInput } from '@dazbee/schema'

import { resizedBoxes, scalingTexts, switchSizing } from './resize.ts'
import { sessionOf } from './test-boxes.ts'
import type { Box } from './transform.ts'

const STYLE = { fontFamily: 'Noto Sans', fontSize: 20, color: '#000000FF' }
const rect = (
  parentId: string,
  index: string,
  box: { x: number; y: number; width: number; height: number; rotation?: number },
) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name: 'Rect',
  props: { ...box, shape: { kind: 'rect' as const } },
})
const text = (parentId: string, index: string, boxMode: 'fixed' | 'autoWidth') => ({
  type: 'text' as const,
  parentId,
  index,
  name: 'Text',
  props: { x: 0, y: 0, width: 100, height: 24, text: 'Hi', boxMode, style: STYLE },
})
const row = (parentId: string) => ({
  type: 'box' as const,
  parentId,
  index: 'a2',
  name: 'Row',
  props: { x: 0, y: 200, width: 300, height: 100, layout: { direction: 'row' as const } },
})
/**
 * One page with a square frame and a wide one. The square holds a group with a text and a rect, a
 * box holding a text, a row laid out by auto layout holding a rect, a text that grows with its
 * words, and one whose style is locked; the wide frame holds copies of the row, its rect and the
 * text that grows.
 */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1200, height: 628, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    group: {
      type: 'group',
      parentId: 'sq',
      link: 'group',
      index: 'a0',
      name: 'Group',
      props: { x: 0, y: 0, width: 100, height: 100 },
    },
    grouped: { ...text('group', 'a0', 'fixed'), link: 'grouped' },
    inGroup: { ...rect('group', 'a1', { x: 50, y: 50, width: 50, height: 50 }), link: 'inGroup' },
    card: {
      type: 'box',
      parentId: 'sq',
      link: 'card',
      index: 'a1',
      name: 'Card',
      props: { x: 0, y: 0, width: 100, height: 100 },
    },
    framed: { ...text('card', 'a0', 'fixed'), link: 'framed' },
    row: { ...row('sq'), link: 'row' },
    flowing: { ...rect('row', 'a0', { x: 0, y: 200, width: 50, height: 50 }), link: 'flowing' },
    grows: { ...text('sq', 'a3', 'autoWidth'), link: 'grows' },
    styled: { ...text('sq', 'a4', 'fixed'), link: 'styled', lock: { style: true } },
    'wide-row': { ...row('wide'), link: 'row' },
    'wide-flowing': { ...rect('wide-row', 'a0', { x: 0, y: 200, width: 50, height: 50 }), link: 'flowing' },
    'wide-grows': { ...text('wide', 'a3', 'autoWidth'), link: 'grows' },
  },
}
const box = (x: number, y: number, width: number, height: number, rotation = 0): Box => ({
  x,
  y,
  width,
  height,
  rotation,
})

/** A session over the design. */
function harness() {
  const session = sessionOf(DESIGN)
  const prop = (id: string, key: string) => (session.design().nodes[id]?.props as Record<string, unknown>)[key]
  /** The wide frame's copies as they are now. */
  const copies = () => Object.entries(session.design().nodes).filter(([id]) => id.startsWith('wide-'))
  return { session, prop, copies }
}

describe('resizedBoxes', () => {
  it('gives one root the new box itself, and scales several within it', () => {
    const { session } = harness()
    const one = resizedBoxes(
      session.design(),
      ['grows'],
      new Map([['grows', box(0, 0, 100, 24)]]),
      box(0, 0, 100, 24),
      box(0, 0, 200, 48),
    )
    expect(one.get('grows')).toEqual(box(0, 0, 200, 48))
    const start = new Map([
      ['grows', box(0, 0, 50, 50)],
      ['styled', box(50, 50, 50, 50)],
    ])
    const several = resizedBoxes(session.design(), ['grows', 'styled'], start, box(0, 0, 100, 100), box(0, 0, 200, 200))
    expect(several.get('grows')).toEqual(box(0, 0, 100, 100))
    expect(several.get('styled')).toEqual(box(100, 100, 100, 100))
  })

  it('gives a layer in a flow a size and never a place', () => {
    const { session } = harness()
    const start = new Map([['flowing', box(0, 200, 50, 50)]])
    const next = resizedBoxes(session.design(), ['flowing'], start, box(0, 200, 50, 50), box(-10, 190, 60, 60))
    expect(next.get('flowing')).toEqual(box(0, 200, 60, 60))
  })

  it("scales a group's layers with it, and keeps a box's where they are", () => {
    const { session } = harness()
    const group = resizedBoxes(
      session.design(),
      ['group'],
      new Map([
        ['group', box(0, 0, 100, 100)],
        ['inGroup', box(50, 50, 50, 50)],
      ]),
      box(0, 0, 100, 100),
      box(0, 0, 200, 200),
    )
    expect(group.get('inGroup')).toEqual(box(100, 100, 100, 100))
    const card = resizedBoxes(
      session.design(),
      ['card'],
      new Map([
        ['card', box(0, 0, 100, 100)],
        ['framed', box(10, 10, 50, 24)],
      ]),
      box(0, 0, 100, 100),
      box(-100, 0, 200, 100),
    )
    expect(card.get('card')).toEqual(box(-100, 0, 200, 100))
    expect(card.get('framed')).toEqual(box(10, 10, 50, 24))
  })

  it("moves a box's layers along with it when several layers are resized", () => {
    const { session } = harness()
    const start = new Map([
      ['card', box(0, 0, 100, 100)],
      ['framed', box(10, 10, 50, 24)],
      ['grows', box(100, 0, 100, 100)],
    ])
    const next = resizedBoxes(session.design(), ['card', 'grows'], start, box(0, 0, 200, 100), box(100, 0, 200, 100))
    expect(next.get('card')).toEqual(box(100, 0, 100, 100))
    expect(next.get('framed')).toEqual(box(110, 10, 50, 24))
  })
})

describe('scalingTexts', () => {
  it('gives the text a corner scales, selected or in a group, with its sizes', () => {
    const { session } = harness()
    const texts = scalingTexts(session.design(), ['group', 'grows', 'card'], 'se')
    expect([...texts.keys()]).toEqual(['grouped', 'grows'])
    expect(texts.get('grows')).toMatchObject({ style: STYLE, runs: [] })
  })

  it('gives none for an edge, or for text whose style is locked', () => {
    const { session } = harness()
    expect(scalingTexts(session.design(), ['grows'], 'e').size).toBe(0)
    expect(scalingTexts(session.design(), ['styled'], 'se').size).toBe(0)
  })
})

describe('switchSizing', () => {
  it('fixes the axes a resize drags: text that grows with its words gets a box, its copy in the other frame not', () => {
    const { session, prop, copies } = harness()
    const before = copies()
    switchSizing(session, ['grows'], 'e', session.design(), new Map())
    expect(prop('grows', 'boxMode')).toBe('autoHeight')
    switchSizing(session, ['grows'], 's', session.design(), new Map())
    expect(prop('grows', 'boxMode')).toBe('fixed')
    expect(copies()).toEqual(before)
  })

  it('leaves the box mode of text a corner scales', () => {
    const { session, prop } = harness()
    switchSizing(session, ['grows'], 'se', session.design(), new Map([['grows', {}]]))
    expect(prop('grows', 'boxMode')).toBe('autoWidth')
  })

  it('fixes the sizing of a layer in a flow, and of an auto layout box, on the axes dragged', () => {
    const { session, prop, copies } = harness()
    session.run('node.update', {
      ids: ['flowing', 'row', 'wide-flowing', 'wide-row'],
      patch: { sizing: { width: 'fill', height: 'hug' } },
    })
    const before = copies()
    switchSizing(session, ['flowing', 'row'], 'e', session.design(), new Map())
    expect(prop('flowing', 'sizing')).toEqual({ width: 'fixed', height: 'hug' })
    expect(prop('row', 'sizing')).toEqual({ width: 'fixed', height: 'hug' })
    expect(copies()).toEqual(before)
  })
})
