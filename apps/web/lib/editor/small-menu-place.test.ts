import { describe, expect, it } from 'vitest'

import { type Box, smallMenuPlace } from './small-menu-place.ts'

/** The stage at 1280×760, under the top bar, with the menu's size. */
const ROOM = { width: 1280, height: 760 }
const MENU = { width: 166, height: 38 }
/** The top bar of a text, kept 8 px off. */
const BAR: Box = { left: 266, top: 82, right: 1014, bottom: 136 }
/** The square's, story's and landscape's labels in a row above them, kept 8 px off. */
const LABELS: Box[] = [
  { left: 421, top: 160, right: 585, bottom: 188 },
  { left: 597, top: 160, right: 761, bottom: 188 },
  { left: 773, top: 160, right: 953, bottom: 188 },
]
const BASE = { ...MENU, room: ROOM, floor: 752, under: 136 }

/** How far apart a menu at `left` and a selection are across: 0 while they overlap. */
const apart = (left: number, rect: { x: number; width: number }) =>
  Math.max(0, rect.x - (left + MENU.width), left - (rect.x + rect.width))

describe('smallMenuPlace', () => {
  it('sits above the selection, centred, when that place is free', () => {
    const rect = { x: 440, y: 400, width: 126, height: 48 }
    expect(smallMenuPlace({ ...BASE, rect, blocked: [BAR, ...LABELS] })).toEqual({ left: 420, top: 334 })
  })

  it('takes the free place below the selection when a frame’s label blocks the one above, before sliding', () => {
    // The square's headline under its label, as at 1280×760 with the page fitted.
    const rect = { x: 440, y: 196, width: 126, height: 48 }
    expect(smallMenuPlace({ ...BASE, rect, blocked: [BAR, ...LABELS] })).toEqual({ left: 420, top: 272 })
  })

  it('slides only as far as it stays by the selection', () => {
    // Above and below are both covered in the middle; the free spot far to the side is not taken.
    const rect = { x: 440, y: 196, width: 126, height: 48 }
    const under: Box = { left: 300, top: 264, right: 700, bottom: 320 }
    const place = smallMenuPlace({ ...BASE, rect, blocked: [BAR, ...LABELS, under] })
    if (place) expect(apart(place.left, rect)).toBe(0)
  })

  it('slides sideways off what it would cover while it still overlaps the selection', () => {
    // Near the stage's bottom, so the only place is above, where a post stands.
    const rect = { x: 600, y: 600, width: 300, height: 48 }
    const post: Box = { left: 640, top: 520, right: 760, bottom: 580 }
    const place = smallMenuPlace({ ...BASE, floor: 700, rect, blocked: [post] })
    expect(place?.top).toBe(534)
    expect(apart(place?.left ?? 0, rect)).toBe(0)
    expect((place?.left ?? 0) + MENU.width <= post.left || (place?.left ?? 0) >= post.right).toBe(true)
  })

  it('goes under the top bar when the selection fills the stage', () => {
    const rect = { x: 100, y: 20, width: 1000, height: 730 }
    expect(smallMenuPlace({ ...BASE, rect, blocked: [BAR] })).toEqual({ left: 517, top: 136 })
  })

  it('goes just past what covers the place below, then above, while every place by the selection and under the bar is covered, as on a phone', () => {
    // Copies selected on a 390×844 phone: the frames' labels above, the bar's two rows, a label just below.
    const kept = (left: number, top: number, right: number, bottom: number): Box => ({
      left: left - 8,
      top: top - 8,
      right: right + 8,
      bottom: bottom + 8,
    })
    const blocked = [
      kept(31, 72, 359, 122),
      kept(144, 127, 246, 177),
      kept(16, 198, 119, 218),
      kept(138, 198, 241, 218),
      kept(260, 198, 374, 218),
      kept(16, 407, 119, 427),
      kept(51, 723, 340, 771),
    ]
    const rect = { x: 73, y: 253, width: 38, height: 66 }
    const place = smallMenuPlace({
      rect,
      width: 261,
      height: 53,
      room: { width: 390, height: 844 },
      blocked,
      floor: 832,
      under: 185,
    })
    expect(place).toEqual({ left: 8, top: 435 })
  })
})
