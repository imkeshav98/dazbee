import { describe, expect, it } from 'vitest'

import { type Design, type DesignInput, parseDesign } from '@dazbee/schema'

import { render, sceneMemo } from './scene.ts'

const white = [{ type: 'solid' as const, color: '#FFFFFFFF' }]

const card = { type: 'box', index: 'a1', name: 'Card', props: { x: 0, y: 0, width: 500, height: 500 } } as const
const box = {
  type: 'graphic' as const,
  index: 'a0',
  name: 'Box',
  props: {
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    shape: { kind: 'rect' as const },
    fills: [{ type: 'solid' as const, color: '#FF5A36FF' }],
  },
}
const hidden = {
  type: 'graphic',
  index: 'a1',
  name: 'Hidden',
  props: { x: 0, y: 0, width: 10, height: 10, visible: false, shape: { kind: 'ellipse' } },
} as const
const headline = {
  type: 'text',
  index: 'a0',
  name: 'Headline',
  props: {
    x: 60,
    y: 600,
    width: 960,
    height: 100,
    text: 'Summer sale',
    style: { fontFamily: 'Noto Sans', fontSize: 84, color: '#111111FF' },
  },
} as const
const other = {
  type: 'graphic',
  index: 'a0',
  name: 'Other page',
  props: { x: 0, y: 0, width: 10, height: 10, shape: { kind: 'rect' } },
} as const

/** Two pages, each with a square frame and a banner frame holding linked copies of its layers. */
const input = (): DesignInput => ({
  meta: { designId: 'd1', name: 'Test' },
  pages: {
    p1: { name: 'Page 1', order: 'a0' },
    p2: { name: 'Page 2', order: 'a1' },
  },
  frames: {
    'p1-sq': { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, fills: white, order: 'a0' },
    'p1-banner': { pageId: 'p1', name: 'Banner', width: 320, height: 50, x: 1280, y: 0, fills: white, order: 'a1' },
    'p2-sq': { pageId: 'p2', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    'p2-banner': { pageId: 'p2', name: 'Banner', width: 320, height: 50, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    card: { ...card, parentId: 'p1-sq', link: 'card' },
    box: { ...box, parentId: 'card', link: 'box' },
    hidden: { ...hidden, parentId: 'card', link: 'hidden' },
    headline: { ...headline, parentId: 'p1-sq', link: 'headline' },
    other: { ...other, parentId: 'p2-sq', link: 'other' },
    'banner-card': { ...card, parentId: 'p1-banner', link: 'card' },
    'banner-box': { ...box, parentId: 'banner-card', link: 'box' },
    'banner-hidden': {
      ...hidden,
      parentId: 'banner-card',
      link: 'hidden',
      props: { ...hidden.props, visible: true },
    },
    'banner-headline': {
      ...headline,
      parentId: 'p1-banner',
      link: 'headline',
      props: { ...headline.props, text: 'Sale', x: 4 },
    },
    'banner-other': { ...other, parentId: 'p2-banner', link: 'other' },
  },
})

const design = (): Design => {
  const parsed = parseDesign(input())
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  return parsed.design
}

describe('render', () => {
  it('builds the frame’s tree in index order, with the frame’s size and fills', () => {
    const scene = render(design(), 'p1-sq')
    expect(scene).toMatchObject({ frameId: 'p1-sq', width: 1080, height: 1080, fills: white })
    expect(scene.layers.map((l) => l.id)).toEqual(['headline', 'card'])
    expect(scene.layers[1]?.children.map((l) => l.id)).toEqual(['box'])
  })

  it('leaves out hidden layers', () => {
    const ids = render(design(), 'p1-sq').layers.flatMap((l) => [l.id, ...l.children.map((c) => c.id)])
    expect(ids).not.toContain('hidden')
  })

  it('draws another frame’s linked copies with their own props', () => {
    const scene = render(design(), 'p1-banner')
    expect(scene).toMatchObject({ width: 320, height: 50 })
    expect(scene.layers[0]).toMatchObject({ id: 'banner-headline', props: { text: 'Sale', x: 4, y: 600 } })
    expect(scene.layers[1]?.children.map((l) => l.id)).toEqual(['banner-box', 'banner-hidden'])
  })

  it('only takes layers from the frame asked for', () => {
    expect(render(design(), 'p2-sq').layers.map((l) => l.id)).toEqual(['other'])
    expect(render(design(), 'p2-sq').fills).toEqual([])
  })

  it('does not change the design', () => {
    const d = design()
    const before = structuredClone(d)
    render(d, 'p1-banner')
    expect(d).toEqual(before)
  })

  it('refuses a frame the design does not have', () => {
    for (const id of ['nope', 'p1', 'card', 'constructor'])
      expect(() => render(design(), id)).toThrow(`no frame "${id}"`)
  })

  it('with a memo, keeps a layer object while the layer and its children are the same objects', () => {
    const memo = sceneMemo()
    const d = design()
    const first = render(d, 'p1-sq', memo)
    const [kept, changed] = first.layers
    // A new snapshot that changes only the box, the way the editor's design does.
    const moved = d.nodes['box']
    if (moved?.type !== 'graphic') throw new Error('no box')
    const next: Design = { ...d, nodes: { ...d.nodes, box: { ...moved, props: { ...moved.props, x: 140 } } } }
    const second = render(next, 'p1-sq', memo)
    expect(second.layers[0]).toBe(kept)
    expect(second.layers[1]).not.toBe(changed)
    expect(second.layers[1]?.children[0]?.props.x).toBe(140)
    // A change to a linked copy in another frame changes nothing here, and the same snapshot gives the same layers.
    const copy = next.nodes['banner-headline']
    if (copy?.type !== 'text') throw new Error('no copy')
    const third = render(
      { ...next, nodes: { ...next.nodes, 'banner-headline': { ...copy, props: { ...copy.props, x: 1 } } } },
      'p1-sq',
      memo,
    )
    expect(third.layers[0]).toBe(kept)
    expect(third.layers[1]).toBe(second.layers[1])
    expect(render(next, 'p1-banner', memo).layers[0]).not.toBe(kept)
  })
})
