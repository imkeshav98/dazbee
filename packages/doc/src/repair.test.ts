import { describe, expect, it } from 'vitest'

import { parseDesign } from '@dazbee/schema'

import { root, toYMap } from './design-doc.ts'
import { readDesign } from './index.ts'
import { repair } from './repair.ts'
import { twoTabs } from './test-design.ts'

type Json = Record<string, unknown>

const box = { x: 0, y: 0, width: 10, height: 10 }
const rect = { ...box, shape: { kind: 'rect' } }

/** A layer of `type` under `parentId`, sharing `link`. */
const layer = (type: 'group' | 'graphic' | 'text', parentId: string, link: string, index = 'a0'): Json => ({
  type,
  parentId,
  link,
  index,
  name: type,
  props:
    type === 'graphic'
      ? rect
      : type === 'text'
        ? { ...box, text: 'Hi', style: { fontFamily: 'Noto Sans', fontSize: 20, color: '#000000FF' } }
        : box,
})

const frame = (pageId: string, x: number, order: string) => ({
  pageId,
  name: 'Frame',
  width: 1080,
  height: 1080,
  x,
  y: 0,
  fills: [],
  order,
})

/** Page p1 holds frames p1-sq and p1-story, page p2 holds p2-sq; `nodes` are the layers. */
const snap = (nodes: Record<string, Json>) => ({
  meta: { designId: 'd1', name: 'Repairs' },
  pages: { p1: { name: 'Page 1', order: 'a0' }, p2: { name: 'Page 2', order: 'a1' } } as Record<string, Json>,
  frames: {
    'p1-sq': frame('p1', 0, 'a0'),
    'p1-story': frame('p1', 1280, 'a1'),
    'p2-sq': frame('p2', 0, 'a0'),
  } as Record<string, Json>,
  nodes,
})

/** Repairs a snapshot, checking that what comes out is a valid design that needs no more repair. */
function repaired<S extends ReturnType<typeof snap>>(s: S) {
  const out = repair(s)
  const parsed = parseDesign(out.snapshot)
  expect(parsed.success ? [] : parsed.errors).toEqual([])
  expect(repair(out.snapshot).repairs).toEqual([])
  return { ...out, nodes: out.snapshot.nodes as Record<string, Json> }
}

