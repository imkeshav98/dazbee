// A layer's width or height set with its ratio kept, so the box keeps its shape; a size typed into
// fields; the size of the frame you are on; and sizes as the app writes them, rounded as the fields
// show them.
import { describe, expect, it } from 'vitest'

import type { DesignInput } from '@dazbee/schema'

import { shortSizeOf, sizeOf, sizeTo, sizeYouAreOn, tidy, typedSize } from './size.ts'

/** Two pages: the first holds a square and a story, the second a banner; with the pages' order reversed in their keys. */
const DESIGN = {
  pages: { p2: { name: 'Two', order: 'a1' }, p1: { name: 'One', order: 'a0' } },
  frames: {
    story: { pageId: 'p1', name: 'Story', width: 1080, height: 1920, x: 1280, y: 0, order: 'a1' },
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    banner: { pageId: 'p2', name: 'Banner', width: 1200, height: 628, x: 0, y: 0, order: 'a0' },
  },
} satisfies Pick<DesignInput, 'pages' | 'frames'>
/** An editor showing a page, with a frame picked or layers selected in one. */
const on = ({
  page = 'p1',
  picked = null,
  selected = null,
}: {
  page?: string
  picked?: string | null
  selected?: string | null
}) => ({
  shownPage: () => page,
  pickedFrame: () => picked,
  selectedFrame: () => selected,
})

describe('sizeTo', () => {
  it('moves the other side by the same factor', () => {
    expect(sizeTo({ width: 200, height: 100 }, 'width', 300, true)).toEqual({ width: 300, height: 150 })
    expect(sizeTo({ width: 200, height: 100 }, 'height', 50, true)).toEqual({ width: 100, height: 50 })
  })

  it('rounds the other side to hundredths, as the fields show it', () => {
    expect(sizeTo({ width: 300, height: 100 }, 'width', 100, true)).toEqual({ width: 100, height: 33.33 })
  })

  it('changes one side only without the ratio kept', () => {
    expect(sizeTo({ width: 200, height: 100 }, 'width', 300, false)).toEqual({ width: 300 })
  })

  it('changes one side only when the box has no ratio to keep', () => {
    expect(sizeTo({ width: 0, height: 100 }, 'width', 300, true)).toEqual({ width: 300 })
    expect(sizeTo({ width: 200, height: 0 }, 'height', 40, true)).toEqual({ height: 40 })
  })
})

describe('typedSize', () => {
  it('waits for both sides', () => {
    expect(typedSize('', '250')).toBeNull()
    expect(typedSize('300', '  ')).toBeNull()
  })

  it('reads a size within the limits, spaces and Arabic and Persian digits too, with no issue', () => {
    expect(typedSize('300', '250')).toEqual({ width: 300, height: 250, issues: [] })
    expect(typedSize(' 1080 ', '١٩٢٠')).toEqual({ width: 1080, height: 1920, issues: [] })
    expect(typedSize('۱۲۰۰', '628')).toEqual({ width: 1200, height: 628, issues: [] })
  })

  it('takes the sizes at the limits: 50 px on the short side, 8000 on the long one, 12 times as long as wide', () => {
    expect(typedSize('50', '600')).toEqual({ width: 50, height: 600, issues: [] })
    expect(typedSize('8000', '667')).toEqual({ width: 8000, height: 667, issues: [] })
    expect(typedSize('8000', '8000')).toEqual({ width: 8000, height: 8000, issues: [] })
  })

  it('names each side past the limits and why, and only that side', () => {
    expect(typedSize('49', '600')?.issues).toEqual([{ side: 'width', issue: 'short' }])
    expect(typedSize('600', '0')?.issues).toEqual([{ side: 'height', issue: 'short' }])
    expect(typedSize('8001', '1000')?.issues).toEqual([{ side: 'width', issue: 'long' }])
    expect(typedSize('300.5', '250')?.issues).toEqual([{ side: 'width', issue: 'whole' }])
    expect(typedSize('49', '9000')?.issues).toEqual([
      { side: 'width', issue: 'short' },
      { side: 'height', issue: 'long' },
    ])
  })

  it('names the long side of a size longer than 12 times its short one, when both sides are within the limits', () => {
    expect(typedSize('50', '601')?.issues).toEqual([{ side: 'height', issue: 'ratio' }])
    expect(typedSize('7300', '600')?.issues).toEqual([{ side: 'width', issue: 'ratio' }])
  })

  it('takes digits only, with at most one decimal point: letters, signs, exponents and hex read as not whole', () => {
    for (const text of ['12px', '-', '-300', '+300', '1e3', '0x64', '0b111', '1,080', '1.2.3', 'Infinity', '.'])
      expect(typedSize(text, '250')?.issues, text).toEqual([{ side: 'width', issue: 'whole' }])
    expect(typedSize('300.0', '250')).toEqual({ width: 300, height: 250, issues: [] })
    expect(typedSize('٣٠٠٫٥', '250')?.issues).toEqual([{ side: 'width', issue: 'whole' }])
  })
})

describe('sizeYouAreOn', () => {
  it('is the picked frame’s size, else that of the frame the selection is in', () => {
    expect(sizeYouAreOn(on({ picked: 'story' }), DESIGN)).toMatchObject({ width: 1080, height: 1920 })
    expect(sizeYouAreOn(on({ selected: 'story' }), DESIGN)).toMatchObject({ width: 1080, height: 1920 })
    expect(sizeYouAreOn(on({ page: 'p2', selected: 'story' }), DESIGN)).toMatchObject({ width: 1080, height: 1920 })
  })

  it('is the shown page’s first frame’s size with neither, else the cover frame’s, else a blank design’s', () => {
    expect(sizeYouAreOn(on({}), DESIGN)).toMatchObject({ width: 1080, height: 1080 })
    expect(sizeYouAreOn(on({ page: 'p2' }), DESIGN)).toMatchObject({ width: 1200, height: 628 })
    expect(sizeYouAreOn(on({ page: 'p3' }), DESIGN)).toMatchObject({ width: 1080, height: 1080 })
    const square = { ...DESIGN, frames: { banner: DESIGN.frames.banner } }
    expect(sizeYouAreOn(on({ page: 'p1' }), square)).toMatchObject({ width: 1200, height: 628 })
    expect(sizeYouAreOn(on({}), { ...DESIGN, frames: {} })).toMatchObject({ width: 1080, height: 1080 })
  })

  it('passes over a frame picked or selected in that is gone', () => {
    expect(sizeYouAreOn(on({ page: 'p2', picked: 'gone', selected: 'gone' }), DESIGN)).toMatchObject({
      width: 1200,
      height: 628,
    })
  })
})

describe('sizeOf', () => {
  it('puts a spaced times sign between the width and the height', () => {
    expect(sizeOf({ width: 1080, height: 1920 })).toBe('1080 × 1920')
  })
})

describe('shortSizeOf', () => {
  it('puts the times sign between the width and the height with no spaces', () => {
    expect(shortSizeOf({ width: 300, height: 250 })).toBe('300×250')
  })
})

describe('tidy', () => {
  it('rounds to hundredths', () => {
    expect(tidy(33.333)).toBe(33.33)
    expect(tidy(0.125)).toBe(0.13)
  })

  it('leaves a whole number whole', () => {
    expect(tidy(40)).toBe(40)
  })
})
