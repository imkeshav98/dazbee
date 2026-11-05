// A scrub: a field with a fill keeps the fill's edge under the pointer, a field without one moves the
// same distance on screen per step it shows, and Shift and Alt change the speed from the moment
// they go down or up without jumping the value reached.
import { describe, expect, it } from 'vitest'

import { PX_PER_STEP, scrubBy, type ScrubField, scrubOf, startScrub } from './scrub.ts'

const NO_KEYS = { shiftKey: false, altKey: false }
const SHIFT = { shiftKey: true, altKey: false }
const ALT = { shiftKey: false, altKey: true }

/** Opacity, 0 to 100% as shown, its fill 200 px wide. */
const opacity: ScrubField = { step: 1, min: 0, max: 100, range: [0, 100], width: 200 }
/** A position, any value, without a fill. */
const position: ScrubField = { step: 1, min: -100_000, max: 100_000, range: null, width: 120 }
/** A line height, its fill from 0.8 to 2, 150 px wide, in steps of 0.05. */
const lineHeight: ScrubField = { step: 0.05, min: 0.5, max: 10, range: [0.8, 2], width: 150 }

/** A drag of `moves` px each, from `value`, every move with the same keys unless given. */
const drag = (field: ScrubField, value: number, moves: number[], keys: (typeof NO_KEYS)[] = []) =>
  moves.reduce((scrub, by, i) => scrubBy(scrub, field, by, keys[i] ?? NO_KEYS), startScrub(value))

describe('scrubOf', () => {
  it('spans the fill across the knob when the field has a finite range', () => {
    expect(scrubOf({ step: 1, min: 0, max: 1, scale: 100, range: [0, 1], width: 200 })).toEqual(opacity)
    expect(scrubOf({ step: 0.5, min: 0.5, max: 100_000, scale: 1, range: [0, 24], width: 96 })).toMatchObject({
      range: [0, 24],
      min: 0.5,
      max: 100_000,
    })
  })

  it('has no range for a field that turns round or has no top', () => {
    const turn = { step: 1, min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY, scale: 1, width: 120 }
    expect(scrubOf({ ...turn, range: [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY] }).range).toBeNull()
    expect(scrubOf({ ...turn, range: undefined }).range).toBeNull()
    expect(scrubOf({ ...turn, range: [0, 0], width: 120 }).range).toBeNull()
  })

  it('has no range while the knob has no width, so the drag moves by steps', () => {
    expect(scrubOf({ step: 1, min: 0, max: 1, scale: 100, range: [0, 1], width: 0 }).range).toBeNull()
  })
})

describe('scrubBy', () => {
  it('keeps a filled field’s edge under the pointer: the knob’s width spans the range', () => {
    // From 20%, 200 px is the whole range: 50 px is a quarter of it.
    expect(drag(opacity, 20, [50]).value).toBe(45)
    expect(drag(opacity, 20, [25, 25, 50]).value).toBe(70)
    // A line height's fill spans 1.2 over 150 px: 75 px is 0.6.
    expect(drag(lineHeight, 1.2, [75]).value).toBeCloseTo(1.8, 10)
  })

  it('moves a field without a fill one step per PX_PER_STEP, whatever its step', () => {
    expect(drag(position, 80, [10 * PX_PER_STEP]).value).toBe(90)
    expect(drag({ ...position, step: 0.1 }, 1, [10 * PX_PER_STEP]).value).toBeCloseTo(2, 10)
    expect(drag({ ...position, step: 0.5 }, 0, [3 * PX_PER_STEP]).value).toBe(1.5)
  })

  it('lands on whole steps from where the drag started', () => {
    expect(drag(position, 37.5, [3]).value).toBe(39.5)
    expect(drag(opacity, 20, [1]).value).toBe(21)
    expect(drag(opacity, 20, [0.9]).value).toBe(20)
  })

  it('stops at the ends and, coming back, moves only once the pointer is over the fill again', () => {
    const past = drag(opacity, 80, [100])
    expect(past.value).toBe(100)
    // 60 px back from 140% leaves 110%: still at the end.
    expect(scrubBy(past, opacity, -60, NO_KEYS).value).toBe(100)
    expect(scrubBy(past, opacity, -80, NO_KEYS).value).toBe(90)
  })

  it('goes ten times as fast, in steps of ten, with Shift', () => {
    expect(drag(position, 80, [PX_PER_STEP], [SHIFT]).value).toBe(90)
    expect(drag(opacity, 20, [10], [SHIFT]).value).toBe(70)
  })

  it('goes a tenth as fast with Alt where the steps are fractions, never finer than a hundredth', () => {
    expect(drag({ ...position, step: 0.5 }, 1, [PX_PER_STEP], [ALT]).value).toBeCloseTo(1.05, 10)
    // Steps of 0.05 go in hundredths: a fifth as fast.
    expect(drag(lineHeight, 1.2, [75], [ALT]).value).toBeCloseTo(1.32, 10)
    // Whole steps don't change with Alt.
    expect(drag(position, 80, [10 * PX_PER_STEP], [ALT]).value).toBe(90)
  })

  it('never jumps what was dragged when Shift goes down mid-drag, nor when it comes up', () => {
    const plain = drag(position, 80, [20])
    expect(plain.value).toBe(90)
    // Shift down with no further move: the value stays.
    expect(scrubBy(plain, position, 0, SHIFT).value).toBe(90)
    const fast = scrubBy(plain, position, PX_PER_STEP, SHIFT)
    expect(fast.value).toBe(100)
    expect(scrubBy(fast, position, 0, NO_KEYS).value).toBe(100)
    expect(scrubBy(fast, position, PX_PER_STEP, NO_KEYS).value).toBe(101)
  })

  it('never jumps what was dragged when Alt goes down or up mid-drag', () => {
    const plain = drag(lineHeight, 1.2, [75])
    const fine = scrubBy(plain, lineHeight, 0, ALT)
    expect(fine.value).toBeCloseTo(plain.value, 10)
    expect(scrubBy(fine, lineHeight, 0, NO_KEYS).value).toBeCloseTo(plain.value, 10)
  })

  it('moves a value the layers don’t share by the same amount from 0, with no ends', () => {
    const mixed = { ...position, min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY }
    expect(drag(mixed, 0, [-200_002]).value).toBe(-100_001)
  })
})
