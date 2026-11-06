// How a number field's value follows a drag across it, a scrub. On a field with a fill, the fill's
// edge stays under the pointer: the knob's width spans the fill's range. On a field without one,
// every field moves PX_PER_STEP screen pixels for each step it shows. Shift makes the drag ten
// times as fast in steps ten times as big; Alt, on a field whose steps are fractions, a tenth as
// fast in steps a tenth as big, never finer than the hundredths a field shows. Either takes effect
// from the moment it goes down or up: the value reached stays, and the rest of the drag goes at the
// new speed. Values are as the field shows them, after its scale.

/** A field as a scrub sees it, in the value as shown. */
export interface ScrubField {
  /** One step of the value. */
  step: number
  /** Where the value stops either way. */
  min: number
  max: number
  /** The range the fill spans the knob with, or null on a field without a fill. */
  range: readonly [number, number] | null
  /** How wide the fill's range is on screen, in px: the knob's inside. */
  width: number
}

/** The keys that change a scrub's speed, as a pointer event has them. */
export interface ScrubKeys {
  shiftKey: boolean
  altKey: boolean
}

/** A scrub under way. */
export interface Scrub {
  /** The value where the speed last changed: where the drag started, or where Shift or Alt went down or up. */
  from: number
  /** How far the pointer has gone since then, in px towards the field's end. */
  moved: number
  /** How many of the field's steps one step of the drag is now: 10 with Shift, a tenth with Alt, else 1. */
  pace: number
  /** The value the drag has reached. */
  value: number
}

/** Screen pixels a drag moves a field without a fill by for each step it shows. */
export const PX_PER_STEP = 2

/**
 * A field as a scrub sees it, from the field's own numbers: its step as shown, its limits and its
 * fill's range as stored, the scale between them, and the knob's inner width. A range that isn't
 * finite, or a knob with no width, leaves the field without a fill to follow.
 */
export function scrubOf({
  step,
  min,
  max,
  scale,
  range,
  width,
}: {
  step: number
  min: number
  max: number
  scale: number
  range: readonly [number, number] | undefined
  width: number
}): ScrubField {
  const spans = range && Number.isFinite(range[0]) && Number.isFinite(range[1]) && range[1] > range[0] && width > 0
  return {
    step,
    min: min * scale,
    max: max * scale,
    range: spans ? [range[0] * scale, range[1] * scale] : null,
    width,
  }
}

/** A scrub starting at a value. */
export function startScrub(value: number): Scrub {
  return { from: value, moved: 0, pace: 1, value }
}

/** A scrub carried on by `by` px towards the field's end, with `keys` held for that move. */
export function scrubBy(scrub: Scrub, field: ScrubField, by: number, keys: ScrubKeys): Scrub {
  const pace = paceOf(field.step, keys)
  // A change of keys starts the rest of the drag from the value reached.
  const { from, moved } = pace === scrub.pace ? scrub : { from: scrub.value, moved: 0 }
  const travelled = moved + by
  const quantum = field.step * pace
  const perPx = (field.range ? (field.range[1] - field.range[0]) / field.width : field.step / PX_PER_STEP) * pace
  const steps = Math.round((travelled * perPx) / quantum)
  const value = Math.min(field.max, Math.max(field.min, roundOff(from + steps * quantum)))
  return { from, moved: travelled, pace, value }
}

/** How many of a field's steps one step of a drag is, with these keys held. */
function paceOf(step: number, { shiftKey, altKey }: ScrubKeys) {
  if (shiftKey) return 10
  if (altKey && step < 1) return Math.max(0.1, 0.01 / step)
  return 1
}

/** A sum of steps without the float's last-digit noise (0.1 + 0.2). */
function roundOff(n: number) {
  return Math.round(n * 1e9) / 1e9
}
