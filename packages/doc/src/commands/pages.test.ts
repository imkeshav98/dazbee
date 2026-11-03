import { describe, expect, it } from 'vitest'

import { inOrder } from '@dazbee/schema'

import { openSession, readDesign } from '../index.ts'
import { badge, freshDoc } from '../test-design.ts'

describe('commands', () => {
  it('page.add and format.add extend the design', () => {
    const doc = freshDoc()
    const tab = openSession(doc)

    const page = tab.run('page.add', { name: 'Card 2' })
    const format = tab.run('format.add', { name: 'Story', width: 1080, height: 1920 })

    const design = readDesign(doc)
    expect(design.pages[page]).toMatchObject({ name: 'Card 2' })
    expect(String(design.pages[page]?.order) > String(design.pages.p1?.order)).toBe(true)
    expect(design.formats[format]).toMatchObject({ name: 'Story', width: 1080, height: 1920 })
    expect(() => tab.run('format.add', { name: 'Bad', width: 0, height: 10 })).toThrow(/format.add: width/)
  })

  it('page.duplicate copies the page after itself with fresh layer ids, their nesting and their overrides', () => {
    const doc = freshDoc()
    const tab = openSession(doc)
    tab.run('page.add', { id: 'p2', name: 'Card 2' })
    tab.run('node.create', {
      id: 'g',
      parentId: 'p1',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } },
    })
    tab.run('node.create', { id: 'dot', parentId: 'g', layer: badge })

    const copy = tab.run('page.duplicate', { id: 'p1', name: 'Card 1 copy' })

    const design = readDesign(doc)
    const order = inOrder(design.pages).map(([id]) => id)
    expect(order).toEqual(['p1', copy, 'p2'])
    expect(design.pages[copy]).toMatchObject({ name: 'Card 1 copy', fills: design.pages.p1?.fills })
    const copied = Object.entries(design.nodes)
      .filter(([, n]) => n.parentId === copy)
      .map(([id, n]) => ({ id, name: n.name }))
    expect(copied.map((c) => c.name).sort()).toEqual(['Box', 'G', 'Headline'])
    expect(copied.every((c) => !['box', 'headline', 'g'].includes(c.id))).toBe(true)
    const group = copied.find((c) => c.name === 'G')?.id ?? ''
    expect(
      Object.values(design.nodes)
        .filter((n) => n.parentId === group)
        .map((n) => n.name),
    ).toEqual(['Badge'])
    const headline = copied.find((c) => c.name === 'Headline')?.id ?? ''
    expect(design.overrides['format:banner']?.[headline]).toEqual(design.overrides['format:banner']?.headline)
    expect(design.nodes[headline]).toMatchObject({ props: { text: 'Summer sale' } })

    tab.undo()
    expect(readDesign(doc).pages[copy]).toBeUndefined()
    expect(Object.keys(readDesign(doc).nodes).sort()).toEqual(['box', 'dot', 'g', 'headline'])
  })

  it('page.move reorders pages and page.update renames one', () => {
    const doc = freshDoc()
    const tab = openSession(doc)
    tab.run('page.add', { id: 'p2', name: 'Card 2' })
    tab.run('page.add', { id: 'p3', name: 'Card 3' })
    const order = () => inOrder(readDesign(doc).pages).map(([id]) => id)
    tab.run('page.move', { id: 'p3', before: 'p1' })
    expect(order()).toEqual(['p3', 'p1', 'p2'])
    tab.run('page.move', { id: 'p3', before: null })
    expect(order()).toEqual(['p1', 'p2', 'p3'])
    tab.undo()
    expect(order()).toEqual(['p3', 'p1', 'p2'])
    tab.run('page.update', { id: 'p2', name: 'Offer' })
    expect(readDesign(doc).pages.p2?.name).toBe('Offer')
    // The Page card (#83) sets a page's background without touching its name; undo takes it back.
    tab.run('page.update', { id: 'p2', fills: [{ type: 'solid', color: '#FF48B0FF' }] })
    expect(readDesign(doc).pages.p2).toMatchObject({ name: 'Offer', fills: [{ type: 'solid', color: '#FF48B0FF' }] })
    tab.undo()
    expect(readDesign(doc).pages.p2?.fills).toEqual([])
    expect(() => tab.run('page.move', { id: 'p2', before: 'nope' })).toThrow(/no other page/)
  })

  it('page.delete removes a page with its layers, keeps the last page, and undo brings the layers back', () => {
    const doc = freshDoc()
    const tab = openSession(doc)
    expect(() => tab.run('page.delete', { id: 'p1' })).toThrow(/at least one page/)
    const copy = tab.run('page.duplicate', { id: 'p1' })
    const before = readDesign(doc)

    tab.run('page.delete', { id: 'p1' })
    const after = readDesign(doc)
    expect(after.pages.p1).toBeUndefined()
    expect(after.nodes.box).toBeUndefined()
    expect(after.nodes.headline).toBeUndefined()
    expect(Object.values(after.nodes).every((n) => n.parentId === copy)).toBe(true)

    tab.undo()
    expect(readDesign(doc)).toEqual(before)
  })
})
