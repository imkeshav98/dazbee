import { describe, expect, it } from 'vitest'
import type * as Y from 'yjs'

import { type Design, type DesignInput, parseDesign } from '@dazbee/schema'

import { boundsOf, centreOf, normalAngle, turn } from '../geometry.ts'
import { childrenOf, descendants, loadDesign, readDesign } from '../index.ts'
import { openTestSession } from '../test-design.ts'

const rect = (x: number, y: number, width: number, height: number, rotation = 0) => ({
  x,
  y,
  width,
  height,
  rotation,
  shape: { kind: 'rect' as const },
  fills: [{ type: 'solid' as const, color: '#FF5A36FF' }],
})

const white = [{ type: 'solid' as const, color: '#FFFFFFFF' }]

/**
 * In a square frame, two loose layers and a turned box holding a layer and a turned group. A
 * banner frame holds their linked copies, where some sit elsewhere, turn back or hide.
 */
const design = (): DesignInput => ({
  meta: { designId: 'd1', name: 'Groups' },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, fills: white, order: 'a0' },
    banner: { pageId: 'p1', name: 'Banner', width: 960, height: 320, x: 1280, y: 0, fills: white, order: 'a1' },
  },
  nodes: {
    a: { type: 'graphic', parentId: 'sq', link: 'a', index: 'a0', name: 'A', props: rect(100, 100, 200, 100, 20) },
    b: { type: 'graphic', parentId: 'sq', link: 'b', index: 'a1', name: 'B', props: rect(400, 150, 120, 120) },
    f: {
      type: 'box',
      parentId: 'sq',
      link: 'f',
      index: 'a2',
      name: 'F',
      props: { x: 300, y: 500, width: 500, height: 400, rotation: 30, clip: true },
    },
    c: { type: 'graphic', parentId: 'f', link: 'c', index: 'a0', name: 'C', props: rect(340, 540, 100, 60) },
    g2: {
      type: 'group',
      parentId: 'f',
      link: 'g2',
      index: 'a1',
      name: 'G2',
      props: { x: 500, y: 600, width: 200, height: 150, rotation: -15 },
    },
    d: { type: 'graphic', parentId: 'g2', link: 'd', index: 'a0', name: 'D', props: rect(500, 600, 200, 150, 10) },
    'banner-a': {
      type: 'graphic',
      parentId: 'banner',
      link: 'a',
      index: 'a0',
      name: 'A',
      props: rect(20, 20, 100, 50, 20),
    },
    'banner-b': {
      type: 'graphic',
      parentId: 'banner',
      link: 'b',
      index: 'a1',
      name: 'B',
      props: rect(400, 150, 120, 120),
    },
    'banner-f': {
      type: 'box',
      parentId: 'banner',
      link: 'f',
      index: 'a2',
      name: 'F',
      props: { x: 500, y: 10, width: 500, height: 400, rotation: 0, clip: true },
    },
    'banner-c': {
      type: 'graphic',
      parentId: 'banner-f',
      link: 'c',
      index: 'a0',
      name: 'C',
      props: { ...rect(340, 540, 100, 60), visible: false },
    },
    'banner-g2': {
      type: 'group',
      parentId: 'banner-f',
      link: 'g2',
      index: 'a1',
      name: 'G2',
      props: { x: 500, y: 600, width: 200, height: 150, rotation: -15 },
    },
    'banner-d': {
      type: 'graphic',
      parentId: 'banner-g2',
      link: 'd',
      index: 'a0',
      name: 'D',
      props: rect(500, 600, 200, 150, 10),
    },
  },
})

const fresh = () => {
  const parsed = parseDesign(design())
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  return loadDesign(parsed.design)
}

/** The banner frame's layers as they are now: an edit in the square leaves them as they were. */
const bannerLayers = (doc: Y.Doc) => {
  const d = readDesign(doc)
  return Object.fromEntries(descendants(d, 'banner').map((id) => [id, d.nodes[id]]))
}

/** A layer's own box. */
function boxOf(d: Design, id: string) {
  const p = d.nodes[id]?.props as {
    x: number
    y: number
    width: number
    height: number
    rotation?: number
    visible?: boolean
  }
  return { x: p.x, y: p.y, width: p.width, height: p.height, rotation: p.rotation ?? 0, visible: p.visible ?? true }
}

