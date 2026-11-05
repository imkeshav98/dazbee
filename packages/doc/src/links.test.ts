import { describe, expect, it } from 'vitest'

import { parseDesign } from '@dazbee/schema'

import { copiesOf, copyIn, framesWithout, linkedFrames } from './links.ts'
import { linkedDesign } from './test-design.ts'

const parsed = () => {
  const result = parseDesign(linkedDesign())
  if (!result.success) throw new Error(result.errors.join('\n'))
  return result.design
}

describe('copiesOf', () => {
  it('finds a layer’s linked copies in the other frames of its page, by frame order, wherever they sit', () => {
    const design = parsed()
    expect(copiesOf(design, 'bg')).toEqual(['story-bg', 'wide-bg', 'tall-bg'])
    expect(copiesOf(design, 'story-title')).toEqual(['title', 'wide-title'])
    expect(copiesOf(design, 'grp')).toEqual(['story-grp'])
  })

  it('finds none for a layer no other frame of its page holds, nor on another page', () => {
    const design = parsed()
    expect(copiesOf(design, 'badge')).toEqual([])
    expect(copiesOf(design, 'far-bg')).toEqual([])
    expect(copiesOf(design, 'nope')).toEqual([])
  })
})

describe('copyIn', () => {
  it('finds the layer a frame holds with a link id', () => {
    const design = parsed()
    expect(copyIn(design, 'wide', 'price')).toBe('wide-price')
    expect(copyIn(design, 'tall', 'price')).toBeUndefined()
  })
})

describe('linkedFrames', () => {
  it('lists the frames of the page sharing a link id with a frame, in their order', () => {
    const design = parsed()
    expect(linkedFrames(design, 'sq')).toEqual(['story', 'wide', 'tall'])
    expect(linkedFrames(design, 'tall')).toEqual(['sq', 'story', 'wide'])
    expect(linkedFrames(design, 'other')).toEqual([])
    expect(linkedFrames(design, 'far')).toEqual([])
  })
})

describe('framesWithout', () => {
  it('lists the linked frames of a layer’s frame that hold no copy of it', () => {
    const design = parsed()
    expect(framesWithout(design, 'badge')).toEqual(['story', 'wide', 'tall'])
    expect(framesWithout(design, 'price')).toEqual(['story', 'tall'])
    expect(framesWithout(design, 'bg')).toEqual([])
    expect(framesWithout(design, 'other-x')).toEqual([])
  })
})
