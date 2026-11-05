import { describe, expect, it } from 'vitest'

import { type Box, tooltipBox, tooltipPlace } from './tooltip-place.ts'

const ROOM = { width: 1280, height: 760 }
const PHONE = { width: 390, height: 844 }
const TIP = { width: 240, height: 26 }

/** `count` rows of a menu, each `height` tall, stacked from its top inside its padding. */
const rowsOf = (menu: Box, count: number, height: number): Box[] =>
  Array.from({ length: count }, (_, i) => ({
    left: menu.left + 6,
    top: menu.top + 7 + i * height,
    right: menu.right - 6,
    bottom: menu.top + 7 + (i + 1) * height,
  }))
/** How much of `a` lies in `b`, in square pixels. */
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
/** The rows a tooltip in this place would cover. */
const covered = (
  place: ReturnType<typeof tooltipPlace>,
  row: Box,
  rows: readonly Box[],
  room: { width: number; height: number },
  rtl = false,
) => {
  const box = tooltipBox(place, row, TIP, room, rtl)
  return box ? rows.filter((one) => overlap(box, one) > 0) : null
}

/** The full menu at the window's middle, and the menu beside its Copy to other frames row: Style, Text and Layer. */
const MAIN = { left: 500, top: 200, right: 780, bottom: 700 }
const MAIN_ROWS = rowsOf(MAIN, 13, 36)
const BESIDE = { left: 788, top: 300, right: 1046, bottom: 420 }
const STYLE = { left: 794, top: 304, right: 1040, bottom: 340 }
const TEXT = { left: 794, top: 340, right: 1040, bottom: 376 }
const LAYER = { left: 794, top: 376, right: 1040, bottom: 412 }
const ROWS = [...MAIN_ROWS, STYLE, TEXT, LAYER]

/** A phone's sheet at the bottom of the screen, 7 px in from its edges, with ten rows a finger's height. */
const SHEET = { left: 7, top: 340, right: 383, bottom: 837 }
const SHEET_ROWS = rowsOf(SHEET, 10, 44)

