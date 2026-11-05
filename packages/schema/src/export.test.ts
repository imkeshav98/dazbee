import { describe, expect, it } from 'vitest'

import { numberedFrameNames } from './export.ts'

const frame = (pageId: string, name: string, order: string) => ({
  pageId,
  name,
  width: 100,
  height: 100,
  x: 0,
  y: 0,
  fills: [],
  order,
})

describe('numberedFrameNames', () => {
  it("names a page's frames in its order, a name an earlier frame has, in any case, numbered from 2", () => {
    const frames = {
      third: frame('p1', 'sale', 'a2'),
      first: frame('p1', 'Sale', 'a0'),
      story: frame('p1', 'Story', 'a1'),
      fourth: frame('p1', 'Sale', 'a3'),
      other: frame('p2', 'Sale', 'a0'),
    }
    expect([...numberedFrameNames({ frames }, 'p1')]).toEqual([
      ['first', 'Sale'],
      ['story', 'Story'],
      ['third', 'sale 2'],
      ['fourth', 'Sale 3'],
    ])
    // Another page numbers its own frames.
    expect([...numberedFrameNames({ frames }, 'p2')]).toEqual([['other', 'Sale']])
    expect(numberedFrameNames({ frames }, 'p3').size).toBe(0)
  })

  it('never gives two frames one name, even where a frame is named like a number', () => {
    const frames = {
      a: frame('p1', 'Sale 2', 'a0'),
      b: frame('p1', 'Sale', 'a1'),
      c: frame('p1', 'Sale', 'a2'),
      d: frame('p1', ' Sale ', 'a3'),
    }
    expect([...numberedFrameNames({ frames }, 'p1').values()]).toEqual(['Sale 2', 'Sale', 'Sale 3', 'Sale 4'])
  })
})
