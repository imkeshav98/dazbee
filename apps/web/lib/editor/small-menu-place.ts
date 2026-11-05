// Where the small menu sits by the selection, on the stage: above it, else below it, else under
// the top bar; each place moves sideways off what it would cover, and the first that covers nothing
// wins. Null while no place is free.

/** A box on the stage, in pixels from its top start corner. */
export type Box = { left: number; top: number; right: number; bottom: number }

/** Pixels kept between the menu and anything it keeps off. */
export const CLEAR = 8

/** Pixels between the selection and the menu, clear of the turn handles round its corners. */
const GAP = 28

/**
 * `value` kept between `low` and `high`. When `low` is above `high`, as on a phone narrower than the
 * menu, `low` wins, so the menu keeps to the start edge.
 */
const clampInto = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high))
const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** Where the menu goes for a selection, or null while every place is covered. */
export function smallMenuPlace({
  rect,
  width,
  height,
  room,
  blocked,
  floor,
  under,
}: {
  /** The selection on the stage, with its size label. */
  rect: { x: number; y: number; width: number; height: number }
  /** The menu's width and height. */
  width: number
  height: number
  /** The stage's size. */
  room: { width: number; height: number }
  /** What the menu keeps off. */
  blocked: Box[]
  /** The lowest the menu's bottom may go. */
  floor: number
  /** The top of the place under the top bar. */
  under: number
}): { left: number; top: number } | null {
  const centre = rect.x + rect.width / 2 - width / 2
  for (const wanted of [rect.y - height - GAP, rect.y + rect.height + GAP, under]) {
    const top = Math.round(wanted)
    if (top < 0 || top + height > floor) continue
    // Off whatever it would cover, moving sideways the shorter way; still covering, try the next place.
    let left = clampInto(centre, CLEAR, room.width - width - CLEAR)
    for (let tries = 0; tries < 4; tries++) {
      const box = { left, top, right: left + width, bottom: top + height }
      const hit = blocked.find((b) => meets(box, b))
      if (!hit) break
      const toStart = hit.left - width
      const toEnd = hit.right
      left = clampInto(
        Math.abs(toStart - left) <= Math.abs(toEnd - left) && toStart >= CLEAR ? toStart : toEnd,
        CLEAR,
        room.width - width - CLEAR,
      )
    }
    const box = { left, top, right: left + width, bottom: top + height }
    if (blocked.some((b) => meets(box, b))) continue
    const at = { left: Math.round(left), top }
    return at
  }
  return null
}
