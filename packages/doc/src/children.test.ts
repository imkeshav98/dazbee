import { describe, expect, it } from 'vitest'

import { type DesignInput, parseDesign } from '@dazbee/schema'

import { ancestorsOf, childrenOf, descendants, isInside } from './children.ts'

const rect = { x: 0, y: 0, width: 10, height: 10, shape: { kind: 'rect' as const } }

/**
 * Frame p1-sq holds a box `f` with a group `g` inside, which holds `a` and `b`; `c` sits in p1-sq
 * above `f`. Frame p2-sq, on page p2, holds `d`.
 */
const design = () => {
  const input: DesignInput = {
    meta: { designId: 'd1', name: 'Tree' },
    pages: { p1: { name: 'Page 1', order: 'a0' }, p2: { name: 'Page 2', order: 'a1' } },
    frames: {
      'p1-sq': { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
      'p2-sq': { pageId: 'p2', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    },
    nodes: {
      c: { type: 'graphic', parentId: 'p1-sq', link: 'c', index: 'a1', name: 'C', props: rect },
      f: { type: 'box', parentId: 'p1-sq', link: 'f', index: 'a0', name: 'F', props: rect },
      g: { type: 'group', parentId: 'f', link: 'g', index: 'a0', name: 'G', props: rect },
      b: { type: 'graphic', parentId: 'g', link: 'b', index: 'a1', name: 'B', props: rect },
      a: { type: 'graphic', parentId: 'g', link: 'a', index: 'a0', name: 'A', props: rect },
      d: { type: 'graphic', parentId: 'p2-sq', link: 'd', index: 'a0', name: 'D', props: rect },
    },
  }
  const parsed = parseDesign(input)
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  return parsed.design
}

describe('childrenOf', () => {
  it('lists the layers directly under a frame or layer, back to front', () => {
    expect(childrenOf(design(), 'p1-sq').map(([id]) => id)).toEqual(['f', 'c'])
    expect(childrenOf(design(), 'g').map(([id]) => id)).toEqual(['a', 'b'])
    expect(childrenOf(design(), 'a')).toEqual([])
  })
})

describe('descendants', () => {
  it('lists every layer under a frame or layer, parents before children, without the one asked for', () => {
    expect(descendants(design(), 'p1-sq')).toEqual(['f', 'g', 'a', 'b', 'c'])
    expect(descendants(design(), 'f')).toEqual(['g', 'a', 'b'])
    expect(descendants(design(), 'a')).toEqual([])
    expect(descendants(design(), 'missing')).toEqual([])
  })
})

describe('ancestorsOf', () => {
  it('lists the layers from the one given up to the frame, nearest first', () => {
    const d = design()
    expect(ancestorsOf(d, d.nodes.a?.parentId ?? '')).toEqual(['g', 'f'])
    expect(ancestorsOf(d, 'g')).toEqual(['g', 'f'])
  })

  it('is empty for a frame, a layer that does not exist, or no id', () => {
    expect(ancestorsOf(design(), 'p1-sq')).toEqual([])
    expect(ancestorsOf(design(), 'missing')).toEqual([])
    expect(ancestorsOf(design(), '')).toEqual([])
  })
})

describe('isInside', () => {
  it('is true for the layer itself and every layer or frame it sits in', () => {
    const d = design()
    expect(isInside(d, 'a', 'a')).toBe(true)
    expect(isInside(d, 'a', 'g')).toBe(true)
    expect(isInside(d, 'a', 'f')).toBe(true)
    expect(isInside(d, 'a', 'p1-sq')).toBe(true)
  })

  it('is false for a sibling, a layer below, or another frame', () => {
    const d = design()
    expect(isInside(d, 'a', 'b')).toBe(false)
    expect(isInside(d, 'g', 'a')).toBe(false)
    expect(isInside(d, 'a', 'c')).toBe(false)
    expect(isInside(d, 'a', 'p2-sq')).toBe(false)
  })
})