/** Where a layer is drawn, after every container around it turns it, and whether it shows. */
function drawn(d: Design, id: string) {
  const own = boxOf(d, id)
  let centre = centreOf(own)
  let rotation = own.rotation
  let visible = own.visible
  for (let up = d.nodes[id]?.parentId; up && d.nodes[up]; up = d.nodes[up]?.parentId) {
    const box = boxOf(d, up)
    centre = turn(centre, centreOf(box), box.rotation)
    rotation += box.rotation
    visible &&= box.visible
  }
  return { x: centre.x, y: centre.y, width: own.width, height: own.height, rotation: normalAngle(rotation), visible }
}
const drawnAll = (d: Design, ids: string[]) => Object.fromEntries(ids.map((id) => [id, drawn(d, id)]))
/**
 * Two placements are the same within what the document keeps: values are rounded to hundredths,
 * so a centre can be off by a few of them after a turn.
 */
function expectSame(after: ReturnType<typeof drawnAll>, before: ReturnType<typeof drawnAll>) {
  expect(Object.keys(after)).toEqual(Object.keys(before))
  for (const [key, was] of Object.entries(before)) {
    const now = after[key] as typeof was
    for (const field of ['x', 'y', 'width', 'height', 'rotation'] as const) {
      expect(Math.abs(now[field] - was[field]), `${key} ${field}: ${now[field]} vs ${was[field]}`).toBeLessThan(0.02)
    }
    expect(now.visible, `${key} visible`).toBe(was.visible)
  }
}
const LEAVES = ['a', 'b', 'c', 'd']

describe('node.group', () => {
  it('wraps layers in a group that hugs them, with a link id of its own, and nothing moves', () => {
    const doc = fresh()
    const tab = openTestSession(doc)
    const before = drawnAll(readDesign(doc), LEAVES)
    const banner = bannerLayers(doc)

    const id = tab.run('node.group', { ids: ['b', 'a'] })

    const after = readDesign(doc)
    expect(after.nodes[id]).toMatchObject({ type: 'group', parentId: 'sq', name: 'Group' })
    expect(Object.values(after.nodes).filter((n) => n.link === after.nodes[id]?.link)).toHaveLength(1)
    expect(childrenOf(after, id).map(([child]) => child)).toEqual(['a', 'b'])
    // In the layer order, the group stands where B, the topmost, was: under the box.
    expect(childrenOf(after, 'sq').map(([child]) => child)).toEqual([id, 'f'])
    const hug = boundsOf([boxOf(after, 'a'), boxOf(after, 'b')])
    const box = boxOf(after, id)
    expect([box.x, box.y, box.width, box.height]).toEqual(
      [hug.x, hug.y, hug.width, hug.height].map((n) => Math.round(n * 100) / 100),
    )
    expectSame(drawnAll(after, LEAVES), before)
    expect(bannerLayers(doc)).toEqual(banner)

    tab.undo()
    const undone = readDesign(doc)
    expect(undone.nodes[id]).toBeUndefined()
    expect(undone.nodes.a?.parentId).toBe('sq')
  })

  it('stores layers an auto layout draws elsewhere where they are drawn, and hugs them there', () => {
    const doc = fresh()
    const tab = openTestSession(doc)
    const banner = bannerLayers(doc)
    const id = tab.run('node.group', { ids: ['c', 'g2'], drawn: { g2: { x: 520, y: 610, width: 200, height: 150 } } })
    const after = readDesign(doc)
    // G2 is stored where it is drawn, and D, inside it, moves by as much; C, not drawn elsewhere, stays.
    expect(boxOf(after, 'g2')).toMatchObject({ x: 520, y: 610 })
    expect(boxOf(after, 'd')).toMatchObject({ x: 520, y: 610 })
    expect(boxOf(after, 'c')).toMatchObject({ x: 340, y: 540 })
    expect(boxOf(after, id).x).toBe(340)
    expect(bannerLayers(doc)).toEqual(banner)
  })

  it('refuses what it can not do, as node.box, node.enclose and node.ungroup do', () => {
    const tab = openTestSession(fresh())
    expect(() => tab.run('node.box', { ids: ['a', 'c'] })).toThrow(/box must share a parent/)
    expect(() => tab.run('node.enclose', { id: 'g2', ids: ['d'] })).toThrow(/not a box/)
    expect(() => tab.run('node.enclose', { id: 'f', ids: ['c'] })).toThrow(/not beside/)
    expect(() => tab.run('node.enclose', { id: 'f', ids: ['banner-a'] })).toThrow(/not beside/)
    expect(() => tab.run('node.group', { ids: ['a', 'c'] })).toThrow(/share a parent/)
    expect(() => tab.run('node.group', { ids: ['a', 'banner-a'] })).toThrow(/share a parent/)
    expect(() => tab.run('node.ungroup', { ids: ['a'] })).toThrow(/graphic, not a group, box or boolean/)
    tab.run('node.lock', { ids: ['g2'], lock: { delete: true } })
    expect(() => tab.run('node.ungroup', { ids: ['g2'] })).toThrow(/locked/)
  })
})

