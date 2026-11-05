import { describe, expect, it } from 'vitest'

import { FRAME_GAP, type Rect } from '@dazbee/schema'

import {
  coverOf,
  fit,
  framesInView,
  reveal,
  revealLabel,
  toScreen,
  toWorld,
  visibleRect,
  widen,
  zoomAt,
} from './camera.ts'
import { intersects, pageFrames } from './frames.ts'
import { design } from './test-design.ts'

const page = pageFrames(design, 'one')
const bounds = page.bounds as Rect
const frames = page.frames

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed while zooming', () => {
    const camera = { x: 40, y: -12, zoom: 0.3 }
    const at = { x: 517, y: 233 }
    const before = toWorld(camera, at)
    for (const zoom of [0.05, 1, 7.5]) {
      const after = toWorld(zoomAt(camera, at, zoom), at)
      expect(after.x).toBeCloseTo(before.x, 9)
      expect(after.y).toBeCloseTo(before.y, 9)
    }
  })
})

describe('fit', () => {
  it('fits a rect inside the viewport, centred, and sees what it fits', () => {
    const viewport = { width: 1280, height: 800 }
    const camera = fit(bounds, viewport, 48)
    const topLeft = toScreen(camera, bounds)
    const bottomRight = toScreen(camera, { x: bounds.width, y: bounds.height })
    expect(topLeft.x).toBeGreaterThanOrEqual(48 - 1e-9)
    expect(topLeft.y).toBeGreaterThanOrEqual(48 - 1e-9)
    expect(bottomRight.x).toBeLessThanOrEqual(1280 - 48 + 1e-9)
    expect(bottomRight.y).toBeLessThanOrEqual(800 - 48 + 1e-9)
    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(640)
    for (const frame of frames) expect(intersects(frame, visibleRect(camera, viewport))).toBe(true)
  })

  it('fits between the floating chrome, centred in the clear part of the stage', () => {
    const viewport = { width: 1440, height: 850 }
    const insets = { top: 0, right: 320, bottom: 72, left: 76 }
    const camera = fit(bounds, viewport, 48, insets)
    const topLeft = toScreen(camera, bounds)
    const bottomRight = toScreen(camera, { x: bounds.x + bounds.width, y: bounds.y + bounds.height })
    expect(topLeft.x).toBeGreaterThanOrEqual(76 + 48 - 1e-9)
    expect(bottomRight.x).toBeLessThanOrEqual(1440 - 320 - 48 + 1e-9)
    expect(bottomRight.y).toBeLessThanOrEqual(850 - 72 - 48 + 1e-9)
    // Centred between the capsule and the cards, not on the whole stage.
    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(76 + (1440 - 76 - 320) / 2)
    expect(fit(bounds, viewport, 48, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual(fit(bounds, viewport, 48))
  })

  it('on a phone fits the ads to its width and puts them at the top of the clear part', () => {
    const viewport = { width: 390, height: 760 }
    const insets = { top: 64, right: 0, bottom: 150, left: 0 }
    const camera = fit(bounds, viewport, undefined, insets)
    const topLeft = toScreen(camera, bounds)
    const bottomRight = toScreen(camera, { x: bounds.x + bounds.width, y: bounds.y + bounds.height })
    expect(topLeft.y).toBeCloseTo(64 + 32)
    expect(topLeft.x).toBeGreaterThanOrEqual(16 - 1e-9)
    expect(bottomRight.x).toBeLessThanOrEqual(390 - 16 + 1e-9)
    expect(bottomRight.y).toBeLessThanOrEqual(760 - 150 - 16 + 1e-9)
    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(195)
  })
})

describe('reveal', () => {
  const viewport = { width: 1000, height: 800 }
  const insets = { top: 60, right: 300, bottom: 0, left: 0 }
  const camera = { x: 100, y: 100, zoom: 0.5 }

  it('keeps the camera when the clear part of the stage shows the rect whole, with room for its label', () => {
    expect(reveal(camera, { x: 0, y: 0, width: 1080, height: 1080 }, viewport, insets)).toBe(camera)
  })

  it('pans, at the same zoom, to centre a rect that runs off the clear part of the stage', () => {
    const next = reveal(camera, { x: 1280, y: 0, width: 1080, height: 1080 }, viewport, insets)
    expect(next.zoom).toBe(0.5)
    const topLeft = toScreen(next, { x: 1280, y: 0 })
    const bottomRight = toScreen(next, { x: 2360, y: 1080 })
    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(350)
    expect((topLeft.y + bottomRight.y) / 2).toBeCloseTo(430)
  })
})

describe('revealLabel', () => {
  const viewport = { width: 1000, height: 800 }
  const insets = { top: 60, right: 0, bottom: 80, left: 90 }
  const square = { x: 0, y: 0, width: 1080, height: 1080 }

  it('keeps the camera when the clear part of the stage shows the label over the frame’s top start corner', () => {
    const camera = { x: 200, y: 160, zoom: 0.5 }
    expect(revealLabel(camera, square, viewport, insets)).toBe(camera)
  })

  it('pans down and along, at the same zoom, to a label above and before the stage, as at 375% on the frame’s middle', () => {
    const camera = { x: 500 - 540 * 3.75, y: 400 - 540 * 3.75, zoom: 3.75 }
    const next = revealLabel(camera, square, viewport, insets)
    expect(next.zoom).toBe(3.75)
    expect(toScreen(next, { x: 0, y: 0 })).toEqual({ x: 106, y: 100 })
  })

  it('pans only down to a label above the stage whose corner is in from the start', () => {
    const next = revealLabel({ x: 300, y: -300, zoom: 0.5 }, square, viewport, insets)
    expect(next).toEqual({ x: 300, y: 100, zoom: 0.5 })
  })

  it('pans up and back to a label past the stage’s end and bottom, leaving room for its name', () => {
    const next = revealLabel({ x: 1200, y: 900, zoom: 1 }, square, viewport, insets)
    expect(toScreen(next, { x: 0, y: 0 })).toEqual({ x: 864, y: 704 })
  })
})

describe('coverOf', () => {
  const stage = { x: 0, y: 0, width: 1440, height: 1000 }

  it('covers the side a panel floats on, past its edge by the gap', () => {
    expect(coverOf({ x: 116, y: 80, width: 344, height: 600 }, stage)).toEqual({ left: 472 })
    expect(coverOf({ x: 980, y: 80, width: 344, height: 600 }, stage)).toEqual({ right: 472 })
  })

  it('covers the bottom for a panel across most of the stage, as on a phone', () => {
    expect(coverOf({ x: 12, y: 245, width: 366, height: 472 }, { x: 0, y: 0, width: 390, height: 844 })).toEqual({
      bottom: 611,
    })
  })

  it('measures from the stage, wherever it is on the page', () => {
    expect(coverOf({ x: 216, y: 180, width: 344, height: 600 }, { ...stage, x: 100, y: 100 })).toEqual({ left: 472 })
  })
})

describe('widen', () => {
  it('keeps each edge clear of the chrome and of what covers it, the larger of the two', () => {
    const chrome = { top: 70, right: 12, bottom: 90, left: 96 }
    expect(widen(chrome, { left: 472 })).toEqual({ top: 70, right: 12, bottom: 90, left: 472 })
    expect(widen(chrome, { bottom: 40, top: 20 })).toEqual(chrome)
    expect(widen(chrome, {})).toEqual(chrome)
  })
})

describe('framesInView', () => {
  it('draws the frames the viewport shows any part of, and only those', () => {
    const viewport = { width: 1000, height: 600 }
    // At 100%, from one-story's top start corner: a 1000 × 600 part of it only.
    const story = frames.find((f) => f.id === 'one-story') ?? { x: 0, y: 0 }
    expect(framesInView(frames, { x: -story.x, y: -story.y, zoom: 1 }, viewport).map((f) => f.id)).toEqual([
      'one-story',
    ])
    // Moved the gap and one pixel toward the start, one-sq's last column of pixels shows too.
    expect(
      framesInView(frames, { x: -story.x + FRAME_GAP + 1, y: -story.y, zoom: 1 }, viewport).map((f) => f.id),
    ).toEqual(['one-sq', 'one-story'])
    expect(framesInView(frames, fit(bounds, viewport), viewport)).toHaveLength(3)
  })
})
