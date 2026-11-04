import * as Y from 'yjs'
import type { z } from 'zod'

import { type DesignInput, parseDesign, type Shape } from '@dazbee/schema'

import { loadDesign } from './design-doc.ts'
import { openSession } from './session.ts'

/** A small design for tests: one page, a square and a banner, a box and a headline. */
export const testDesign = (): DesignInput => ({
  meta: { designId: 'd1', name: 'Test', kind: 'single', primaryFormatId: 'sq' },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    banner: { name: 'Banner', width: 320, height: 50, order: 'a1' },
  },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    box: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Box',
      props: {
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        shape: { kind: 'rect' },
        fills: [{ type: 'solid', color: '#FF5A36FF' }],
      },
    },
    headline: {
      type: 'text',
      parentId: 'p1',
      index: 'a1',
      name: 'Headline',
      role: 'headline',
      props: {
        x: 60,
        y: 600,
        width: 960,
        height: 100,
        text: 'Summer sale',
        style: { fontFamily: 'Noto Sans', fontSize: 84, color: '#111111FF' },
        runs: [{ start: 7, end: 11, style: { fontWeight: 800 } }],
      },
    },
  },
  overrides: { 'format:banner': { headline: { text: 'Sale', x: 4, runs: [] } } },
})

/** Three shapes (a rect with its own corners, a star, a triangle) and a text, in a square and a wide format. */
export const shapesDesign = (): DesignInput => ({
  meta: { designId: 'd1', name: 'Booleans', kind: 'single', primaryFormatId: 'sq' },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    wide: { name: 'Wide', width: 1200, height: 628, order: 'a1' },
  },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  nodes: {
    a: shape('a0', 100, { kind: 'rect', corners: [0, 10, 20, 30] }, '#FF0000FF'),
    b: shape('a1', 150, { kind: 'star', points: 6 }, '#00FF00FF'),
    c: shape('a2', 400, { kind: 'polygon', sides: 3 }, '#0000FFFF'),
    t: {
      type: 'text',
      parentId: 'p1',
      index: 'a3',
      name: 'Text',
      props: {
        x: 0,
        y: 0,
        width: 100,
        height: 40,
        text: 'Hi',
        style: { fontFamily: 'Noto Sans', fontSize: 20, color: '#000000FF' },
      },
    },
  },
  overrides: { 'format:wide': { b: { x: 300 } } },
})

/** A shape to add with node.create. */
export const badge = {
  type: 'graphic',
  name: 'Badge',
  props: {
    x: 900,
    y: 40,
    width: 120,
    height: 120,
    shape: { kind: 'ellipse' },
    fills: [{ type: 'solid', color: '#FFC400FF' }],
  },
} as const

/** A document holding `design`, the test design unless given. */
export function testDoc(design: DesignInput = testDesign()) {
  const result = parseDesign(design)
  if (!result.success) throw new Error(result.errors.join('\n'))
  return loadDesign(result.design)
}

/** A session on a document holding shapesDesign(). */
export function openShapes() {
  const doc = testDoc(shapesDesign())
  return { doc, tab: openSession(doc) }
}

/** Two tabs on one design, each with its own doc, exchanging updates like the sync server would. */
export function twoTabs() {
  const a = testDoc()
  const b = new Y.Doc()
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  const sync = () => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
  }
  return { a, b, tabA: openSession(a), tabB: openSession(b), sync }
}

/** A shape on p1 at `x`, filled with one colour. */
function shape(index: string, x: number, kind: z.input<typeof Shape>, color: string) {
  return {
    type: 'graphic' as const,
    parentId: 'p1',
    index,
    name: `Shape ${index}`,
    props: { x, y: 100, width: 100, height: 100, shape: kind, fills: [{ type: 'solid' as const, color }] },
  }
}