describe('node.box', () => {
  it('wraps layers in a box that hugs them, without a fill or clipping, and nothing moves', () => {
    const doc = fresh()
    const tab = openTestSession(doc)
    const before = drawnAll(readDesign(doc), LEAVES)
    const banner = bannerLayers(doc)

    const id = tab.run('node.box', { ids: ['c', 'g2'] })

    const after = readDesign(doc)
    expect(after.nodes[id]).toMatchObject({
      type: 'box',
      parentId: 'f',
      name: 'Box',
      props: { clip: false, fills: [] },
    })
    expect(childrenOf(after, id).map(([child]) => child)).toEqual(['c', 'g2'])
    const hug = boundsOf([boxOf(after, 'c'), boxOf(after, 'g2')])
    const box = boxOf(after, id)
    expect([box.x, box.y, box.width, box.height]).toEqual(
      [hug.x, hug.y, hug.width, hug.height].map((n) => Math.round(n * 100) / 100),
    )
    expectSame(drawnAll(after, LEAVES), before)
    expect(bannerLayers(doc)).toEqual(banner)

    tab.undo()
    expect(readDesign(doc)).toEqual(readDesign(fresh()))
  })
})

describe('node.enclose', () => {
  it('moves layers into a box drawn around them, where it was drawn, and nothing moves', () => {
    const doc = fresh()
    const tab = openTestSession(doc)
    // A box drawn in the square around A and B, 20 px clear of them.
    const square = boundsOf([boxOf(readDesign(doc), 'a'), boxOf(readDesign(doc), 'b')])
    const drawnBox = { x: square.x - 20, y: square.y - 20, width: square.width + 40, height: square.height + 40 }
    const id = tab.run('node.create', { parentId: 'sq', layer: { type: 'box', name: 'Box', props: drawnBox } })
    const before = drawnAll(readDesign(doc), LEAVES)
    const banner = bannerLayers(doc)

    tab.run('node.enclose', { id, ids: ['b', 'a'] })

    const after = readDesign(doc)
    expect(childrenOf(after, id).map(([child]) => child)).toEqual(['a', 'b'])
    expectSame(drawnAll(after, LEAVES), before)
    expect(boxOf(after, id)).toMatchObject(drawnBox)
    expect(bannerLayers(doc)).toEqual(banner)

    tab.undo()
    const undone = readDesign(doc)
    expect(undone.nodes.a?.parentId).toBe('sq')
    expect(undone.nodes[id]?.props).toMatchObject(drawnBox)
  })
})

