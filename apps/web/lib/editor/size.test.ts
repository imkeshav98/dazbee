// A layer's width or height set with its ratio kept, so the box keeps its shape; and sizes as the app
// writes them, rounded as the fields show them.
import { describe, expect, it } from 'vitest'

import { shortSizeOf, sizeOf, sizeTo, tidy } from './size.ts'

describe('a size set with the ratio kept', () => {
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

describe('a size as the app writes it', () => {
  it('puts a spaced times sign between the width and the height', () => {
    expect(sizeOf({ width: 1080, height: 1920 })).toBe('1080 × 1920')
  })
})

describe('a size as a chip shows it', () => {
  it('puts the times sign between the width and the height with no spaces', () => {
    expect(shortSizeOf({ width: 300, height: 250 })).toBe('300×250')
  })
})

describe('a number as the fields show it', () => {
  it('rounds to hundredths', () => {
    expect(tidy(33.333)).toBe(33.33)
    expect(tidy(0.125)).toBe(0.13)
  })

  it('leaves a whole number whole', () => {
    expect(tidy(40)).toBe(40)
  })
})
