import { describe, expect, it } from 'vitest'

import { type Box, tooltipBox, tooltipPlace } from './tooltip-place.ts'

const ROOM = { width: 1280, height: 760 }
const PHONE = { width: 390, height: 844 }
const TIP = { width: 240, height: 26 }
const WIDE = { rtl: false, phone: false }
const PHONE_SCREEN = { rtl: false, phone: true }

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
    const place = tooltipPlace({ row: LAYER, size: TIP, own: BESIDE, rows: ROWS, room: wide, screen: WIDE })
    expect(place).toEqual({ side: 'right', align: 'center', offset: 8 })
    expect(covered(place, LAYER, ROWS, wide)).toEqual([])
  })

  it('puts it at the row’s start side in a right-to-left menu', () => {
    const row = { left: 260, top: 376, right: 506, bottom: 412 }
    const own = { left: 254, top: 300, right: 512, bottom: 420 }
    const main = { left: 520, top: 200, right: 800, bottom: 700 }
    const rows = [...rowsOf(main, 13, 36), row]
    const place = tooltipPlace({ row, size: TIP, own, rows, room: ROOM, screen: { rtl: true, phone: false } })
    expect(place).toEqual({ side: 'left', align: 'center', offset: 8 })
    expect(covered(place, row, rows, ROOM, true)).toEqual([])
  })

  it('puts it above the row’s own menu, lined up away from the full menu, when the end side has no room and the start side holds the full menu’s rows', () => {
    for (const row of [STYLE, TEXT, LAYER]) {
      const place = tooltipPlace({ row, size: TIP, own: BESIDE, rows: ROWS, room: ROOM, screen: WIDE })
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
      const place = tooltipPlace({ row, size: TIP, own, rows, room: ROOM, screen: { rtl: true, phone: false } })
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
      const place = tooltipPlace({ row, size: TIP, own, rows, room, screen: WIDE })
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
      screen: PHONE_SCREEN,
    })
    expect(place).toEqual({ side: 'top', align: 'start', offset: first.top - SHEET.top + 8 })
    expect(tooltipBox(place, first, TIP, PHONE, false)?.bottom).toBe(SHEET.top - 8)
    expect(covered(place, first, SHEET_ROWS, PHONE)).toEqual([])
  })

  it('on a phone puts a middle and the last row’s tooltip above the sheet too, even with room beside the row', () => {
    for (const row of [SHEET_ROWS[4], SHEET_ROWS[9]] as Box[]) {
      const place = tooltipPlace({ row, size: TIP, own: SHEET, rows: SHEET_ROWS, room: PHONE, screen: PHONE_SCREEN })
      expect(place, `${row.top}`).toMatchObject({ side: 'top', offset: row.top - SHEET.top + 8 })
      expect(tooltipBox(place, row, TIP, PHONE, false)?.bottom).toBe(SHEET.top - 8)
      expect(covered(place, row, SHEET_ROWS, PHONE), `${row.top}`).toEqual([])
    }
    // A short reason by a narrow menu, with room at the row's end to hold it, goes above the menu as well.
    const own = { left: 8, top: 300, right: 208, bottom: 600 }
    const rows = rowsOf(own, 6, 44)
    const row = rows[2] as Box
    expect(
      tooltipPlace({ row, size: { width: 120, height: 26 }, own, rows, room: PHONE, screen: PHONE_SCREEN }),
    ).toMatchObject({ side: 'top', offset: row.top - own.top + 8 })
  })

  it('on a phone puts it below the menu only when the room above the menu can’t hold it', () => {
    const own = { left: 7, top: 20, right: 383, bottom: 480 }
    const rows = rowsOf(own, 10, 44)
    const row = rows[3] as Box
    const place = tooltipPlace({ row, size: TIP, own, rows, room: PHONE, screen: PHONE_SCREEN })
    expect(place).toMatchObject({ side: 'bottom', offset: own.bottom - row.bottom + 8 })
    expect(covered(place, row, rows, PHONE)).toEqual([])
  })

  it('in the edit panel, past its grid takes the side nearer the row, as for a control in the edit panel’s last row', () => {
    const own = { left: 900, top: 200, right: 1260, bottom: 300 }
    const rows = [
      { left: 900, top: 200, right: 1075, bottom: 230 },
      { left: 1085, top: 200, right: 1260, bottom: 230 },
      { left: 900, top: 270, right: 1075, bottom: 300 },
      { left: 1085, top: 270, right: 1260, bottom: 300 },
    ]
    const row = rows[3] as Box
    const room = { width: 1280, height: 760 }
    // A panel as wide as the window, so beside it has no room.
    const panel = { left: 10, top: 150, right: 1270, bottom: 350 }
    const place = tooltipPlace({ row, size: TIP, own, rows, room, screen: WIDE, panel })
    expect(place).toMatchObject({ side: 'bottom', offset: 8 })
    expect(tooltipPlace({ row, size: TIP, own, rows, room, screen: WIDE })).toMatchObject({ side: 'top' })
  })

  it('in the edit panel, puts a control’s reason beside the panel level with the control when its grid has rows on every side', () => {
    // Three grids of two controls stacked in a panel at the window's end; the row is the middle grid's last.
    const controls = (left: number, right: number) =>
      [200, 240, 280, 320].flatMap((top) => [
        { left, top, right: left + 120, bottom: top + 30 },
        { left: left + 128, top, right, bottom: top + 30 },
      ])
    for (const rtl of [false, true]) {
      const panel = rtl
        ? { left: 8, top: 100, right: 280, bottom: 700 }
        : { left: 1000, top: 100, right: 1272, bottom: 700 }
      const rows = controls(panel.left + 12, panel.right - 12)
      const row = (rtl ? rows[4] : rows[5]) as Box
      const own = { left: panel.left + 12, top: 240, right: panel.right - 12, bottom: 310 }
      const screen = { rtl, phone: false }
      const place = tooltipPlace({ row, size: TIP, own, rows, room: ROOM, screen, panel })
      expect(place.side).toBe(rtl ? 'right' : 'left')
      const box = tooltipBox(place, row, TIP, ROOM, rtl)
      expect(covered(place, row, [...rows, panel], ROOM, rtl)).toEqual([])
      expect(box && (box.top + box.bottom) / 2).toBe((row.top + row.bottom) / 2)
      expect(box && (rtl ? box.left - panel.right : panel.left - box.right)).toBe(8)
    }
  })

  it('takes the place that covers the fewest rows when every place covers some', () => {
    const tall = { left: 0, top: 0, right: 390, bottom: 844 }
    const rows = rowsOf(tall, 19, 44)
    const row = rows[9] as Box
    const place = tooltipPlace({ row, size: { width: 300, height: 26 }, own: tall, rows, room: PHONE, screen: WIDE })
    expect(['top', 'bottom', 'left', 'right']).toContain(place.side)
  })
})
