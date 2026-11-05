import { describe, expect, it } from 'vitest'

import { tooltipPlace } from './tooltip-place.ts'

const ROOM = { width: 1280, height: 760 }
const TIP = { width: 240, height: 26 }
/** The full menu at the window's middle, and the menu beside its Copy to other frames row. */
const MAIN = { left: 500, top: 200, right: 780, bottom: 700 }
const BESIDE = { left: 788, top: 300, right: 1046, bottom: 420 }
/** The beside menu's last row, Layer. */
const LAYER = { left: 794, top: 376, right: 1040, bottom: 412 }

describe('tooltipPlace', () => {
  it('puts the tooltip beside the row at its end when there is room', () => {
    const wide = { width: 1600, height: 760 }
    expect(tooltipPlace({ row: LAYER, size: TIP, own: BESIDE, others: [MAIN], room: wide, rtl: false })).toEqual({
      side: 'right',
      align: 'center',
    })
  })

  it('puts it at the row’s start side in a right-to-left menu', () => {
    const row = { left: 260, top: 376, right: 506, bottom: 412 }
    const own = { left: 254, top: 300, right: 512, bottom: 420 }
    const main = { left: 520, top: 200, right: 800, bottom: 700 }
    expect(tooltipPlace({ row, size: TIP, own, others: [main], room: ROOM, rtl: true })).toEqual({
      side: 'left',
      align: 'center',
    })
  })

  it('puts it above the row, lined up away from the full menu, when the end side has no room', () => {
    expect(tooltipPlace({ row: LAYER, size: TIP, own: BESIDE, others: [MAIN], room: ROOM, rtl: false })).toEqual({
      side: 'top',
      align: 'start',
    })
  })

  it('lines it up with the row’s right edge as its start in a right-to-left menu', () => {
    const row = { left: 20, top: 376, right: 266, bottom: 412 }
    const own = { left: 14, top: 300, right: 272, bottom: 420 }
    const main = { left: 280, top: 200, right: 560, bottom: 700 }
    expect(tooltipPlace({ row, size: TIP, own, others: [main], room: ROOM, rtl: true })).toEqual({
      side: 'top',
      align: 'start',
    })
  })

  it('on a phone puts it above the row, clear of the finger, even with room beside it', () => {
    const phone = { width: 390, height: 844 }
    // A short reason by a menu at the screen's start edge, with room at the row's end to hold it.
    const own = { left: 8, top: 300, right: 208, bottom: 600 }
    const row = { left: 14, top: 400, right: 202, bottom: 444 }
    const size = { width: 120, height: 26 }
    expect(tooltipPlace({ row, size, own, others: [], room: phone, rtl: false, phone: true })).toMatchObject({
      side: 'top',
    })
  })

  it('on a phone puts it above the first row too, and below only when the room above can’t hold it', () => {
    const phone = { width: 390, height: 844 }
    const own = { left: 7, top: 460, right: 383, bottom: 836 }
    const first = { left: 13, top: 466, right: 377, bottom: 510 }
    expect(tooltipPlace({ row: first, size: TIP, own, others: [], room: phone, rtl: false, phone: true })).toEqual({
      side: 'top',
      align: 'start',
    })
    const atTop = { left: 13, top: 20, right: 377, bottom: 64 }
    expect(
      tooltipPlace({ row: atTop, size: TIP, own, others: [], room: phone, rtl: false, phone: true }),
    ).toMatchObject({
      side: 'bottom',
    })
  })

  it('takes the place that covers the least of the other menus when every place covers some', () => {
    const phone = { width: 390, height: 844 }
    const main = { left: 0, top: 0, right: 390, bottom: 844 }
    const own = { left: 8, top: 400, right: 288, bottom: 460 }
    const row = { left: 14, top: 408, right: 282, bottom: 452 }
    const place = tooltipPlace({ row, size: { width: 300, height: 26 }, own, others: [main], room: phone, rtl: false })
    expect(['top', 'bottom']).toContain(place.side)
  })
})
