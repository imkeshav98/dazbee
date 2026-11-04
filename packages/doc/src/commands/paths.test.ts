// Path layers reshaped by the pen and point editing, at the commands seam (#45).
import { describe, expect, it } from 'vitest'

import { type DesignInput, parseDesign, pathScale } from '@dazbee/schema'

import { type Box, centreOf, turn } from '../geometry.ts'
import { loadDesign, openSession, readDesign } from '../index.ts'

const design = (): DesignInput => ({
  meta: { designId: 'd1', name: 'Paths', kind: 'single', primaryFormatId: 'sq' },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    wide: { name: 'Wide', width: 1200, height: 628, order: 'a1' },
    tall: { name: 'Tall', width: 1080, height: 1920, order: 'a2' },
  },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  nodes: {
    zig: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Zig',
      props: { x: 100, y: 100, width: 100, height: 50, shape: { kind: 'path', d: 'M0 0 L100 50' } },
    },
    box: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a1',
      name: 'Box',
      props: { x: 0, y: 0, width: 10, height: 10, shape: { kind: 'rect' } },
    },
  },
  overrides: { 'format:wide': { zig: { x: 400 } }, 'format:tall': { zig: { rotation: 90 } } },
})

const open = () => {
  const result = parseDesign(design())
  if (!result.success) throw new Error(result.errors.join('\n'))
  const doc = loadDesign(result.design)
  return { doc, tab: openSession(doc) }
}

type Props = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  shape: { d: string; drawnIn?: { width: number; height: number } }
}
const placed = (doc: ReturnType<typeof open>['doc'], scope: string) => {
  const d = readDesign(doc)
  return { ...d.nodes.zig?.props, ...d.overrides[scope]?.zig } as Props
}
/** Where a point of the path data is drawn on the page: scaled to the box, the box turned about its centre. */
const drawn = (p: Props, at: { x: number; y: number }) => {
  const { sx, sy } = pathScale(p.shape, p.width, p.height)
  return turn({ x: p.x + at.x * sx, y: p.y + at.y * sy }, centreOf(p as Box), p.rotation ?? 0)
}

describe('node.reshape', () => {
  it("writes the path to every format, moving each format's box by the same amount, in one undo step", () => {
    const { doc, tab } = open()
    // A new first point 20 to the left and 10 above: the outline now starts there.
    tab.run('node.reshape', { id: 'zig', d: 'M0 0 L20 10 L120 60', dx: -20, dy: -10, width: 120, height: 60 })
    // The new data is drawn in the new box, so that is its size.
    expect(placed(doc, 'format:sq')).toMatchObject({
      x: 80,
      y: 90,
      width: 120,
      height: 60,
      shape: { kind: 'path', d: 'M0 0 L20 10 L120 60', drawnIn: { width: 120, height: 60 } },
    })
    expect(placed(doc, 'format:wide')).toMatchObject({ x: 380, y: 90, width: 120, height: 60 })
    // The old points draw where they did in every format, the turned one included.
    for (const scope of ['format:sq', 'format:wide', 'format:tall']) {
      tab.undo()
      const before = [drawn(placed(doc, scope), { x: 0, y: 0 }), drawn(placed(doc, scope), { x: 100, y: 50 })]
      tab.redo()
      const after = [drawn(placed(doc, scope), { x: 20, y: 10 }), drawn(placed(doc, scope), { x: 120, y: 60 })]
      after.forEach((p, i) => {
        expect(p.x, scope).toBeCloseTo(before[i]?.x ?? NaN, 1)
        expect(p.y, scope).toBeCloseTo(before[i]?.y ?? NaN, 1)
      })
    }
    tab.undo()
    expect(placed(doc, 'format:sq')).toMatchObject({
      x: 100,
      y: 100,
      width: 100,
      height: 50,
      shape: { d: 'M0 0 L100 50' },
    })
  })

  it('reshapes only paths, and not a locked one', () => {
    const { tab } = open()
    expect(() => tab.run('node.reshape', { id: 'box', d: 'M0 0 L1 1', dx: 0, dy: 0, width: 1, height: 1 })).toThrow(
      /"box" is not a path/,
    )
    expect(() => tab.run('node.reshape', { id: 'gone', d: 'M0 0 L1 1', dx: 0, dy: 0, width: 1, height: 1 })).toThrow(
      /no layer "gone"/,
    )
    tab.run('node.lock', { ids: ['zig'], lock: { style: true } })
    expect(() => tab.run('node.reshape', { id: 'zig', d: 'M0 0 L1 1', dx: 0, dy: 0, width: 1, height: 1 })).toThrow(
      /"zig" is locked \(style\)/,
    )
  })
})

describe('the box a path is drawn in', () => {
  it('is the base box once a path with none first changes size, in the same undo step', () => {
    const { doc, tab } = open()
    tab.run('node.update', { ids: ['zig'], scope: 'format:wide', patch: { width: 200, height: 100 } })
    expect(placed(doc, 'base').shape).toMatchObject({ drawnIn: { width: 100, height: 50 } })
    // Wide draws the outline twice the size now; the square as before.
    expect(drawn(placed(doc, 'format:wide'), { x: 100, y: 50 })).toEqual({ x: 600, y: 200 })
    expect(drawn(placed(doc, 'format:sq'), { x: 100, y: 50 })).toEqual({ x: 200, y: 150 })
    tab.undo()
    expect(placed(doc, 'base').shape).not.toHaveProperty('drawnIn')
  })

  it("scales each format's box by its own size when points are edited in a format of another size", () => {
    const { doc, tab } = open()
    tab.run('node.update', { ids: ['zig'], scope: 'format:wide', patch: { width: 200, height: 100 } })
    // In wide the end point moves 40 to the right of where it is drawn, so the outline there is 240 × 100.
    tab.run('node.reshape', {
      id: 'zig',
      scope: 'format:wide',
      d: 'M0 0 L240 100',
      dx: 0,
      dy: 0,
      width: 240,
      height: 100,
    })
    expect(placed(doc, 'format:wide')).toMatchObject({
      x: 400,
      width: 240,
      height: 100,
      shape: { drawnIn: { width: 240, height: 100 } },
    })
    // The square keeps half of wide's size, so it draws the same outline at half the size.
    expect(placed(doc, 'format:sq')).toMatchObject({ x: 100, width: 120, height: 50 })
    expect(drawn(placed(doc, 'format:sq'), { x: 240, y: 100 })).toEqual({ x: 220, y: 150 })
    expect(drawn(placed(doc, 'format:wide'), { x: 240, y: 100 })).toEqual({ x: 640, y: 200 })
  })
})