describe('tooltipPlace', () => {
  it('puts the tooltip beside the row at its end when there is room', () => {
    const wide = { width: 1600, height: 760 }
    const place = tooltipPlace({ row: LAYER, size: TIP, own: BESIDE, rows: ROWS, room: wide, rtl: false })
    expect(place).toEqual({ side: 'right', align: 'center', offset: 8 })
    expect(covered(place, LAYER, ROWS, wide)).toEqual([])
  })

  it('puts it at the row’s start side in a right-to-left menu', () => {
    const row = { left: 260, top: 376, right: 506, bottom: 412 }
    const own = { left: 254, top: 300, right: 512, bottom: 420 }
    const main = { left: 520, top: 200, right: 800, bottom: 700 }
    const rows = [...rowsOf(main, 13, 36), row]
    const place = tooltipPlace({ row, size: TIP, own, rows, room: ROOM, rtl: true })
    expect(place).toEqual({ side: 'left', align: 'center', offset: 8 })
    expect(covered(place, row, rows, ROOM, true)).toEqual([])
  })

  it('puts it above the row’s own menu, lined up away from the full menu, when the end side has no room and the start side holds the full menu’s rows', () => {
    for (const row of [STYLE, TEXT, LAYER]) {
      const place = tooltipPlace({ row, size: TIP, own: BESIDE, rows: ROWS, room: ROOM, rtl: false })
      expect(place, `${row.top}`).toEqual({ side: 'top', align: 'start', offset: row.top - BESIDE.top + 8 })
      expect(covered(place, row, ROWS, ROOM), `${row.top}`).toEqual([])
    }
  })

  it('lines it up with the row’s right edge as its start in a right-to-left menu', () => {
    const own = { left: 14, top: 300, right: 272, bottom: 420 }
    const ownRows = rowsOf(own, 3, 36)
    const main = { left: 280, top: 200, right: 560, bottom: 700 }
    const rows = [...rowsOf(main, 13, 36), ...ownRows]
    for (const row of ownRows) {
      const place = tooltipPlace({ row, size: TIP, own, rows, room: ROOM, rtl: true })
      expect(place).toEqual({ side: 'top', align: 'start', offset: row.top - own.top + 8 })
      expect(covered(place, row, rows, ROOM, true)).toEqual([])
    }
  })

  it('never covers a row of its own menu, as a tooltip above or below the row would', () => {
    // No room at either side of the menu: the tooltip goes past the menu's top, clear of each row.
    const room = { width: 400, height: 760 }
    const own = { left: 60, top: 200, right: 340, bottom: 560 }
    const rows = rowsOf(own, 10, 36)
    for (const row of [rows[0], rows[4], rows[9]] as Box[]) {
      const place = tooltipPlace({ row, size: TIP, own, rows, room, rtl: false })
      expect(place).toMatchObject({ side: 'top', offset: row.top - own.top + 8 })
      expect(covered(place, row, rows, room)).toEqual([])
    }
  })

  it('on a phone puts the first row’s tooltip above the sheet, clear of the row and of the finger on it', () => {
    const first = SHEET_ROWS[0] as Box
    const place = tooltipPlace({
      row: first,
      size: TIP,
      own: SHEET,
      rows: SHEET_ROWS,
      room: PHONE,
      rtl: false,
      phone: true,
    })
    expect(place).toEqual({ side: 'top', align: 'start', offset: first.top - SHEET.top + 8 })
    expect(tooltipBox(place, first, TIP, PHONE, false)?.bottom).toBe(SHEET.top - 8)
    expect(covered(place, first, SHEET_ROWS, PHONE)).toEqual([])
  })

  it('on a phone puts a middle and the last row’s tooltip above the sheet too, even with room beside the row', () => {
    for (const row of [SHEET_ROWS[4], SHEET_ROWS[9]] as Box[]) {
      const place = tooltipPlace({ row, size: TIP, own: SHEET, rows: SHEET_ROWS, room: PHONE, rtl: false, phone: true })
      expect(place, `${row.top}`).toMatchObject({ side: 'top', offset: row.top - SHEET.top + 8 })
      expect(tooltipBox(place, row, TIP, PHONE, false)?.bottom).toBe(SHEET.top - 8)
      expect(covered(place, row, SHEET_ROWS, PHONE), `${row.top}`).toEqual([])
    }
    // A short reason by a narrow menu, with room at the row's end to hold it, goes above the menu as well.
    const own = { left: 8, top: 300, right: 208, bottom: 600 }
    const rows = rowsOf(own, 6, 44)
    const row = rows[2] as Box
    expect(
      tooltipPlace({ row, size: { width: 120, height: 26 }, own, rows, room: PHONE, rtl: false, phone: true }),
    ).toMatchObject({ side: 'top', offset: row.top - own.top + 8 })
  })

  it('on a phone puts it below the menu only when the room above the menu can’t hold it', () => {
    const own = { left: 7, top: 20, right: 383, bottom: 480 }
    const rows = rowsOf(own, 10, 44)
    const row = rows[3] as Box
    const place = tooltipPlace({ row, size: TIP, own, rows, room: PHONE, rtl: false, phone: true })
    expect(place).toMatchObject({ side: 'bottom', offset: own.bottom - row.bottom + 8 })
    expect(covered(place, row, rows, PHONE)).toEqual([])
  })

  it('takes the place that covers the fewest rows when every place covers some', () => {
    const tall = { left: 0, top: 0, right: 390, bottom: 844 }
    const rows = rowsOf(tall, 19, 44)
    const row = rows[9] as Box
    const place = tooltipPlace({ row, size: { width: 300, height: 26 }, own: tall, rows, room: PHONE, rtl: false })
    expect(['top', 'bottom', 'left', 'right']).toContain(place.side)
  })
})
