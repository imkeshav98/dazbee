// Where the selected layers sit in their stacks, for Position's Order moves with nothing to do.
import { describe, expect, it } from 'vitest'

import type { Design } from '@dazbee/schema'

import { stackEnds } from './stack-ends.ts'

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
