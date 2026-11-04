// A layer moved out of a turned group, out of a turned group inside another, or into one, is drawn
// where it was, in its frame: each layer's own colour has the same pixels and the same centre
// within half a pixel before and after the move, as the editor moves it (the move, then the groups
// it left fitting what they hold, in one step). Its linked copy in the other frame stays as it was.
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
  link: string,
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
  link,
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
const white = [{ type: 'solid', color: '#FFFFFFFF' }]
/** A square frame and a wide one holding linked copies: the wide frame turns the outer group another way and moves it. */
const json = {
  meta: { designId: 'd', name: 'Turned' },
  pages: { p1: { name: 'Page', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 400, height: 400, x: 0, y: 0, fills: white, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 800, height: 400, x: 600, y: 0, fills: white, order: 'a1' },
  },
  nodes: {
    g: {
      type: 'group',
      parentId: 'sq',
      link: 'g',
      index: 'a0',
      name: 'G',
      props: { x: 60, y: 60, width: 260, height: 240, rotation: 30 },
    },
    a: rect('g', 'a', 'a0', 60, 60, 120, 70, COLOURS.a, 10),
    h: {
      type: 'group',
      parentId: 'g',
      link: 'h',
      index: 'a1',
      name: 'H',
      props: { x: 180, y: 160, width: 140, height: 140, rotation: 25 },
    },
    b: rect('h', 'b', 'a0', 180, 160, 140, 60, COLOURS.b, -15),
    c: rect('sq', 'c', 'a1', 40, 300, 90, 60, COLOURS.c, 5),
    'wide-g': {
      type: 'group',
      parentId: 'wide',
      link: 'g',
      index: 'a0',
      name: 'G',
      props: { x: 300, y: 60, width: 260, height: 240, rotation: -20 },
    },
    'wide-a': rect('wide-g', 'a', 'a0', 300, 60, 120, 70, COLOURS.a, 10),
    'wide-h': {
      type: 'group',
      parentId: 'wide-g',
      link: 'h',
      index: 'a1',
      name: 'H',
      props: { x: 420, y: 160, width: 140, height: 140, rotation: 25 },
    },
    'wide-b': rect('wide-h', 'b', 'a0', 420, 160, 140, 60, COLOURS.b, -15),
    'wide-c': rect('wide', 'c', 'a1', 40, 300, 90, 60, COLOURS.c, 5),
  },
}
type FrameId = keyof typeof json.frames
/** A layer in a frame by its id in the square, or `frame` for the frame itself: the wide frame holds the copies. */
const idIn = (frameId: FrameId, id: string) => {
  if (id === 'frame') return frameId
  return frameId === 'sq' ? id : `wide-${id}`
}
const frameOf = (layer: string): FrameId => (layer.startsWith('wide-') ? 'wide' : 'sq')

/** Each colour's pixel count and the centre of its pixels, in a frame. */
function marks(design: Design, frameId: string) {
  const { width, pixels } = renderDesign(ck, design, frameId, bytes)
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

/** How much of a frame's picture differs between two designs: the share of pixels with a channel more than 24 apart. */
function differing(a: Design, b: Design, frameId: string) {
  const x = renderDesign(ck, a, frameId, bytes).pixels
  const y = renderDesign(ck, b, frameId, bytes).pixels
  let n = 0
  for (let i = 0; i < x.length; i += 4) {
    if ([0, 1, 2].some((c) => Math.abs((x[i + c] ?? 0) - (y[i + c] ?? 0)) > 24)) n++
  }
  return n / (x.length / 4)
}

/** A tab on the design, its groups fitting what they hold in each frame, as the editor keeps them. */
function opened() {
  const parsed = parseDesign(json)
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  const doc = loadDesign(parsed.design)
  const tab = openSession(doc)
  tab.run('node.hug', { ids: ['b', 'a'] })
  tab.run('node.hug', { ids: ['wide-b', 'wide-a'] })
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
    ['out of a turned group', 'a', 'frame'],
    ['out of a turned group inside another', 'b', 'frame'],
    ['out of the inner group into the outer', 'b', 'g'],
    ['into a turned group inside another', 'c', 'h'],
  ] as const) {
    it(`stays where it is drawn, ${what}, in its frame, and its copy in the other frame stays`, () => {
      const { doc, tab } = opened()
      for (const [frameId, other] of [
        ['sq', 'wide'],
        ['wide', 'sq'],
      ] as const) {
        const was = readDesign(doc)
        const before = marks(was, frameId)
        move(tab, doc, idIn(frameId, id), idIn(frameId, parentId))
        const now = readDesign(doc)
        expect(now.nodes[idIn(frameId, id)]?.parentId).toBe(idIn(frameId, parentId))
        expectDrawnTheSame(before, marks(now, frameId), `${what}, ${frameId}`)
        // The whole picture, turns included: only anti-aliased edges may differ.
        expect(differing(was, now, frameId), `${what}, ${frameId}: picture`).toBeLessThan(0.002)
        // The other frame's layers, and so its picture, are as they were.
        for (const [layer, node] of Object.entries(was.nodes))
          if (frameOf(layer) === other) expect(now.nodes[layer], layer).toEqual(node)
        expect(renderDesign(ck, now, other, bytes).png).toEqual(renderDesign(ck, was, other, bytes).png)
      }
      // One undo step takes each move back.
      tab.undo()
      expect(readDesign(doc).nodes[idIn('wide', id)]?.parentId).not.toBe(idIn('wide', parentId))
      expect(readDesign(doc).nodes[id]?.parentId).toBe(idIn('sq', parentId))
      tab.undo()
      expect(readDesign(doc).nodes[id]?.parentId).not.toBe(idIn('sq', parentId))
    })
  }
})
