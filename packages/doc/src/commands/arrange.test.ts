import { describe, expect, it } from 'vitest'
import type * as Y from 'yjs'
import type { z } from 'zod'

import { type Layer, LayerTree, parseDesign } from '@dazbee/schema'

import { childrenOf, loadDesign, readDesign } from '../index.ts'
import { badge, openTestSession, testDesign, testDoc } from '../test-design.ts'

/** The banner's layers, its copies of the square's, as they are now. */
const banner = (doc: Y.Doc) => {
  const design = readDesign(doc)
  return Object.fromEntries(childrenOf(design, 'banner'))
}

describe('node.move', () => {
  it('changes parent and order, and refuses to put a layer inside itself', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const before = banner(doc)
    const group = tab.run('node.create', {
      parentId: 'sq',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } },
    })

    tab.run('node.move', { id: 'box', parentId: group })
    expect(readDesign(doc).nodes.box?.parentId).toBe(group)

    tab.run('node.move', { id: group, parentId: 'sq', before: 'headline' })
    const order = childrenOf(readDesign(doc), 'sq').map(([id]) => id)
    expect(order).toEqual([group, 'headline'])
    expect(banner(doc)).toEqual(before)

    expect(() => tab.run('node.move', { id: group, parentId: 'box' })).toThrow(/parent "box" is a graphic/)
    const inner = tab.run('node.create', {
      parentId: group,
      layer: { type: 'group', name: 'Inner', props: { x: 0, y: 0, width: 5, height: 5 } },
    })
    expect(() => tab.run('node.move', { id: group, parentId: inner })).toThrow(
      /node.move: can't move "\S+" inside itself/,
    )
  })

  it('refuses to move a layer into another frame, at its top or into a layer there', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const group = tab.run('node.create', {
      parentId: 'banner',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } },
    })
    expect(() => tab.run('node.move', { id: 'box', parentId: 'banner' })).toThrow(
      /node.move: can't move "box" to another frame/,
    )
    expect(() => tab.run('node.move', { id: 'box', parentId: group })).toThrow(/can't move "box" to another frame/)
    expect(() => tab.run('node.move', { id: 'box', parentId: 'p1' })).toThrow(/neither a frame nor a layer/)
    expect(readDesign(doc).nodes.box?.parentId).toBe('sq')
  })

  it('refuses to place a layer before itself', () => {
    const tab = openTestSession(testDoc())
    expect(() => tab.run('node.move', { id: 'box', parentId: 'sq', before: 'box' })).toThrow(
      /node.move: can't place "box" before itself/,
    )
  })

  it('works among siblings with tied or non-canonical indexes, as node.create does', () => {
    const result = parseDesign(testDesign())
    if (!result.success) throw new Error(result.errors.join('\n'))
    const design = result.design
    // Two tabs creating at once can tie; hand-written fixtures use keys like a000 that fractional-indexing rejects.
    Object.assign(design.nodes.box ?? {}, { index: 'a000' })
    Object.assign(design.nodes.headline ?? {}, { index: 'a000' })
    const doc = loadDesign(design)
    const tab = openTestSession(doc)

    const id = tab.run('node.create', { parentId: 'sq', layer: badge })
    tab.run('node.move', { id, parentId: 'sq', before: 'headline' })

    expect(
      childrenOf(readDesign(doc), 'sq')
        .map(([n]) => n)
        .at(-1),
    ).not.toBe(id)
  })
})

