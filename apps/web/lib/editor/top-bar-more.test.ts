// The rows of the top bar's ⋯ for the selected layers: how they sit, each row only where it applies.
import { describe, expect, it } from 'vitest'

import { topBarMoreRows } from './top-bar-more.ts'

const one = (type: string) => ({
  types: [type],
  locked: false,
  placed: false,
})

describe('topBarMoreRows', () => {
  it('gives a shape Order, Line up and the rotation field', () => {
    expect(topBarMoreRows(one('graphic'))).toEqual([{ row: 'order' }, { row: 'lineUp' }, { row: 'rotation' }])
  })

  it('adds Text direction for text, last', () => {
    expect(topBarMoreRows(one('text'))).toEqual([
      { row: 'order' },
      { row: 'lineUp' },
      { row: 'rotation' },
      { row: 'textDirection' },
    ])
  })

  it('leaves the rotation field out for a group or a boolean, which turn with what they hold', () => {
    expect(topBarMoreRows(one('group'))).toEqual([{ row: 'order' }, { row: 'lineUp' }])
    expect(topBarMoreRows(one('boolean'))).toEqual([{ row: 'order' }, { row: 'lineUp' }])
    expect(topBarMoreRows({ types: ['graphic', 'group'], locked: false, placed: false })).toEqual([{ row: 'order' }])
  })

  it('leaves Line up out for several layers, whose bar has its own Line up', () => {
    expect(topBarMoreRows({ types: ['graphic', 'box'], locked: false, placed: false })).toEqual([
      { row: 'order' },
      { row: 'rotation' },
    ])
  })

  it('gives several texts Text direction, and a mix of text and a shape none', () => {
    expect(topBarMoreRows({ types: ['text', 'text'], locked: false, placed: false })).toEqual([
      { row: 'order' },
      { row: 'rotation' },
      { row: 'textDirection' },
    ])
    expect(topBarMoreRows({ types: ['text', 'graphic'], locked: false, placed: false })).toEqual([
      { row: 'order' },
      { row: 'rotation' },
    ])
  })

  it('greys out Line up for a layer an auto layout places, saying why', () => {
    expect(topBarMoreRows({ types: ['graphic'], locked: false, placed: true })).toEqual([
      { row: 'order' },
      { row: 'lineUp', off: 'placedByLayout' },
      { row: 'rotation' },
    ])
  })

  it('keeps only Order for a locked layer, the one row its lock never refuses', () => {
    expect(topBarMoreRows({ types: ['text'], locked: true, placed: false })).toEqual([{ row: 'order' }])
  })

  it('gives nothing selected no rows', () => {
    expect(topBarMoreRows({ types: [], locked: false, placed: false })).toEqual([])
  })
})
