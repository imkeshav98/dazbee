// The layers panel's tree: the page's frames as top-level rows with their layers inside, what a
// selection or a picked frame opens, and where the arrow keys go.
import { describe, expect, it } from 'vitest'

import { Design, type DesignInput } from '@dazbee/schema'

import { arrowStep, opensFor, treeRows } from './layer-tree.ts'

type Input = DesignInput['nodes'][string]

const shape = (parentId: string, index: string, name: string, link: string): Input => ({
  type: 'graphic',
  parentId,
  index,
  name,
  link,
  props: { x: 0, y: 0, width: 10, height: 10, shape: { kind: 'rect' } },
})
const group = (parentId: string, index: string, name: string, link: string): Input => ({
  type: 'group',
  parentId,
  index,
  name,
  link,
  props: { x: 0, y: 0, width: 10, height: 10 },
})
const frame = (pageId: string, name: string, width: number, height: number, order: string) => ({
  pageId,
  name,
  width,
  height,
  x: 0,
  y: 0,
  order,
})

/**
 * Page 1 holds Sale square and Sale story, linked (Headline and Photo in both, Badge only in the
 * square), and Fresh square, linked to neither; Page 2 holds Other. The square's Photo is a group
 * holding Picture.
 */
const design = (): Design =>
  Design.parse({
    meta: { designId: 'd', name: 'Summer sale' },
    pages: { p1: { name: 'Page 1', order: 'a0' }, p2: { name: 'Page 2', order: 'a1' } },
    frames: {
      story: frame('p1', 'Sale story', 1080, 1920, 'a1'),
      square: frame('p1', 'Sale square', 1080, 1080, 'a0'),
      fresh: frame('p1', 'Fresh square', 1080, 1080, 'a2'),
      other: frame('p2', 'Other', 300, 250, 'a0'),
    },
    nodes: {
      photo: group('square', 'a0', 'Photo', 'L-photo'),
      picture: shape('photo', 'a0', 'Picture', 'L-picture'),
      head: shape('square', 'a1', 'Headline', 'L-head'),
      badge: shape('square', 'a2', 'Badge', 'L-badge'),
      sPhoto: group('story', 'a0', 'Photo', 'L-photo'),
      sPicture: shape('sPhoto', 'a0', 'Picture', 'L-picture'),
      sHead: shape('story', 'a1', 'Headline', 'L-head'),
      fHead: shape('fresh', 'a0', 'Headline', 'L-fresh-head'),
      oHead: shape('other', 'a0', 'Headline', 'L-head'),
    },
  })

/** The rows as the panel lists them: each indented by its depth, a frame with its size. */
const listed = (rows: ReturnType<typeof treeRows>) =>
  rows.map((row) =>
    row.kind === 'frame'
      ? `${row.frame.name} ${row.frame.width}×${row.frame.height}`
      : `${'  '.repeat(row.depth)}${row.node.name}`,
  )

describe('treeRows', () => {
  it('lists the page’s frames by order as top-level rows, an open one with its layers inside, topmost first', () => {
    const rows = treeRows(design(), 'p1', new Set(['square']))
    expect(listed(rows)).toEqual([
      'Sale square 1080×1080',
      '  Badge',
      '  Headline',
      '  Photo',
      'Sale story 1080×1920',
      'Fresh square 1080×1080',
    ])
    expect(rows.map((row) => [row.id, row.depth, row.position, row.siblings])).toEqual([
      ['square', 0, 1, 3],
      ['badge', 1, 1, 3],
      ['head', 1, 2, 3],
      ['photo', 1, 3, 3],
      ['story', 0, 2, 3],
      ['fresh', 0, 3, 3],
    ])
  })

  it('lists an open group’s layers inside it, a level deeper, and none of a closed frame’s', () => {
    expect(listed(treeRows(design(), 'p1', new Set(['square', 'photo', 'sPhoto'])))).toEqual([
      'Sale square 1080×1080',
      '  Badge',
      '  Headline',
      '  Photo',
      '    Picture',
      'Sale story 1080×1920',
      'Fresh square 1080×1080',
    ])
  })

  it('marks a layer only here when its frame is linked to another on the page and no other frame there holds its link', () => {
    const marked = (open: string[]) =>
      treeRows(design(), 'p1', new Set(open)).flatMap((row) => (row.kind === 'layer' && row.onlyHere ? [row.id] : []))
    // Badge is in Sale square alone; Headline and Photo have copies in Sale story; Other's Headline
    // shares a link but is on another page.
    expect(marked(['square', 'photo', 'story', 'sPhoto'])).toEqual(['badge'])
    // Fresh square shares no link with any frame: none of its layers is marked.
    expect(marked(['fresh'])).toEqual([])
  })
})

describe('opensFor', () => {
  it('opens a selected layer’s frame and the groups it is in, and a picked frame', () => {
    expect(opensFor(design(), ['picture'], null).sort()).toEqual(['photo', 'square'])
    expect(opensFor(design(), ['sHead'], null)).toEqual(['story'])
    expect(opensFor(design(), [], 'fresh')).toEqual(['fresh'])
    expect(opensFor(design(), [], null)).toEqual([])
  })

  it('opens nothing for a layer or frame the design no longer has', () => {
    expect(opensFor(design(), ['gone'], 'gone too')).toEqual([])
  })
})

describe('arrowStep', () => {
  const open = new Set(['square'])
  const rows = treeRows(design(), 'p1', open)
  const at = (id: string) => rows.findIndex((row) => row.id === id)
  const step = (from: string, key: string, rtl = false) => {
    const to = arrowStep(rows, at(from), key, open, rtl)
    return to === null ? null : 'go' in to ? to.go.id : `${to.open ? 'open' : 'close'} ${to.toggle}`
  }

  it('goes up and down through frames and layers alike, and to the first and last row', () => {
    expect(step('square', 'ArrowDown')).toBe('badge')
    expect(step('photo', 'ArrowDown')).toBe('story')
    expect(step('story', 'ArrowUp')).toBe('photo')
    expect(step('fresh', 'ArrowDown')).toBeNull()
    expect(step('square', 'ArrowUp')).toBeNull()
    expect(step('head', 'Home')).toBe('square')
    expect(step('head', 'End')).toBe('fresh')
  })

  it('opens a closed frame or group inward, then goes to its first layer', () => {
    expect(step('story', 'ArrowRight')).toBe('open story')
    expect(step('photo', 'ArrowRight')).toBe('open photo')
    expect(step('square', 'ArrowRight')).toBe('badge')
    expect(step('badge', 'ArrowRight')).toBeNull()
  })

  it('closes an open frame outward, and goes from a layer to its frame’s row', () => {
    expect(step('square', 'ArrowLeft')).toBe('close square')
    expect(step('head', 'ArrowLeft')).toBe('square')
    expect(step('story', 'ArrowLeft')).toBeNull()
  })

  it('swaps left and right in a right-to-left language', () => {
    expect(step('square', 'ArrowLeft', true)).toBe('badge')
    expect(step('head', 'ArrowRight', true)).toBe('square')
  })

  it('leaves every other key alone', () => {
    expect(step('head', 'Enter')).toBeNull()
  })
})

