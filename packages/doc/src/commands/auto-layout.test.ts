import { describe, expect, it } from 'vitest'

import { type DesignInput, parseDesign } from '@dazbee/schema'

import { childrenOf, loadDesign, readDesign } from '../index.ts'
import { openTestSession } from '../test-design.ts'

const tile = (x: number) => ({ x, y: 20, width: 100, height: 60, shape: { kind: 'rect' as const } })

/** A box in a square frame holding three tiles in an even row, out of order, and its linked copy in a banner frame. */
const design = (): DesignInput => ({
  meta: { designId: 'd1', name: 'Rows' },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    banner: { pageId: 'p1', name: 'Banner', width: 960, height: 320, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    row: {
      type: 'box',
      parentId: 'sq',
      link: 'row',
      index: 'a0',
      name: 'Row',
      props: { x: 0, y: 0, width: 400, height: 100 },
    },
    t1: { type: 'graphic', parentId: 'row', link: 't1', index: 'a0', name: 'T1', props: tile(260) },
    t2: { type: 'graphic', parentId: 'row', link: 't2', index: 'a1', name: 'T2', props: tile(20) },
    t3: { type: 'graphic', parentId: 'row', link: 't3', index: 'a2', name: 'T3', props: tile(140) },
    'banner-row': {
      type: 'box',
      parentId: 'banner',
      link: 'row',
      index: 'a0',
      name: 'Row',
      props: { x: 0, y: 0, width: 400, height: 100 },
    },
    'banner-t1': { type: 'graphic', parentId: 'banner-row', link: 't1', index: 'a0', name: 'T1', props: tile(260) },
  },
})

const open = () => {
  const result = parseDesign(design())
  if (!result.success) throw new Error(result.errors.join('\n'))
  const doc = loadDesign(result.design)
  return { doc, tab: openTestSession(doc) }
}

describe('node.autoLayout', () => {
  it('reads a row off where the children are and orders them as the flow takes them; the linked copy stays', () => {
    const { doc, tab } = open()
    const copy = [readDesign(doc).nodes['banner-row'], readDesign(doc).nodes['banner-t1']]

    tab.run('node.autoLayout', { id: 'row', on: true })

    const d = readDesign(doc)
    expect(d.nodes.row?.props).toMatchObject({
      layout: {
        direction: 'row',
        gap: 20,
        padding: { top: 20, right: 40, bottom: 20, left: 20 },
        align: 'start',
      },
    })
    expect(childrenOf(d, 'row').map(([id]) => id)).toEqual(['t2', 't3', 't1'])
    expect([d.nodes['banner-row'], d.nodes['banner-t1']]).toEqual(copy)
  })

  it('takes the layout off again, each switch one undo step', () => {
    const { doc, tab } = open()
    tab.run('node.autoLayout', { id: 'row', on: true })
    tab.run('node.autoLayout', { id: 'row', on: false })
    expect(readDesign(doc).nodes.row?.props).not.toHaveProperty('layout')
    tab.undo()
    expect(readDesign(doc).nodes.row?.props).toHaveProperty('layout')
    tab.undo()
    expect(childrenOf(readDesign(doc), 'row').map(([id]) => id)).toEqual(['t1', 't2', 't3'])
  })

  it('switches only boxes, and not a locked one', () => {
    const { tab } = open()
    expect(() => tab.run('node.autoLayout', { id: 't1', on: true })).toThrow(/only boxes have auto layout/)
    tab.run('node.lock', { ids: ['row'], lock: { style: true } })
    expect(() => tab.run('node.autoLayout', { id: 'row', on: true })).toThrow(/"row" is locked \(style\)/)
    tab.run('node.autoLayout', { id: 'banner-row', on: true })
  })
})
