// Where a greyed menu row's tooltip goes so it covers no row of any open menu, its own menu's and a
// back row included. On tablet and desktop it goes beside the row, at its end when the window has
// room there, else at its start; otherwise past the top or the bottom of the row's own menu, lined
// up with the row's start, middle or end. On a phone it goes just above the row's menu (the sheet),
// clear of every row and of the finger that tapped it, and below the menu only when the room above
// can't hold it. Whichever comes first that fits the window and covers no row wins; when each
// covers some, the one that covers least.

/** A box in the window, in CSS pixels. */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Where a tooltip goes, as Radix takes it: the side of its row, how it lines up along it, and how
 * far from the row it keeps, which reaches past the row's own menu when it goes above or below it.
 */
export interface TooltipPlace {
  side: 'top' | 'right' | 'bottom' | 'left'
  align: 'start' | 'center' | 'end'
  offset: number
}

/** Pixels between a tooltip and its row, or the row's menu, as the tooltip keeps them. */
const GAP = 8
/** Pixels a tooltip keeps from the window's edges. */
const EDGE = 8
const ALIGNS = ['start', 'center', 'end'] as const

/**
 * The first place that fits in the window and covers none of `rows`, trying beside the row at its
 * end, then at its start, then past the top and the bottom of its own menu (`own`), or on a `phone`
 * only past the top and the bottom of its menu; when each covers some, the one that covers least.
 * `rtl` puts the end on the left, and lines a tooltip's start up with the row's right edge, as Radix
 * does in a right-to-left page.
 */
export function tooltipPlace({
  row,
  size,
  own,
  rows,
  room,
  rtl,
  phone = false,
}: {
  row: Box
  size: { width: number; height: number }
  /** The menu the row is in: on a phone, the sheet. */
  own: Box
  /** Every row that shows in the open menus, the row's own menu, its back row and the row itself included. */
  rows: readonly Box[]
  room: { width: number; height: number }
  rtl: boolean
  /** The screen is a phone's, tapped with a finger: the tooltip goes past its menu, clear of every row. */
  phone?: boolean
}): TooltipPlace {
  const [end, start] = rtl ? (['left', 'right'] as const) : (['right', 'left'] as const)
  const pastMenu: TooltipPlace[] = [
    ...ALIGNS.map((align) => ({ side: 'top' as const, align, offset: row.top - own.top + GAP })),
    ...ALIGNS.map((align) => ({ side: 'bottom' as const, align, offset: own.bottom - row.bottom + GAP })),
  ]
  const beside: TooltipPlace[] = [
    { side: end, align: 'center', offset: GAP },
    { side: start, align: 'center', offset: GAP },
  ]
  let best: { place: TooltipPlace; covered: number } | null = null
  for (const place of phone ? pastMenu : [...beside, ...pastMenu]) {
    const box = tooltipBox(place, row, size, room, rtl)
    if (!box) continue
    const covered = rows.reduce((sum, one) => sum + area(box, one), 0)
    if (covered < 0.5) return place
    if (!best || covered < best.covered) best = { place, covered }
  }
  return best?.place ?? pastMenu[0] ?? { side: 'top', align: 'center', offset: GAP }
}

/**
 * Where a tooltip of this size lands in a place, moved along its row to stay in the window as
 * Radix moves it; null when its side has no room.
 */
export function tooltipBox(
  { side, align, offset }: TooltipPlace,
  row: Box,
  size: { width: number; height: number },
  room: { width: number; height: number },
  rtl: boolean,
): Box | null {
  const into = (value: number, length: number, limit: number) => Math.max(EDGE, Math.min(value, limit - EDGE - length))
  if (side === 'left' || side === 'right') {
    const left = side === 'right' ? row.right + offset : row.left - offset - size.width
    if (left < EDGE || left + size.width > room.width - EDGE) return null
    const top = into((row.top + row.bottom) / 2 - size.height / 2, size.height, room.height)
    return { left, top, right: left + size.width, bottom: top + size.height }
  }
  const top = side === 'top' ? row.top - offset - size.height : row.bottom + offset
  if (top < EDGE || top + size.height > room.height - EDGE) return null
  const start = rtl ? row.right - size.width : row.left
  const finish = rtl ? row.left : row.right - size.width
  const wanted = align === 'start' ? start : align === 'end' ? finish : (row.left + row.right) / 2 - size.width / 2
  const left = into(wanted, size.width, room.width)
  return { left, top, right: left + size.width, bottom: top + size.height }
}

/** How much of `a` lies in `b`, in square pixels. */
function area(a: Box, b: Box) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return Math.max(0, width) * Math.max(0, height)
}
