import { describe, expect, it } from 'vitest'

import { FRAME_GAP, type Rect } from '@dazbee/schema'

import { fit, framesInView, toScreen, toWorld, visibleRect, zoomAt } from './camera.ts'
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

describe('framesInView', () => {
  it('draws the frames the viewport shows any part of, and only those', () => {
    const viewport = { width: 1000, height: 600 }
    // At 100%, from one-story's top start corner: a 1000 × 600 part of it only.
    const story = frames.find((f) => f.key === 'one-story') ?? { x: 0, y: 0 }
    expect(framesInView(frames, { x: -story.x, y: -story.y, zoom: 1 }, viewport).map((f) => f.key)).toEqual([
      'one-story',
    ])
    // Moved the gap and one pixel toward the start, one-sq's last column of pixels shows too.
    expect(
      framesInView(frames, { x: -story.x + FRAME_GAP + 1, y: -story.y, zoom: 1 }, viewport).map((f) => f.key),
    ).toEqual(['one-sq', 'one-story'])
    expect(framesInView(frames, fit(bounds, viewport), viewport)).toHaveLength(3)
  })
})
