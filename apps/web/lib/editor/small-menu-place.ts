// Where the small menu sits by the selection, on the stage: above it, else below it, else under
// the top bar. Each place is tried centred on the selection first, so a label over the selection
// sends the menu below it rather than sideways; only then does a place move sideways off what it
// would cover, and never so far that the menu no longer overlaps the selection. Null while no
// place is free.

/** A box on the stage, in pixels from its top start corner. */
export type Box = { left: number; top: number; right: number; bottom: number }

/** Pixels kept between the menu and anything it keeps off. */
export const CLEAR = 8

/** Pixels between the selection and the menu, clear of the turn handles round its corners. */
const GAP = 28
/** Pixels of the selection, across, that the menu keeps over, so it never slides away from it. */
const OVERLAP = 24

/**
 * `value` kept between `low` and `high`. When `low` is above `high`, as on a phone narrower than the
 * menu, `low` wins, so the menu keeps to the start edge.
 */
const clampInto = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high))
const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** Where the menu goes for a selection, or null while every place by it is covered. */
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
  const fits = (top: number) => top >= 0 && top + height <= floor
  const near = [rect.y - height - GAP, rect.y + rect.height + GAP].map((top) => Math.round(top)).filter(fits)
  // The menu overlaps what shows of the selection by OVERLAP, or all of it when it is narrower.
  const shownLeft = Math.max(rect.x, 0)
  const shownRight = Math.min(rect.x + rect.width, room.width)
  const overlap = Math.min(OVERLAP, Math.max(shownRight - shownLeft, 0))
  const low = Math.max(shownLeft + overlap - width, CLEAR)
  const high = Math.min(shownRight - overlap, room.width - width - CLEAR)
  const centred = clampInto(rect.x + rect.width / 2 - width / 2, CLEAR, room.width - width - CLEAR)
  const free = (left: number, top: number) =>
    !blocked.some((b) => meets({ left, top, right: left + width, bottom: top + height }, b))
  for (const top of near) if (free(centred, top)) return { left: Math.round(centred), top }
  for (const top of near) {
    const left = slid(centred, top)
    if (left !== null) return { left: Math.round(left), top }
  }
  const top = Math.round(under)
  if (!fits(top)) return null
  const left = free(centred, top) ? centred : slid(centred, top)
  return left === null ? null : { left: Math.round(left), top }

  /** Moves sideways off what the menu would cover, the shorter way, kept by the selection; null while it still covers something. */
  function slid(from: number, top: number) {
    let left = from
    for (let tries = 0; tries < 4; tries++) {
      const hit = blocked.find((b) => meets({ left, top, right: left + width, bottom: top + height }, b))
      if (!hit) return left >= low - 0.5 && left <= high + 0.5 ? left : null
      const toStart = hit.left - width
      const toEnd = hit.right
      const next = Math.abs(toStart - left) <= Math.abs(toEnd - left) && toStart >= low ? toStart : toEnd
      if (next < low - 0.5 || next > high + 0.5) return null
      left = next
    }
    return free(left, top) ? left : null
  }
}
