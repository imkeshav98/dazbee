import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import { LayerTree, parseDesign } from '@dazbee/schema'

import { childrenOf, loadDesign, openSession, readDesign } from '../index.ts'
import { badge, freshDoc, testDesign } from '../test-design.ts'

describe('commands', () => {
  it('node.move changes parent and order, and refuses to put a layer inside itself', () => {
    const doc = freshDoc()
    const tab = openSession(doc)
    const group = tab.run('node.create', {
      parentId: 'p1',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } },
    })

    tab.run('node.move', { id: 'box', parentId: group })
    expect(readDesign(doc).nodes.box?.parentId).toBe(group)

    tab.run('node.move', { id: group, parentId: 'p1', before: 'headline' })
    const order = childrenOf(readDesign(doc), 'p1').map(([id]) => id)
    expect(order).toEqual([group, 'headline'])

    expect(() => tab.run('node.move', { id: group, parentId: 'box' })).toThrow(/parent "box" is a graphic/)
    const inner = tab.run('node.create', {
      parentId: group,
      layer: { type: 'group', name: 'Inner', props: { x: 0, y: 0, width: 5, height: 5 } },
    })
    expect(() => tab.run('node.move', { id: group, parentId: inner })).toThrow(
      /node.move: can't move "\S+" inside itself/,
    )
  })

  it('node.move refuses to place a layer before itself', () => {
    const tab = openSession(freshDoc())
    expect(() => tab.run('node.move', { id: 'box', parentId: 'p1', before: 'box' })).toThrow(
      /node.move: can't place "box" before itself/,
    )
  })

  it('node.move and node.create work among siblings with tied or non-canonical indexes', () => {
    const result = parseDesign(testDesign())
    if (!result.success) throw new Error(result.errors.join('\n'))
    const design = result.design
    // Two tabs creating at once can tie; hand-written fixtures use keys like a000 that fractional-indexing rejects.
    Object.assign(design.nodes.box ?? {}, { index: 'a000' })
    Object.assign(design.nodes.headline ?? {}, { index: 'a000' })
    const doc = loadDesign(design)
    const tab = openSession(doc)

    const id = tab.run('node.create', { parentId: 'p1', layer: badge })
    tab.run('node.move', { id, parentId: 'p1', before: 'headline' })

    expect(
      childrenOf(readDesign(doc), 'p1')
        .map(([n]) => n)
        .at(-1),
    ).not.toBe(id)
  })

  describe('z-order', () => {
    /** Five shapes on p1 above box and headline, as ids bottom to top. */
    const stacked = () => {
      const doc = freshDoc()
      const tab = openSession(doc)
      for (const id of ['a', 'b', 'c', 'd', 'e']) tab.run('node.create', { id, parentId: 'p1', layer: badge })
      const order = () => childrenOf(readDesign(doc), 'p1').map(([id]) => id)
      return { doc, tab, order }
    }

    it('node.reorder brings layers forward and back one step, keeping a moved block in order', () => {
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

    it('node.reorder brings layers to the front or back, and undo puts them back', () => {
      const { tab, order } = stacked()
      tab.run('node.reorder', { ids: ['box', 'c'], to: 'front' })
      expect(order()).toEqual(['headline', 'a', 'b', 'd', 'e', 'box', 'c'])
      tab.run('node.reorder', { ids: ['e', 'a'], to: 'back' })
      expect(order()).toEqual(['a', 'e', 'headline', 'b', 'd', 'box', 'c'])
      tab.undo()
      expect(order()).toEqual(['headline', 'a', 'b', 'd', 'e', 'box', 'c'])
      tab.undo()
      expect(order()).toEqual(['box', 'headline', 'a', 'b', 'c', 'd', 'e'])
    })

    it('node.reorder works within each parent', () => {
      const { doc, tab, order } = stacked()
      tab.run('node.create', {
        id: 'g',
        parentId: 'p1',
        layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } },
      })
      tab.run('node.create', { id: 'in1', parentId: 'g', layer: badge })
      tab.run('node.create', { id: 'in2', parentId: 'g', layer: badge })
      tab.run('node.reorder', { ids: ['in1', 'a'], to: 'front' })
      expect(order()).toEqual(['box', 'headline', 'b', 'c', 'd', 'e', 'g', 'a'])
      expect(childrenOf(readDesign(doc), 'g').map(([id]) => id)).toEqual(['in2', 'in1'])
    })
  })

  it('node.duplicate copies layers right above themselves, with what is inside them and their overrides', () => {
    const doc = freshDoc()
    const tab = openSession(doc)
    tab.run('node.create', {
      id: 'g',
      parentId: 'p1',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } },
    })
    tab.run('node.create', { id: 'dot', parentId: 'g', layer: badge })
    tab.run('node.update', { ids: ['dot'], scope: 'format:banner', patch: { x: 3 } })

    const [box, group, ...rest] = tab.run('node.duplicate', { ids: ['box', 'g', 'dot'] })

    expect(rest).toEqual([])
    const design = readDesign(doc)
    expect(childrenOf(design, 'p1').map(([id]) => id)).toEqual(['box', box, 'headline', 'g', group])
    expect(design.nodes[box ?? '']?.props).toEqual(design.nodes.box?.props)
    const [[dot, copied] = []] = childrenOf(design, group ?? '')
    expect(dot).not.toBe('dot')
    expect(copied?.name).toBe('Badge')
    expect(design.overrides['format:banner']?.[dot ?? '']).toEqual({ x: 3 })
    tab.undo()
    expect(Object.keys(readDesign(doc).nodes).sort()).toEqual(['box', 'dot', 'g', 'headline'])
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
            index: 'a5',
            name: 'Card',
            props: { x: 10, y: 20, width: 300, height: 200 },
          },
          tile: {
            type: 'graphic',
            parentId: 'g',
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

    it('places a tree with fresh ids on top, moved by the offset, in one undo step', () => {
      const doc = freshDoc()
      const tab = openSession(doc)
      const [g] = tab.run('design.place', { parentId: 'p1', tree: tree(), dx: 100, dy: 5 })
      const design = readDesign(doc)
      expect(g).not.toBe('g')
      expect(childrenOf(design, 'p1').map(([id]) => id)).toEqual(['box', 'headline', g])
      const inside = childrenOf(design, g ?? '')
      expect(inside.map(([, n]) => n.name)).toEqual(['Tile', 'Label'])
      expect(inside.every(([id]) => !['tile', 'label'].includes(id))).toBe(true)
      expect(design.nodes[g ?? '']?.props).toMatchObject({ x: 110, y: 25 })
      expect(inside[1]?.[1].props).toMatchObject({ x: 130, y: 45, text: 'Hi' })
      tab.undo()
      expect(Object.keys(readDesign(doc).nodes).sort()).toEqual(['box', 'headline'])
    })

    it('placing the same tree twice gives two copies', () => {
      const doc = freshDoc()
      const tab = openSession(doc)
      const [a] = tab.run('design.place', { parentId: 'p1', tree: tree() })
      const [b] = tab.run('design.place', { parentId: 'p1', tree: tree() })
      const design = readDesign(doc)
      expect(a).not.toBe(b)
      expect(childrenOf(design, 'p1').map(([id]) => id)).toEqual(['box', 'headline', a, b])
      expect(Object.keys(design.nodes)).toHaveLength(2 + 6)
    })

    it('refuses a tree that is not whole, holds a layer its parent cannot, loops, or does not fit where it goes', () => {
      const tab = openSession(freshDoc())
      const t = tree()
      expect(() => tab.run('design.place', { parentId: 'p1', tree: { ...t, roots: ['nope'] } })).toThrow(
        /root "nope" is not in the tree/,
      )
      expect(() =>
        tab.run('design.place', {
          parentId: 'p1',
          tree: { ...t, nodes: { ...t.nodes, label: { ...t.nodes.label, parentId: 'gone' } } },
        }),
      ).toThrow(/"label" is neither a root nor inside one/)
      expect(() =>
        tab.run('design.place', {
          parentId: 'p1',
          tree: { ...t, nodes: { ...t.nodes, label: { ...t.nodes.label, parentId: 'tile' } } },
        }),
      ).toThrow(/a graphic, which can't hold "label"/)
      const loop = {
        roots: ['tile'],
        nodes: { tile: t.nodes.tile, a: { ...t.nodes.g, parentId: 'b' }, b: { ...t.nodes.g, parentId: 'a' } },
      }
      expect(() => tab.run('design.place', { parentId: 'p1', tree: loop })).toThrow(/is inside itself/)
      expect(() =>
        tab.run('design.place', {
          parentId: 'p1',
          tree: { ...t, nodes: { ...t.nodes, tile: { ...t.nodes.tile, props: { ...t.nodes.tile.props, width: -1 } } } },
        }),
      ).toThrow(/width/)
      expect(() => tab.run('design.place', { parentId: 'box', tree: t })).toThrow(/a graphic, which can't hold layers/)
      expect(() => tab.run('design.place', { parentId: 'nowhere', tree: t })).toThrow(/neither a page nor a layer/)
    })
  })
})
