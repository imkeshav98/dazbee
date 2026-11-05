import { describe, expect, it } from 'vitest'

import type { Design } from '@dazbee/schema'

import { type Frame, frameAt, frameIn, pageFrames } from './frames.ts'
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
