// The rows of the top bar's Arrange ⋯ for the selected layers: how they sit, each row only where it
// applies, greyed with the reason where it is refused; and where the layers sit in their stacks, for the Order moves with nothing to do.
import { describe, expect, it } from 'vitest'

import type { Design } from '@dazbee/schema'

import { type ArrangeOf, arrangeRows, stackEnds } from './arrange-menu.ts'

/** One shape: it turns, lines up, and is neither text, locked nor placed by an auto layout. */
const shape: ArrangeOf = { several: false, sized: true, texts: false, placed: false, locked: false }

/** A frame holding a, b and c, back to front, with x and y inside c, back to front. */
const stack = {
  nodes: {
    a: { parentId: 'f', index: 'a0' },
    b: { parentId: 'f', index: 'a1' },
    c: { parentId: 'f', index: 'a2' },
    x: { parentId: 'c', index: 'a0' },
    y: { parentId: 'c', index: 'a1' },
  },
} as unknown as Design

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

  it('greys out every row but Order for a locked layer, the lock as the reason, since a lock never stops reordering', () => {
    expect(arrangeRows({ ...shape, texts: true, locked: true })).toEqual([
      { row: 'order' },
      { row: 'lineUp', off: 'locked' },
      { row: 'rotation', off: 'locked' },
      { row: 'textDirection', off: 'locked' },
    ])
    // The lock is the reason first, even for a layer its auto layout places.
    expect(arrangeRows({ ...shape, placed: true, locked: true })).toEqual([
      { row: 'order' },
      { row: 'lineUp', off: 'locked' },
      { row: 'rotation', off: 'locked' },
    ])
  })
})

describe('stackEnds', () => {
  it('finds the top layer at the front and the bottom one at the back', () => {
    expect(stackEnds(stack, ['c'])).toEqual({ front: true, back: false })
    expect(stackEnds(stack, ['a'])).toEqual({ front: false, back: true })
    expect(stackEnds(stack, ['b'])).toEqual({ front: false, back: false })
  })

  it('finds several layers at the front only when they are the top ones of their stack, in any order', () => {
    expect(stackEnds(stack, ['c', 'b'])).toEqual({ front: true, back: false })
    expect(stackEnds(stack, ['a', 'c'])).toEqual({ front: false, back: false })
    expect(stackEnds(stack, ['a', 'b', 'c'])).toEqual({ front: true, back: true })
  })

  it('reads each layer in its own stack', () => {
    expect(stackEnds(stack, ['y', 'c'])).toEqual({ front: true, back: false })
    expect(stackEnds(stack, ['x', 'a'])).toEqual({ front: false, back: true })
    expect(stackEnds(stack, ['x', 'c'])).toEqual({ front: false, back: false })
  })
})
