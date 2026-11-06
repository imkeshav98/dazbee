import { describe, expect, it } from 'vitest'

import type { Design } from '@dazbee/schema'

import { byFrame, toggled, withCopies } from './across-frames.ts'
import { pairsIn } from './selection.ts'

const graphic = (parentId: string, link: string, extra: Record<string, unknown> = {}) => ({
  type: 'graphic',
  parentId,
  link,
  props: { shape: { kind: 'rect' } },
  ...extra,
})
/**
 * Two pages. The first page's first frame holds a rect, a path, and a group holding a rect; its
 * second holds a dot, a hidden copy of the rect, and copies of the group and its rect; its third a
 * copy of the rect locked in place and a copy of the path. The second page holds a layer with the
 * rect's link id, which is no copy since link ids never cross pages.
 */
const fakeDesign = () =>
  ({
    pages: { p1: { name: 'One' }, p2: { name: 'Two' } },
    frames: {
      'p1-f1': { pageId: 'p1', order: 'a0' },
      'p1-f2': { pageId: 'p1', order: 'a1' },
      'p1-f3': { pageId: 'p1', order: 'a2' },
      'p2-f1': { pageId: 'p2', order: 'a0' },
    },
    nodes: {
      rect: graphic('p1-f1', 'R'),
      path: graphic('p1-f1', 'P'),
      group: { type: 'group', parentId: 'p1-f1', link: 'G', props: {} },
      child: graphic('group', 'C'),
      dot: graphic('p1-f2', 'D'),
      'f2-rect': graphic('p1-f2', 'R', { props: { shape: { kind: 'rect' }, visible: false } }),
      'f2-group': { type: 'group', parentId: 'p1-f2', link: 'G', props: {} },
      'f2-child': graphic('f2-group', 'C'),
      'f3-rect': graphic('p1-f3', 'R', { lock: { move: true } }),
      'f3-path': graphic('p1-f3', 'P'),
      'f2-path': graphic('p1-f2', 'P', { lock: { style: true } }),
      'p2-rect': graphic('p2-f1', 'R'),
    },
  }) as unknown as Design
/** Layers of one frame as selection pairs. */
const pairs = (frameId: string, ...ids: string[]) => pairsIn(frameId, ids)

describe('byFrame', () => {
  it('splits the selection by frame, frames in the order their first layer was picked', () => {
    const selection = [...pairs('p1-f2', 'dot'), ...pairs('p1-f1', 'rect'), ...pairs('p1-f2', 'f2-rect')]
    expect(byFrame(selection)).toEqual([
      { frameId: 'p1-f2', ids: ['dot', 'f2-rect'] },
      { frameId: 'p1-f1', ids: ['rect'] },
    ])
    expect(byFrame(null)).toEqual([])
  })
})

describe('toggled', () => {
  it('takes a selected layer out, and lets the selection go with the last one', () => {
    const design = fakeDesign()
    const both = [...pairs('p1-f1', 'rect'), ...pairs('p1-f2', 'f2-rect')]
    expect(toggled(both, { id: 'rect', frameId: 'p1-f1' }, design)).toEqual(pairs('p1-f2', 'f2-rect'))
    expect(toggled(pairs('p1-f1', 'rect'), { id: 'rect', frameId: 'p1-f1' }, design)).toEqual([])
  })

  it('adds a layer of a frame that holds a selected layer, and a linked copy of one in another frame', () => {
    const design = fakeDesign()
    expect(toggled(pairs('p1-f1', 'rect'), { id: 'path', frameId: 'p1-f1' }, design)).toEqual(
      pairs('p1-f1', 'rect', 'path'),
    )
    expect(toggled(pairs('p1-f1', 'rect'), { id: 'f2-rect', frameId: 'p1-f2' }, design)).toEqual([
      ...pairs('p1-f1', 'rect'),
      ...pairs('p1-f2', 'f2-rect'),
    ])
    // Once a copy is in, the rest of its frame can join it.
    const across = [...pairs('p1-f1', 'rect'), ...pairs('p1-f2', 'f2-rect')]
    expect(toggled(across, { id: 'dot', frameId: 'p1-f2' }, design)).toEqual([...across, ...pairs('p1-f2', 'dot')])
  })

  it('selects alone a layer of another frame that is no copy of a selected one', () => {
    const design = fakeDesign()
    expect(toggled(pairs('p1-f1', 'rect'), { id: 'dot', frameId: 'p1-f2' }, design)).toEqual(pairs('p1-f2', 'dot'))
    expect(toggled(null, { id: 'dot', frameId: 'p1-f2' }, design)).toEqual(pairs('p1-f2', 'dot'))
  })
})

describe('withCopies', () => {
  it('adds the linked copies of the selected layers in every frame of their page, hidden ones too, after the selection', () => {
    const design = fakeDesign()
    expect(withCopies(pairs('p1-f1', 'rect', 'path'), design)).toEqual([
      ...pairs('p1-f1', 'rect', 'path'),
      ...pairs('p1-f2', 'f2-rect'),
      ...pairs('p1-f3', 'f3-path'),
    ])
  })

  it('leaves out copies locked against any change, as select all does, and copies already selected', () => {
    const design = fakeDesign()
    // The rect's copy in the third frame is locked in place, the path's in the second against style.
    expect(withCopies(pairs('p1-f1', 'path'), design)).toEqual([
      ...pairs('p1-f1', 'path'),
      ...pairs('p1-f3', 'f3-path'),
    ])
    const start = [...pairs('p1-f1', 'rect'), ...pairs('p1-f2', 'f2-rect')]
    expect(withCopies(start, design)).toEqual(start)
  })

  it('finds copies inside groups, and of a group', () => {
    const design = fakeDesign()
    expect(withCopies(pairs('p1-f1', 'child'), design)).toEqual([
      ...pairs('p1-f1', 'child'),
      ...pairs('p1-f2', 'f2-child'),
    ])
    expect(withCopies(pairs('p1-f1', 'group'), design)).toEqual([
      ...pairs('p1-f1', 'group'),
      ...pairs('p1-f2', 'f2-group'),
    ])
  })

  it('is the selection as it is when no layer has a copy, and none with nothing selected', () => {
    const design = fakeDesign()
    expect(withCopies(pairs('p1-f2', 'dot'), design)).toEqual(pairs('p1-f2', 'dot'))
    expect(withCopies(null, design)).toEqual([])
  })
})
