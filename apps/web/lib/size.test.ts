// A layer's width or height set with its ratio kept: the other side follows, so the box keeps its shape.
import { describe, expect, it } from 'vitest'

import { sizeTo } from './size.ts'

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
