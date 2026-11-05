import { describe, expect, it } from 'vitest'

import type { Design } from '@dazbee/schema'

import { type Frame, frameAt, frameIn, labelBox, labelTextAt, pageFrames } from './frames.ts'
import { design } from './test-design.ts'

/** The test design with page `two`'s frames gone. */
const withEmptyPage: Design = {
  ...design,
  frames: Object.fromEntries(Object.entries(design.frames).filter(([, f]) => f.pageId !== 'two')),
}

describe('frameIn', () => {
  it('reads a stored frame as the canvas shows it, keyed by its id', () => {
    expect(frameIn(design, 'two-mpu')).toEqual({
      id: 'two-mpu',
      pageId: 'two',
      name: 'MPU',
      x: 2560,
      y: 0,
      width: 300,
      height: 250,
    })
  })

  it('finds no frame for an id the design lacks', () => {
    expect(frameIn(design, 'gone')).toBeUndefined()
    expect(frameIn(design, 'constructor')).toBeUndefined()
  })
})

describe('pageFrames', () => {
  it("lists a page's frames by order, at their stored places, and the box round them", () => {
    const { frames, bounds } = pageFrames(design, 'one')
    expect(frames.map((f) => f.id)).toEqual(['one-sq', 'one-story', 'one-mpu'])
    expect(frames[1]).toMatchObject({ x: 1280, y: 0, width: 1080, height: 1920 })
    expect(bounds).toEqual({ x: 0, y: 0, width: 2860, height: 1920 })
  })

  it('bounds frames that sit anywhere on the page, before the origin too', () => {
    const moved: Design = {
      ...design,
      frames: {
        ...design.frames,
        'one-sq': { ...(design.frames['one-sq'] as Design['frames'][string]), x: -500, y: 300 },
      },
    }
    expect(pageFrames(moved, 'one').bounds).toEqual({ x: -500, y: 0, width: 3360, height: 1920 })
  })

  it('has no frames and null bounds for a page with none, or a page the design lacks', () => {
    expect(pageFrames(withEmptyPage, 'two')).toEqual({ frames: [], bounds: null })
    expect(pageFrames(design, 'gone')).toEqual({ frames: [], bounds: null })
  })
})

describe('frameAt', () => {
  const frame = (key: string, x: number, y: number, width: number, height: number): Frame => ({
    id: key,
    pageId: 'p1',
    name: key,
    x,
    y,
    width,
    height,
  })

  it('finds the frame under a world point, or none in the space between frames', () => {
    const { frames } = pageFrames(design, 'one')
    expect(frameAt(frames, { x: 1280 + 5, y: 1500 })?.id).toBe('one-story')
    expect(frameAt(frames, { x: 1080 + 5, y: 5 })).toBeUndefined()
  })

  it('takes the topmost of overlapping frames: the last by order', () => {
    const frames = [frame('under', 0, 0, 500, 500), frame('over', 400, 400, 500, 500)]
    expect(frameAt(frames, { x: 450, y: 450 })?.id).toBe('over')
    expect(frameAt(frames, { x: 100, y: 100 })?.id).toBe('under')
  })
})

describe('labelBox', () => {
  const frame = { id: 'f', pageId: 'p', name: 'F', x: 100, y: 200, width: 400, height: 300 }

  it("is a row 20 px tall ending 4 px above the frame's top, as wide as the frame on screen", () => {
    expect(labelBox(frame, { x: 10, y: 20, zoom: 0.5 })).toEqual({ x: 60, y: 96, width: 200, height: 20 })
  })

  it("keeps its start 8 px in from the stage's start edge, along the part of the frame still showing", () => {
    expect(labelBox(frame, { x: -150, y: 0, zoom: 1 })).toEqual({ x: 8, y: 176, width: 342, height: 20 })
  })

  it('is null for a frame off the stage at its start', () => {
    expect(labelBox(frame, { x: -500, y: 0, zoom: 1 })).toBeNull()
  })
})

describe('labelTextAt', () => {
  /** A box in client pixels, as getBoundingClientRect gives it. */
  const box = (left: number, top: number, width: number, height = 20) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  })
  /** A label as the overlay draws one: its row, then its name and its size, each where it shows. */
  const label = (frame: string, row: ReturnType<typeof box>, ...texts: ReturnType<typeof box>[]) => ({
    dataset: { frame },
    getBoundingClientRect: () => row,
    children: texts.map((text) => ({ getBoundingClientRect: () => text })),
  })
  /** An overlay holding labels, in the order it drew them. */
  const overlay = (...labels: ReturnType<typeof label>[]) =>
    ({ querySelectorAll: () => labels }) as unknown as ParentNode
  // A over B's start: A's name at 0–40 and its size at 220–300; B's name at 200–230, its size wrapped
  // onto the hidden second line.
  const a = label('a', box(0, 76, 300), box(0, 76, 40), box(220, 76, 80))
  const b = label('b', box(200, 76, 300), box(200, 76, 30), box(200, 96, 80))

  it('finds the frame whose name or size is under a client point, the last drawn where labels overlap', () => {
    expect(labelTextAt(overlay(a, b), { x: 20, y: 86 })).toBe('a')
    expect(labelTextAt(overlay(a, b), { x: 260, y: 86 })).toBe('a')
    expect(labelTextAt(overlay(a, b), { x: 210, y: 86 })).toBe('b')
  })

  it("finds none beside the text on the label's row, under a size that wrapped out of sight, or off the row", () => {
    expect(labelTextAt(overlay(a, b), { x: 120, y: 86 })).toBeUndefined()
    expect(labelTextAt(overlay(a, b), { x: 450, y: 86 })).toBeUndefined()
    expect(labelTextAt(overlay(a, b), { x: 20, y: 100 })).toBeUndefined()
    expect(labelTextAt(overlay(), { x: 20, y: 86 })).toBeUndefined()
  })
})