describe('node.reorder', () => {
  /** Five shapes in the square above box and headline, as ids bottom to top. */
  const stacked = () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    for (const id of ['a', 'b', 'c', 'd', 'e']) tab.run('node.create', { id, parentId: 'sq', layer: badge })
    const order = () => childrenOf(readDesign(doc), 'sq').map(([id]) => id)
    return { doc, tab, order }
  }

  it('brings layers forward and back one step, keeping a moved block in order', () => {
    const { tab, order } = stacked()
    expect(order()).toEqual(['box', 'headline', 'a', 'b', 'c', 'd', 'e'])
    tab.run('node.reorder', { ids: ['b'], to: 'forward' })
    expect(order()).toEqual(['box', 'headline', 'a', 'c', 'b', 'd', 'e'])
    tab.run('node.reorder', { ids: ['a', 'c'], to: 'forward' })
    expect(order()).toEqual(['box', 'headline', 'b', 'a', 'c', 'd', 'e'])
    tab.run('node.reorder', { ids: ['d', 'e'], to: 'backward' })
    expect(order()).toEqual(['box', 'headline', 'b', 'a', 'd', 'e', 'c'])
    // Already on top: nothing to do, and nothing written.
    const tabUndo = tab.canUndo()
    tab.run('node.reorder', { ids: ['c'], to: 'forward' })
    expect(order()).toEqual(['box', 'headline', 'b', 'a', 'd', 'e', 'c'])
    expect(tab.canUndo()).toBe(tabUndo)
  })

  it('brings layers to the front or back, and undo puts them back; the linked copies keep their order', () => {
    const { doc, tab, order } = stacked()
    const before = childrenOf(readDesign(doc), 'banner').map(([id]) => id)
    tab.run('node.reorder', { ids: ['box', 'c'], to: 'front' })
    expect(order()).toEqual(['headline', 'a', 'b', 'd', 'e', 'box', 'c'])
    tab.run('node.reorder', { ids: ['e', 'a'], to: 'back' })
    expect(order()).toEqual(['a', 'e', 'headline', 'b', 'd', 'box', 'c'])
    expect(childrenOf(readDesign(doc), 'banner').map(([id]) => id)).toEqual(before)
    tab.undo()
    expect(order()).toEqual(['headline', 'a', 'b', 'd', 'e', 'box', 'c'])
    tab.undo()
    expect(order()).toEqual(['box', 'headline', 'a', 'b', 'c', 'd', 'e'])
  })

  it('works within each parent', () => {
    const { doc, tab, order } = stacked()
    tab.run('node.create', {
      id: 'g',
      parentId: 'sq',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } },
    })
    tab.run('node.create', { id: 'in1', parentId: 'g', layer: badge })
    tab.run('node.create', { id: 'in2', parentId: 'g', layer: badge })
    tab.run('node.reorder', { ids: ['in1', 'a'], to: 'front' })
    expect(order()).toEqual(['box', 'headline', 'b', 'c', 'd', 'e', 'g', 'a'])
    expect(childrenOf(readDesign(doc), 'g').map(([id]) => id)).toEqual(['in2', 'in1'])
  })
})

describe('node.duplicate', () => {
  it('copies layers right above themselves, with what is inside them, each copy with a new link id', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    tab.run('node.create', {
      id: 'g',
      parentId: 'sq',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } },
    })
    tab.run('node.create', { id: 'dot', parentId: 'g', layer: badge })
    const before = banner(doc)

    const [box, group, ...rest] = tab.run('node.duplicate', { ids: ['box', 'g', 'dot'] })

    expect(rest).toEqual([])
    const design = readDesign(doc)
    expect(childrenOf(design, 'sq').map(([id]) => id)).toEqual(['box', box, 'headline', 'g', group])
    expect(design.nodes[box ?? '']?.props).toEqual(design.nodes.box?.props)
    const [[dot, copied] = []] = childrenOf(design, group ?? '')
    expect(dot).not.toBe('dot')
    expect(copied?.name).toBe('Badge')
    const links = [box, group, dot, 'box', 'g', 'dot'].map((id) => design.nodes[id ?? '']?.link)
    expect(new Set(links).size).toBe(6)
    expect(banner(doc)).toEqual(before)
    tab.undo()
    expect(Object.keys(readDesign(doc).nodes).sort()).toEqual([
      'banner-box',
      'banner-headline',
      'box',
      'dot',
      'g',
      'headline',
    ])
  })

  it('copies a linked copy in its own frame, and the copy is linked to nothing', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const [copy = ''] = tab.run('node.duplicate', { ids: ['banner-box'] })
    const design = readDesign(doc)
    expect(design.nodes[copy]).toMatchObject({ parentId: 'banner', name: 'Box' })
    expect(Object.values(design.nodes).filter((n) => n.link === design.nodes[copy]?.link)).toHaveLength(1)
  })
})

