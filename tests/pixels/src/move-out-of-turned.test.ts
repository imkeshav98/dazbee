// A layer moved out of a turned group, out of a turned group inside another, or into one, is drawn
// where it was, in every format: each layer's own colour has the same pixels and the same centre
// within half a pixel before and after the move, as the editor moves it (the move, then the groups
// it left fitting what they hold, in one step).
import { describe, expect, it } from 'vitest'

import { loadDesign, openSession, readDesign } from '@dazbee/doc'
import { renderDesign } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { type Design, parseDesign } from '@dazbee/schema'

import { fixtureResources } from './pixels.ts'

const ck = await loadCanvasKit()
const bytes = fixtureResources()

const COLOURS = { a: [224, 32, 32], b: [32, 80, 224], c: [16, 160, 80] } as const
const hex = ([r, g, b]: readonly number[]) =>
  `#${[r, g, b]
    .map((v) => (v ?? 0).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}FF`
const rect = (
  parentId: string,
  index: string,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: readonly number[],
  rotation = 0,
) => ({
  type: 'graphic',
  parentId,
  index,
  name: index,
  props: {
    x,
    y,
    width: w,
    height: h,
    rotation,
    shape: { kind: 'rect' },
    fills: [{ type: 'solid', color: hex(colour) }],
  },
})
const json = {
  meta: { designId: 'd', name: 'Turned', kind: 'single', primaryFormatId: 'sq' },
  formats: {
    sq: { name: 'Square', width: 400, height: 400, order: 'a0' },
    wide: { name: 'Wide', width: 800, height: 400, order: 'a1' },
  },
  pages: { p1: { name: 'Page', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    g: {
      type: 'group',
      parentId: 'p1',
      index: 'a0',
      name: 'G',
      props: { x: 60, y: 60, width: 260, height: 240, rotation: 30 },
    },
    a: rect('g', 'a0', 60, 60, 120, 70, COLOURS.a, 10),
    h: {
      type: 'group',
      parentId: 'g',
      index: 'a1',
      name: 'H',
      props: { x: 180, y: 160, width: 140, height: 140, rotation: 25 },
    },
    b: rect('h', 'a0', 180, 160, 140, 60, COLOURS.b, -15),
    c: rect('p1', 'a1', 40, 300, 90, 60, COLOURS.c, 5),
  },
  // The wide format turns the outer group another way and moves it.
  overrides: { 'format:wide': { g: { rotation: -20, x: 300 }, a: { x: 300 }, h: { x: 420 }, b: { x: 420 } } },
}

/** Each colour's pixel count and the centre of its pixels, in a format. */
function marks(design: Design, formatId: string) {
  const { width, pixels } = renderDesign(ck, design, 'p1', formatId, bytes)
  return Object.fromEntries(
    Object.entries(COLOURS).map(([name, [r, g, b]]) => {
      let n = 0
      let sx = 0
      let sy = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          Math.abs((pixels[i] ?? 0) - r) < 8 &&
          Math.abs((pixels[i + 1] ?? 0) - g) < 8 &&
          Math.abs((pixels[i + 2] ?? 0) - b) < 8
        ) {
          const p = i / 4
          n++
          sx += p % width
          sy += Math.floor(p / width)
        }
      }
      return [name, { n, x: n ? sx / n : 0, y: n ? sy / n : 0 }]
    }),
  )
}

/** How much of a format's picture differs between two designs: the share of pixels with a channel more than 24 apart. */
function differing(a: Design, b: Design, formatId: string) {
  const x = renderDesign(ck, a, 'p1', formatId, bytes).pixels
  const y = renderDesign(ck, b, 'p1', formatId, bytes).pixels
  let n = 0
  for (let i = 0; i < x.length; i += 4) {
    if ([0, 1, 2].some((c) => Math.abs((x[i + c] ?? 0) - (y[i + c] ?? 0)) > 24)) n++
  }
  return n / (x.length / 4)
}

/** A tab on the design, its groups fitting what they hold, as the editor keeps them. */
function opened() {
  const parsed = parseDesign(json)
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  const doc = loadDesign(parsed.design)
  const tab = openSession(doc)
  tab.run('node.hug', { ids: ['b', 'a'] })
  return { doc, tab }
}

/** Moves a layer as the layers panel does: the move, then the group it left fitting what it holds. */
function move(tab: ReturnType<typeof openSession>, doc: ReturnType<typeof loadDesign>, id: string, parentId: string) {
  const from = readDesign(doc).nodes[id]?.parentId
  tab.gesture(() => {
    tab.run('node.move', { id, parentId })
    tab.run('node.hug', { ids: [id, ...(from && readDesign(doc).nodes[from] ? [from] : [])] })
  })
}

function expectDrawnTheSame(before: ReturnType<typeof marks>, after: ReturnType<typeof marks>, what: string) {
  for (const name of Object.keys(COLOURS)) {
    const was = before[name]
    const now = after[name]
    if (!was || !now) throw new Error(name)
    expect(was.n, `${what}: ${name} is drawn`).toBeGreaterThan(500)
    expect(Math.abs(now.n - was.n) / was.n, `${what}: ${name}'s pixels`).toBeLessThan(0.01)
    expect(Math.hypot(now.x - was.x, now.y - was.y), `${what}: ${name}'s centre`).toBeLessThan(0.5)
  }
}

describe('a layer moved in or out of turned groups', () => {
  for (const [what, id, parentId] of [
    ['out of a turned group', 'a', 'p1'],
    ['out of a turned group inside another', 'b', 'p1'],
    ['out of the inner group into the outer', 'b', 'g'],
    ['into a turned group inside another', 'c', 'h'],
  ] as const) {
    it(`stays where it is drawn, ${what}, in every format`, () => {
      const { doc, tab } = opened()
      const was = readDesign(doc)
      const before = { sq: marks(was, 'sq'), wide: marks(was, 'wide') }
      move(tab, doc, id, parentId)
      expect(readDesign(doc).nodes[id]?.parentId).toBe(parentId)
      expectDrawnTheSame(before.sq, marks(readDesign(doc), 'sq'), `${what}, square`)
      expectDrawnTheSame(before.wide, marks(readDesign(doc), 'wide'), `${what}, wide`)
      // The whole picture, turns included: only anti-aliased edges may differ.
      for (const formatId of ['sq', 'wide'])
        expect(differing(was, readDesign(doc), formatId), `${what}, ${formatId}: picture`).toBeLessThan(0.002)
      // One undo step takes it back where it was, drawn the same.
      tab.undo()
      expect(readDesign(doc).nodes[id]?.parentId).not.toBe(parentId)
      expect(differing(was, readDesign(doc), 'sq')).toBeLessThan(0.002)
    })
  }
})