describe('node.ungroup', () => {
  it('leaves every layer where it was after node.group, inside turned containers too', () => {
    const doc = fresh()
    const tab = openTestSession(doc)
    const before = drawnAll(readDesign(doc), LEAVES)
    const banner = bannerLayers(doc)

    // Inside the turned box: C and the turned group G2 together.
    const outer = tab.run('node.group', { ids: ['c', 'g2'] })
    expectSame(drawnAll(readDesign(doc), LEAVES), before)

    // G2 is turned -15°: its turn goes into D.
    expect(tab.run('node.ungroup', { ids: ['g2'] })).toEqual(['d'])
    let now = readDesign(doc)
    expect(now.nodes.g2).toBeUndefined()
    expect(now.nodes.d?.parentId).toBe(outer)
    expect(now.nodes.d?.props.rotation).toBe(-5)
    expectSame(drawnAll(now, LEAVES), before)

    expect(tab.run('node.ungroup', { ids: [outer] })).toEqual(['c', 'd'])
    now = readDesign(doc)
    expect(childrenOf(now, 'f').map(([child]) => child)).toEqual(['c', 'd'])
    expectSame(drawnAll(now, LEAVES), before)
    expect(bannerLayers(doc)).toEqual(banner)

    // Each was one undo step.
    tab.undo()
    expect(readDesign(doc).nodes[outer]?.type).toBe('group')
    tab.undo()
    expect(readDesign(doc).nodes.g2?.type).toBe('group')
    tab.undo()
    expect(readDesign(doc)).toEqual(readDesign(fresh()))
  })

  it('turns and hides what a turned, hidden group held, and its linked copy keeps its own group', () => {
    const doc = fresh()
    const tab = openTestSession(doc)
    const id = tab.run('node.group', { ids: ['a', 'b'] })
    tab.run('node.update', { ids: [id], patch: { rotation: 45, visible: false } })
    const before = drawnAll(readDesign(doc), ['a', 'b'])
    const banner = bannerLayers(doc)

    tab.run('node.ungroup', { ids: [id] })

    const after = readDesign(doc)
    expectSame(drawnAll(after, ['a', 'b']), before)
    expect(drawn(after, 'b')).toMatchObject({ visible: false, rotation: 45 })
    expect(bannerLayers(doc)).toEqual(banner)
  })

  it('takes the layers out of a turned box too, leaving them where they were, in one undo step', () => {
    const doc = fresh()
    const tab = openTestSession(doc)
    const before = drawnAll(readDesign(doc), LEAVES)
    const banner = bannerLayers(doc)

    expect(tab.run('node.ungroup', { ids: ['f'] })).toEqual(['c', 'g2'])

    const now = readDesign(doc)
    expect(now.nodes.f).toBeUndefined()
    expect(childrenOf(now, 'sq').map(([child]) => child)).toEqual(['a', 'b', 'c', 'g2'])
    expectSame(drawnAll(now, LEAVES), before)
    expect(bannerLayers(doc)).toEqual(banner)
    tab.undo()
    expect(readDesign(doc)).toEqual(readDesign(fresh()))
  })

  it('puts what a box held where it is drawn, as an auto layout box places it', () => {
    const doc = fresh()
    const tab = openTestSession(doc)
    tab.run('node.update', { ids: ['f'], patch: { rotation: 0 } })

    tab.run('node.ungroup', {
      ids: ['f'],
      drawn: { c: { x: 320, y: 520, width: 100, height: 60 }, g2: { x: 480, y: 610, width: 200, height: 150 } },
    })

    const now = readDesign(doc)
    expect(boxOf(now, 'c')).toMatchObject({ x: 320, y: 520 })
    expect(boxOf(now, 'g2')).toMatchObject({ x: 480, y: 610 })
    expect(boxOf(now, 'd')).toMatchObject({ x: 480, y: 610 })
  })
})

describe('node.hug', () => {
  it('fits a turned group to what it holds after one of them moves, and nothing moves on screen', () => {
    const doc = fresh()
    const tab = openTestSession(doc)
    tab.run('node.update', { ids: ['d'], patch: { x: 560, y: 700 } })
    const before = drawnAll(readDesign(doc), LEAVES)
    const banner = bannerLayers(doc)

    tab.run('node.hug', { ids: ['d'] })

    const after = readDesign(doc)
    expectSame(drawnAll(after, LEAVES), before)
    const hug = boundsOf([boxOf(after, 'd')])
    const box = boxOf(after, 'g2')
    expect(box.x).toBeCloseTo(hug.x, 1)
    expect(box.y).toBeCloseTo(hug.y, 1)
    expect(box.width).toBeCloseTo(hug.width, 1)
    expect(box.height).toBeCloseTo(hug.height, 1)
    expect(bannerLayers(doc)).toEqual(banner)
    // Fitting again changes nothing.
    tab.run('node.hug', { ids: ['g2'] })
    expect(readDesign(doc)).toEqual(after)
  })
})
