import { describe, expect, it } from 'vitest'

import { fitted } from './fit.ts'

const square = { width: 1080, height: 1080 }
const mpu = { width: 300, height: 250 }

describe('fitted', () => {
  it('moves a centred layer to the new centre and scales its size by the smaller ratio, so it stays centred', () => {
    const box = { x: 340, y: 440, width: 400, height: 200 }
    // 250 / 1080 is the smaller ratio; the centre 540, 540 goes to 150, 125.
    expect(fitted(box, box, { from: square, to: mpu })).toEqual({ x: 103.7, y: 101.85, width: 92.59, height: 46.3 })
  })

  it('keeps a layer inside a copied root where it sits relative to the root’s centre, scaled the same', () => {
    const group = { x: 100, y: 100, width: 400, height: 400 }
    const child = { x: 150, y: 150, width: 100, height: 50 }
    const story = { width: 1080, height: 1920 }
    // To a taller frame the ratios are 1 and 16/9: the root's centre moves down, and nothing scales.
    expect(fitted(group, group, { from: square, to: story })).toEqual({ ...group, y: 333.33 })
    expect(fitted(child, group, { from: square, to: story })).toEqual({ ...child, y: 383.33 })
    // To a smaller frame the child keeps its offset from the root's centre, scaled by 250 / 1080.
    expect(fitted(group, group, { from: square, to: mpu })).toEqual({ x: 37.04, y: 23.15, width: 92.59, height: 92.59 })
    expect(fitted(child, group, { from: square, to: mpu })).toEqual({ x: 48.61, y: 34.72, width: 23.15, height: 11.57 })
  })

  it('keeps every layer inside the frame, and every child inside its root', () => {
    const roots = [
      { x: 0, y: 0, width: 200, height: 200 },
      { x: 880, y: 0, width: 200, height: 300 },
      { x: 0, y: 980, width: 1080, height: 100 },
      { x: 0, y: 0, width: 1080, height: 1080 },
      { x: 500, y: 500, width: 10, height: 10 },
    ]
    for (const to of [mpu, { width: 728, height: 90 }, { width: 1080, height: 1920 }, { width: 8000, height: 1000 }]) {
      for (const root of roots) {
        const child = { x: root.x, y: root.y + root.height / 2, width: root.width / 2, height: root.height / 2 }
        const r = fitted(root, root, { from: square, to })
        const c = fitted(child, root, { from: square, to })
        for (const box of [r, c]) {
          expect(box.x).toBeGreaterThanOrEqual(-0.01)
          expect(box.y).toBeGreaterThanOrEqual(-0.01)
          expect(box.x + box.width).toBeLessThanOrEqual(to.width + 0.01)
          expect(box.y + box.height).toBeLessThanOrEqual(to.height + 0.01)
        }
        expect(c.x).toBeGreaterThanOrEqual(r.x - 0.01)
        expect(c.y + c.height).toBeLessThanOrEqual(r.y + r.height + 0.01)
      }
    }
  })

  it('copies rotation, visibility, strokes, corners and effects as they are', () => {
    const kept = {
      rotation: 30,
      visible: false,
      opacity: 0.5,
      cornerRadius: [4, 8, 12, 16],
      strokes: [{ paint: { type: 'solid', color: '#000000FF' }, width: 6, align: 'inside' }],
      effects: [{ type: 'drop-shadow', color: '#00000080', x: 0, y: 4, blur: 12, spread: 0 }],
    }
    const box = { x: 100, y: 100, width: 400, height: 300, ...kept }
    const { x, y, width, height, ...rest } = fitted(box, box, { from: square, to: mpu })
    expect({ x, y, width, height }).toEqual({ x: 37.04, y: 23.15, width: 92.59, height: 69.44 })
    expect(rest).toEqual(kept)
  })

  it('scales an auto layout box’s gap, line gap and paddings with its size, so its children stay inside it', () => {
    const layout = {
      direction: 'row',
      gap: 40,
      padding: { top: 50, right: 50, bottom: 50, left: 50 },
      justify: 'start',
      wrap: true,
      lineGap: 12,
    }
    // Three 140 × 100 children fill the row exactly: 50 + 140 + 40 + 140 + 40 + 140 + 50 = 600.
    const row = { x: 240, y: 440, width: 600, height: 200, layout }
    const child = (i: number) => ({ x: 290 + i * 180, y: 490, width: 140, height: 100 })
    const fit = { from: square, to: mpu }
    const s = 250 / 1080

    const box = fitted(row, row, fit)

    expect(box.layout).toEqual({
      ...layout,
      gap: 9.26,
      padding: { top: 11.57, right: 11.57, bottom: 11.57, left: 11.57 },
      lineGap: 2.78,
    })
    const children = [0, 1, 2].map((i) => fitted(child(i), row, fit))
    const across = children.reduce((sum, c) => sum + c.width, 0) + 2 * box.layout.gap
    expect(box.layout.padding.left + across + box.layout.padding.right).toBeLessThanOrEqual(box.width + 0.01)
    expect(box.layout.padding.top + (children[0]?.height ?? 0) + box.layout.padding.bottom).toBeLessThanOrEqual(
      box.height + 0.01,
    )
    expect(box.width).toBeCloseTo(600 * s, 1)
  })

  it('scales a text’s font size, its runs’ font sizes where they set one, and its shrink-to-fit sizes', () => {
    const headline = {
      x: 0,
      y: 0,
      width: 1080,
      height: 200,
      text: 'Summer sale',
      style: { fontFamily: 'Noto Sans', fontSize: 84, color: '#111111FF', letterSpacing: 2 },
      runs: [
        { start: 0, end: 6, style: { fontWeight: 800 } },
        { start: 7, end: 11, style: { fontSize: 100 } },
      ],
      shrinkToFit: { min: 20, max: 120 },
      paragraphSpacing: 10,
    }
    const half = { width: 540, height: 1080 }
    expect(fitted(headline, headline, { from: square, to: half })).toEqual({
      ...headline,
      x: 0,
      y: 50,
      width: 540,
      height: 100,
      style: { ...headline.style, fontSize: 42 },
      runs: [
        { start: 0, end: 6, style: { fontWeight: 800 } },
        { start: 7, end: 11, style: { fontSize: 50 } },
      ],
      shrinkToFit: { min: 10, max: 60 },
    })
  })

  it('gives a path drawn at its own size its old box as the box it was drawn in, so its drawing scales with it', () => {
    const path = { x: 0, y: 0, width: 108, height: 54, shape: { kind: 'path', d: 'M0 0L108 54' } }
    const half = { width: 540, height: 540 }
    expect(fitted(path, path, { from: square, to: half }).shape).toEqual({
      kind: 'path',
      d: 'M0 0L108 54',
      drawnIn: { width: 108, height: 54 },
    })
    const drawn = { ...path, shape: { ...path.shape, drawnIn: { width: 10, height: 5 } } }
    expect(fitted(drawn, drawn, { from: square, to: half }).shape).toEqual(drawn.shape)
    const rect = { ...path, shape: { kind: 'rect', cornerRadius: 12 } }
    expect(fitted(rect, rect, { from: square, to: half }).shape).toEqual(rect.shape)
  })
})