describe('repair', () => {
  it('returns the snapshot itself when nothing needs repair', () => {
    const s = snap({ a: layer('graphic', 'p1-sq', 'a'), b: layer('graphic', 'p1-story', 'a') })
    const out = repair(s)
    expect(out.snapshot).toBe(s)
    expect(out.repairs).toEqual([])
  })

  it('gives a design with no page left one empty page, at an id no frame or layer has', () => {
    const s = snap({ page: layer('graphic', 'p1-sq', 'page') })
    s.pages = {}
    s.frames['page-2'] = frame('p9', 0, 'a2')
    const out = repaired(s)
    expect(out.snapshot.pages).toEqual({ 'page-3': { name: 'Page 1', order: 'a0' } })
    expect(out.snapshot.frames).toEqual({})
    expect(out.nodes).toEqual({})
    expect(out.repairs).toEqual([
      'no page was left; added the empty page "page-3"',
      'dropped frame "p1-sq", whose page "p1" is gone',
      'dropped frame "p1-story", whose page "p1" is gone',
      'dropped frame "p2-sq", whose page "p2" is gone',
      'dropped frame "page-2", whose page "p9" is gone',
      'dropped "page", which is in no frame',
    ])
  })

  it('drops a frame whose page is gone, and the layers in it, keeping every other object as it was', () => {
    const s = snap({ x: layer('graphic', 'gone-f', 'x'), y: layer('graphic', 'p1-sq', 'y') })
    s.frames['gone-f'] = frame('p9', 0, 'a0')
    const out = repaired(s)
    expect(Object.keys(out.snapshot.frames).sort()).toEqual(['p1-sq', 'p1-story', 'p2-sq'])
    expect(Object.keys(out.nodes)).toEqual(['y'])
    expect(out.repairs).toEqual([
      'dropped frame "gone-f", whose page "p9" is gone',
      'dropped "x", which is in no frame',
    ])
    expect(out.nodes.y).toBe(s.nodes.y)
    expect(out.snapshot.frames['p1-sq']).toBe(s.frames['p1-sq'])
    expect(out.snapshot.pages).toBe(s.pages)
  })

  it('drops a layer that lost its type or props', () => {
    const s = snap({ a: layer('graphic', 'p1-sq', 'a'), b: { parentId: 'p1-sq', link: 'b', index: 'a1' } })
    const out = repaired(s)
    expect(Object.keys(out.nodes)).toEqual(['a'])
    expect(out.repairs).toEqual(['dropped "b", which lost its type or props'])
  })

  it('puts a layer that lost its index at the back', () => {
    const lost = layer('graphic', 'p1-sq', 'a')
    delete lost.index
    const out = repaired(snap({ a: lost }))
    expect(out.nodes.a).toMatchObject({ index: 'a0', parentId: 'p1-sq' })
    expect(out.repairs).toEqual(['"a" lost its index; put at the back'])
  })

  it('breaks a cycle at its smallest id, moving it to the top of the first frame of the first page that has one', () => {
    const s = snap({
      g2: layer('group', 'g1', 'g2'),
      g1: layer('group', 'g2', 'g1'),
      kid: layer('graphic', 'g2', 'kid'),
    })
    // The first page has no frame; on the second, the frame first by order (not by id) is the fallback.
    s.pages = { p0: { name: 'Empty', order: 'a0' }, p1: { name: 'Page 1', order: 'a1' } }
    s.frames = { 'p1-b': frame('p1', 0, 'a0'), 'p1-a': frame('p1', 1280, 'a1') }
    const out = repaired(s)
    expect(out.nodes.g1?.parentId).toBe('p1-b')
    expect(out.nodes.g2?.parentId).toBe('g1')
    expect(out.nodes.kid?.parentId).toBe('g2')
    expect(out.repairs).toEqual(['"g1" was inside itself; moved to frame "p1-b"'])
  })

  it('drops the layers of a cycle, and what they hold, when no frame is left to move them to', () => {
    const s = snap({
      g1: layer('group', 'g2', 'g1'),
      g2: layer('group', 'g1', 'g2'),
      kid: layer('graphic', 'g2', 'kid'),
    })
    s.frames = {}
    const out = repaired(s)
    expect(out.nodes).toEqual({})
    expect(out.repairs).toEqual([
      'dropped "g1", which was inside itself, with no frame to move it to',
      'dropped "g2", which was inside itself, with no frame to move it to',
      'dropped "kid", which is in no frame',
    ])
  })

  it("moves a layer whose parent can't hold it to the top of that parent's frame", () => {
    const out = repaired(
      snap({
        g: layer('group', 'p1-story', 'g'),
        pic: layer('graphic', 'g', 'pic'),
        t: layer('text', 'pic', 't'),
      }),
    )
    expect(out.nodes.t?.parentId).toBe('p1-story')
    expect(out.nodes.pic?.parentId).toBe('g')
    expect(out.repairs).toEqual([`"t" can't be held by "pic"; moved to frame "p1-story"`])
  })

  it('drops a layer whose frame or parent is gone, with everything under it', () => {
    const out = repaired(
      snap({
        orphan: layer('group', 'deleted-group', 'orphan'),
        child: layer('graphic', 'orphan', 'child'),
        framed: layer('graphic', 'deleted-frame', 'framed'),
        kept: layer('graphic', 'p2-sq', 'kept'),
      }),
    )
    expect(Object.keys(out.nodes)).toEqual(['kept'])
    expect(out.repairs).toEqual([
      'dropped "child", which is in no frame',
      'dropped "framed", which is in no frame',
      'dropped "orphan", which is in no frame',
    ])
  })

  it('leaves a link to the layer of a frame whose id sorts first, and gives each other holder its own id as link', () => {
    const out = repaired(
      snap({
        b: layer('graphic', 'p1-sq', 'L', 'a1'),
        a: layer('graphic', 'p1-sq', 'L', 'a0'),
        c: layer('graphic', 'p1-sq', 'L', 'a2'),
        // One link id in two frames is how linked copies are.
        d: layer('graphic', 'p1-story', 'L'),
      }),
    )
    expect(Object.fromEntries(Object.entries(out.nodes).map(([id, n]) => [id, n.link]))).toEqual({
      a: 'L',
      b: 'b',
      c: 'c',
      d: 'L',
    })
    expect(out.repairs).toEqual([
      '"b" held link "L" in frame "p1-sq" with "a"; its link is now "b"',
      '"c" held link "L" in frame "p1-sq" with "a"; its link is now "c"',
    ])
  })

  it('numbers the new link from 2 when the frame holds the layer id as a link, cutting a long id to fit', () => {
    const long = 'x'.repeat(64)
    const out = repaired(
      snap({
        a: layer('graphic', 'p1-sq', 'L'),
        b: layer('graphic', 'p1-sq', 'L'),
        holdsB: layer('graphic', 'p1-sq', 'b'),
        holdsB2: layer('graphic', 'p1-sq', 'b-2'),
        [long]: layer('graphic', 'p1-sq', 'L'),
        holdsLong: layer('graphic', 'p1-sq', long),
      }),
    )
    expect(out.nodes.b?.link).toBe('b-3')
    expect(out.nodes[long]?.link).toBe(`${'x'.repeat(60)}-2`)
  })

  it('checks links last, among the layers a broken cycle brought into a frame', () => {
    const s = snap({
      'a-keeper': layer('graphic', 'p1-sq', 'L'),
      g1: layer('group', 'g2', 'L'),
      g2: layer('group', 'g1', 'g2'),
    })
    const out = repaired(s)
    expect(out.nodes.g1).toMatchObject({ parentId: 'p1-sq', link: 'g1' })
    expect(out.nodes['a-keeper']?.link).toBe('L')
  })
})

