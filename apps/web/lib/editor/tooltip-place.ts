// Where a greyed menu row's tooltip goes so it covers no row of another menu: beside the row at its
// end when the window has room there, otherwise above or below it, lined up with the row's start,
// middle or end, whichever first keeps clear of the other open menus. On a phone it goes above the
// row, clear of the finger that tapped it, and below only when the room above can't hold it. Where
// the row's own menu lies over another, the tooltip may cover what the own menu covers.

/** A box in the window, in CSS pixels. */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Where a tooltip goes, as Radix takes it: the side of its row and how it lines up along it. */
export interface TooltipPlace {
  side: 'top' | 'right' | 'bottom' | 'left'
  align: 'start' | 'center' | 'end'
}

/** Pixels between a tooltip and its row, as the tooltip keeps them. */
const GAP = 8
/** Pixels a tooltip keeps from the window's edges. */
const EDGE = 8

/**
 * The first place that fits in the window and covers no other open menu outside the row's own,
 * trying beside the row at its end, then above, then below, or on a `phone` above, then below; when
 * each covers some, the one that covers least. `rtl` puts the end on the left, and lines a tooltip's
 * start up with the row's right edge, as Radix does in a right-to-left page.
 */
export function tooltipPlace({
  row,
  size,
  own,
  others,
  room,
  rtl,
  phone = false,
}: {
  row: Box
  size: { width: number; height: number }
  /** The menu the row is in. */
  own: Box
  /** The other menus open now. */
  others: readonly Box[]
  room: { width: number; height: number }
  rtl: boolean
  /** The screen is a phone's, tapped with a finger: the tooltip goes above the row, clear of it. */
  phone?: boolean
}): TooltipPlace {
  const end = rtl ? 'left' : 'right'
  const aboveOrBelow = (['top', 'bottom'] as const).flatMap((side) =>
    (['start', 'center', 'end'] as const).map((align) => ({ side, align })),
  )
  const places: TooltipPlace[] = phone ? aboveOrBelow : [{ side: end, align: 'center' }, ...aboveOrBelow]
  let best: { place: TooltipPlace; covered: number } | null = null
  for (const place of places) {
    const box = boxAt(place, row, size, room, rtl)
    if (!box) continue
    const covered = others.reduce((sum, other) => sum + area(box, other) - area(box, other, own), 0)
    if (covered < 0.5) return place
    if (!best || covered < best.covered) best = { place, covered }
  }
  return best?.place ?? { side: 'bottom', align: 'center' }
}

/**
 * Where a tooltip of this size lands in a place, moved along its row to stay in the window as
 * Radix moves it; null when its side has no room.
 */
function boxAt(
  { side, align }: TooltipPlace,
  row: Box,
  size: { width: number; height: number },
  room: { width: number; height: number },
  rtl: boolean,
): Box | null {
  const into = (value: number, length: number, limit: number) => Math.max(EDGE, Math.min(value, limit - EDGE - length))
  if (side === 'left' || side === 'right') {
    const left = side === 'right' ? row.right + GAP : row.left - GAP - size.width
    if (left < EDGE || left + size.width > room.width - EDGE) return null
    const top = into((row.top + row.bottom) / 2 - size.height / 2, size.height, room.height)
    return { left, top, right: left + size.width, bottom: top + size.height }
  }
  const top = side === 'top' ? row.top - GAP - size.height : row.bottom + GAP
  if (top < EDGE || top + size.height > room.height - EDGE) return null
  const start = rtl ? row.right - size.width : row.left
  const finish = rtl ? row.left : row.right - size.width
  const wanted = align === 'start' ? start : align === 'end' ? finish : (row.left + row.right) / 2 - size.width / 2
  const left = into(wanted, size.width, room.width)
  return { left, top, right: left + size.width, bottom: top + size.height }
}

/** How much of `a` lies in `b`, and in `c` too when given, in square pixels. */
function area(a: Box, b: Box, c: Box = b) {
  const width = Math.min(a.right, b.right, c.right) - Math.max(a.left, b.left, c.left)
  const height = Math.min(a.bottom, b.bottom, c.bottom) - Math.max(a.top, b.top, c.top)
  return Math.max(0, width) * Math.max(0, height)
}
