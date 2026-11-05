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

  it('on a phone keeps it over the menu that lies over the full menu, not over the full menu’s rows', () => {
    const phone = { width: 390, height: 844 }
    const main = { left: 8, top: 300, right: 288, bottom: 836 }
    const own = { left: 8, top: 460, right: 288, bottom: 610 }
    const last = { left: 14, top: 560, right: 282, bottom: 604 }
    expect(tooltipPlace({ row: last, size: TIP, own, others: [main], room: phone, rtl: false })).toMatchObject({
      side: 'top',
    })
    // The first row: above it is the full menu's row it opened from, so the tooltip goes below.
    const first = { left: 14, top: 492, right: 282, bottom: 536 }
    expect(tooltipPlace({ row: first, size: TIP, own, others: [main], room: phone, rtl: false })).toMatchObject({
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