describe('two tabs repairing a merged state', () => {
  it('a layer added into a group the other tab deleted at once is dropped in both, and undoing the delete brings both back', () => {
    const { a, b, tabA, tabB, sync } = twoTabs()
    tabA.run('node.create', { id: 'g', parentId: 'sq', layer: { type: 'group', name: 'G', props: box } })
    sync()
    tabA.run('node.delete', { ids: ['g'] })
    tabB.run('node.create', { id: 'dot', parentId: 'g', layer: { type: 'graphic', name: 'Dot', props: rect } })
    sync()
    for (const [doc, tab] of [
      [a, tabA],
      [b, tabB],
    ] as const) {
      expect(readDesign(doc).nodes.dot).toBeUndefined()
      expect(tab.design()).toEqual(readDesign(doc))
    }
    expect(readDesign(b)).toEqual(readDesign(a))

    tabA.undo()
    sync()
    for (const [doc, tab] of [
      [a, tabA],
      [b, tabB],
    ] as const) {
      expect(readDesign(doc).nodes.dot?.parentId).toBe('g')
      expect(tab.design()).toEqual(readDesign(doc))
    }
  })

  it('a frame and a layer added to a page the other tab deleted at once go in both, and undoing the delete brings them back', () => {
    const { a, b, tabA, tabB, sync } = twoTabs()
    tabA.run('page.add', {
      id: 'p2',
      name: 'Page 2',
      frame: { id: 'p2-sq', name: 'Square', width: 1080, height: 1080 },
    })
    sync()
    tabA.run('page.delete', { id: 'p2' })
    // Another tab's frame on that page, as adding a frame writes it.
    b.transact(() => root(b).frames.set('late', toYMap(frame('p2', 1280, 'a1'))))
    tabB.run('node.create', { id: 'dot', parentId: 'p2-sq', layer: { type: 'graphic', name: 'Dot', props: rect } })
    sync()
    for (const [doc, tab] of [
      [a, tabA],
      [b, tabB],
    ] as const) {
      const design = readDesign(doc)
      expect(design.pages.p2).toBeUndefined()
      expect(design.frames.late).toBeUndefined()
      expect(design.nodes.dot).toBeUndefined()
      expect(tab.design()).toEqual(design)
    }

    tabA.undo()
    sync()
    for (const [doc, tab] of [
      [a, tabA],
      [b, tabB],
    ] as const) {
      const design = readDesign(doc)
      expect(Object.keys(design.frames).sort()).toEqual(['banner', 'late', 'p2-sq', 'sq'])
      expect(design.nodes.dot?.parentId).toBe('p2-sq')
      expect(tab.design()).toEqual(design)
    }
  })
})
