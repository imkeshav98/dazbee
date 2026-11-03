// Where a number field's fill sits: from the start of its range up to the value, or from 0 either
// way when the range runs either side of 0.
import { describe, expect, it } from 'vitest'

import { fillOf } from './fill.ts'

describe('a number field’s fill', () => {
  it('runs from the start of the range to the value', () => {
    expect(fillOf(25, [0, 100])).toEqual({ from: 0, width: 25, at: 25 })
    expect(fillOf(1.25, [0.5, 2])).toEqual({ from: 0, width: 50, at: 50 })
  })

  it('runs from 0 either way when the range is either side of 0', () => {
    expect(fillOf(50, [-100, 100])).toEqual({ from: 50, width: 25, at: 75 })
    expect(fillOf(-50, [-100, 100])).toEqual({ from: 25, width: 25, at: 25 })
    expect(fillOf(0, [-100, 100])).toEqual({ from: 50, width: 0, at: 50 })
  })

  it('stops at the ends of the range', () => {
    expect(fillOf(300, [0, 100])).toEqual({ from: 0, width: 100, at: 100 })
    expect(fillOf(-300, [-100, 100])).toEqual({ from: 0, width: 50, at: 0 })
  })

  it('has no line without a range, nor for a value the layers don’t share or one left unset', () => {
    expect(fillOf(5, undefined)).toEqual({ from: 0, width: 0, at: null })
    expect(fillOf('mixed', [0, 100])).toEqual({ from: 0, width: 0, at: null })
    expect(fillOf(undefined, [0.8, 2])).toEqual({ from: 0, width: 0, at: null })
    expect(fillOf('mixed', [-100, 100])).toEqual({ from: 50, width: 0, at: null })
  })
})