describe('design.place', () => {
  // A group holding a box and a text, as a copy puts it on the clipboard.
  const tree = () =>
    ({
      roots: ['g'],
      nodes: {
        g: {
          type: 'group',
          parentId: 'elsewhere',
          link: 'g',
          index: 'a5',
          name: 'Card',
          props: { x: 10, y: 20, width: 300, height: 200 },
        },
        tile: {
          type: 'graphic',
          parentId: 'g',
          link: 'tile',
          index: 'a0',
          name: 'Tile',
          props: {
            x: 10,
            y: 20,
            width: 300,
            height: 200,
            shape: { kind: 'rect' },
            fills: [{ type: 'solid', color: '#2F6BFFFF' }],
          },
        },
        label: {
          type: 'text',
          parentId: 'g',
          link: 'label',
          index: 'a1',
          name: 'Label',
          props: {
            x: 30,
            y: 40,
            width: 200,
            height: 60,
            text: 'Hi',
            style: { fontFamily: 'Noto Sans', fontSize: 40, color: '#FFFFFFFF' },
          },
        },
      },
    }) satisfies z.input<typeof LayerTree>

  it('places a tree with fresh ids and link ids on top, moved by the offset, in one undo step', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const [g] = tab.run('design.place', { parentId: 'sq', tree: tree(), dx: 100, dy: 5 })
    const design = readDesign(doc)
    expect(g).not.toBe('g')
    expect(childrenOf(design, 'sq').map(([id]) => id)).toEqual(['box', 'headline', g])
    const inside = childrenOf(design, g ?? '')
    expect(inside.map(([, n]) => n.name)).toEqual(['Tile', 'Label'])
    expect(inside.every(([id]) => !['tile', 'label'].includes(id))).toBe(true)
    const links = [design.nodes[g ?? '']?.link, ...inside.map(([, n]) => n.link)]
    expect(links.filter((link) => ['g', 'tile', 'label'].includes(link ?? ''))).toEqual([])
    expect(design.nodes[g ?? '']?.props).toMatchObject({ x: 110, y: 25 })
    expect(inside[1]?.[1].props).toMatchObject({ x: 130, y: 45, text: 'Hi' })
    tab.undo()
    expect(Object.keys(readDesign(doc).nodes).sort()).toEqual(['banner-box', 'banner-headline', 'box', 'headline'])
  })

  it('placing the same tree twice, in one frame or two, gives copies linked to nothing', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const [a] = tab.run('design.place', { parentId: 'sq', tree: tree() })
    const [b] = tab.run('design.place', { parentId: 'sq', tree: tree() })
    const [c] = tab.run('design.place', { parentId: 'banner', tree: tree() })
    const design = readDesign(doc)
    expect(a).not.toBe(b)
    expect(childrenOf(design, 'sq').map(([id]) => id)).toEqual(['box', 'headline', a, b])
    expect(childrenOf(design, 'banner').map(([id]) => id)).toEqual(['banner-box', 'banner-headline', c])
    expect(Object.keys(design.nodes)).toHaveLength(4 + 9)
    expect(new Set(Object.values(design.nodes).map((n) => n.link)).size).toBe(2 + 9)
  })

  it('with keepLinks, keeps each link id the frame it goes into holds on no layer', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    // The square's box and headline, as a copy in the square puts them on the clipboard.
    const square = readDesign(doc).nodes
    const copied = {
      roots: ['box', 'headline'],
      nodes: { box: square.box as Layer, headline: square.headline as Layer },
    }
    tab.run('node.delete', { ids: ['banner-headline'] })

    const [box, headline] = tab.run('design.place', { parentId: 'banner', tree: copied, keepLinks: true })

    const design = readDesign(doc)
    // The banner still holds a copy of the box, so that one is a new layer; its headline was deleted.
    expect(design.nodes[headline ?? '']?.link).toBe('headline')
    expect(design.nodes[box ?? '']?.link).not.toBe('box')
    expect(design.nodes['banner-box']?.link).toBe('box')
  })

  it('with keepLinks, keeps a link id once in a frame: a second layer with it, or a second place, makes new ones', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    tab.run('frame.add', { id: 'f2', pageId: 'p1', name: 'Frame', width: 600, height: 500 })
    tab.run('node.create', {
      id: 'holder',
      parentId: 'f2',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 300, height: 300 } },
    })
    const t = tree()
    const twice = { ...t, nodes: { ...t.nodes, label: { ...t.nodes.label, link: 'tile' } } }

    const [first] = tab.run('design.place', { parentId: 'holder', tree: twice, keepLinks: true })
    const [second] = tab.run('design.place', { parentId: 'f2', tree: t, keepLinks: true })

    const links = (root: string) => {
      const design = readDesign(doc)
      return [root, ...childrenOf(design, root).map(([id]) => id)].map((id) => design.nodes[id]?.link)
    }
    const [g, tile, label] = links(first ?? '')
    expect([g, tile]).toEqual(['g', 'tile'])
    expect(label).not.toBe('tile')
    const again = links(second ?? '')
    expect(again.filter((link) => ['g', 'tile', 'label'].includes(link ?? ''))).toEqual(['label'])
    // Another frame of the page holds none of them.
    const [third] = tab.run('design.place', { parentId: 'sq', tree: t, keepLinks: true })
    expect(links(third ?? '')).toEqual(['g', 'tile', 'label'])
  })

  it('refuses a tree that is not whole, holds a layer its parent cannot, loops, or does not fit where it goes', () => {
    const tab = openTestSession(testDoc())
    const t = tree()
    expect(() => tab.run('design.place', { parentId: 'sq', tree: { ...t, roots: ['nope'] } })).toThrow(
      /root "nope" is not in the tree/,
    )
    expect(() =>
      tab.run('design.place', {
        parentId: 'sq',
        tree: { ...t, nodes: { ...t.nodes, label: { ...t.nodes.label, parentId: 'gone' } } },
      }),
    ).toThrow(/"label" is neither a root nor inside one/)
    expect(() =>
      tab.run('design.place', {
        parentId: 'sq',
        tree: { ...t, nodes: { ...t.nodes, label: { ...t.nodes.label, parentId: 'tile' } } },
      }),
    ).toThrow(/a graphic, which can't hold "label"/)
    const loop = {
      roots: ['tile'],
      nodes: { tile: t.nodes.tile, a: { ...t.nodes.g, parentId: 'b' }, b: { ...t.nodes.g, parentId: 'a' } },
    }
    expect(() => tab.run('design.place', { parentId: 'sq', tree: loop })).toThrow(/is inside itself/)
    expect(() =>
      tab.run('design.place', {
        parentId: 'sq',
        tree: { ...t, nodes: { ...t.nodes, tile: { ...t.nodes.tile, props: { ...t.nodes.tile.props, width: -1 } } } },
      }),
    ).toThrow(/width/)
    expect(() => tab.run('design.place', { parentId: 'box', tree: t })).toThrow(/a graphic, which can't hold layers/)
    expect(() => tab.run('design.place', { parentId: 'nowhere', tree: t })).toThrow(/neither a frame nor a layer/)
    expect(() => tab.run('design.place', { parentId: 'p1', tree: t })).toThrow(/neither a frame nor a layer/)
  })
})
