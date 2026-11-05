// The rows of the top bar's Arrange ⋯ for the selected layers: how they sit, each row only where it
// applies.
import { describe, expect, it } from 'vitest'

import { type ArrangeOf, arrangeRows } from './arrange-menu.ts'

/** One shape: it turns, lines up, and is neither text, locked nor placed by an auto layout. */
const shape: ArrangeOf = { several: false, sized: true, texts: false, placed: false, locked: false }

describe('arrangeRows', () => {
  it('gives a shape Order, Line up and the rotation field', () => {
    expect(arrangeRows(shape)).toEqual([{ row: 'order' }, { row: 'lineUp' }, { row: 'rotation' }])
  })

  it('adds Text direction for text, last', () => {
    expect(arrangeRows({ ...shape, texts: true })).toEqual([
      { row: 'order' },
      { row: 'lineUp' },
      { row: 'rotation' },
      { row: 'textDirection' },
    ])
  })

  it('leaves the rotation field out for a group or a boolean, which turn with what they hold', () => {
    expect(arrangeRows({ ...shape, sized: false })).toEqual([{ row: 'order' }, { row: 'lineUp' }])
    expect(arrangeRows({ ...shape, several: true, sized: false })).toEqual([{ row: 'order' }])
  })

  it('leaves Line up out for several layers, whose bar has its own Line up', () => {
    expect(arrangeRows({ ...shape, several: true })).toEqual([{ row: 'order' }, { row: 'rotation' }])
  })

  it('gives several texts Text direction', () => {
    expect(arrangeRows({ ...shape, several: true, texts: true })).toEqual([
      { row: 'order' },
      { row: 'rotation' },
      { row: 'textDirection' },
    ])
  })

  it('greys out Line up for a layer an auto layout places, saying why', () => {
    expect(arrangeRows({ ...shape, placed: true })).toEqual([
      { row: 'order' },
      { row: 'lineUp', off: 'placedByLayout' },
      { row: 'rotation' },
    ])
  })

  it('keeps only Order for a locked layer, the one row its lock never refuses', () => {
    expect(arrangeRows({ ...shape, texts: true, locked: true })).toEqual([{ row: 'order' }])
  })
})
