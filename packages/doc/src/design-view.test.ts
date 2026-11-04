import { describe, expect, it } from 'vitest'

import { type Design, Layer } from '@dazbee/schema'

import { childrenOf } from './children.ts'
import { type DesignDoc, readDesign, root, toYNode } from './design-doc.ts'
import type { Session } from './session.ts'
import { twoTabs } from './test-design.ts'

/** The tab's live design equals a full read of its document, layer order under every parent included. */
function expectFullRead(tab: Session, doc: DesignDoc) {
  const full = readDesign(doc)
  const view = tab.design()
  expect(view).toEqual(full)
  const order = (design: Design) =>
    Object.fromEntries(
      [...Object.keys(design.frames), ...Object.keys(design.nodes)].map((id) => [
        id,
        childrenOf(design, id).map(([child]) => child),
      ]),
    )
  expect(order(view)).toEqual(order(full))
}

const dot = (parentId: string, link: string) => ({
  type: 'graphic' as const,
  parentId,
  link,
  index: 'a5',
  name: 'Dot',
  props: { x: 0, y: 0, width: 10, height: 10, shape: { kind: 'ellipse' as const } },
})

describe("a session's design view", () => {
  it('is current inside a transaction: a command after a delete in the same transaction is refused', () => {
    const { a, tabA } = twoTabs()
    expect(() =>
      a.transact(() => {
        tabA.run('node.delete', { ids: ['box'] })
        tabA.run('node.update', { ids: ['box'], patch: { x: 1 } })
      }),
    ).toThrow('no layer "box"')
  })

  it('is current for any observer of the document, called before or after its own', () => {
    const { a, tabA } = twoTabs()
    const seen: string[] = []
    const look = (who: string) => () => {
      const design = tabA.design()
      seen.push(`${who}: x ${design.nodes.box?.props.x}, ${design.nodes.c1 ? 'has' : 'no'} c1`)
    }
    a.getMap('nodes').observe(look('shallow'))
    a.getMap('nodes').observeDeep(look('deep'))
    tabA.design()
    tabA.run('node.update', { ids: ['box'], patch: { x: 7 } })
    tabA.run('node.create', {
      id: 'c1',
      parentId: 'sq',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 1, height: 1 } },
    })
    expect(seen).toEqual(['deep: x 7, no c1', 'shallow: x 7, has c1', 'deep: x 7, has c1'])
  })

  it('hands out a live design: one read before an edit shows the edit, and a layer kept from before stays as it was', () => {
    const { tabA, tabB, sync } = twoTabs()
    const design = tabA.design()
    const box = design.nodes.box
    tabA.run('node.update', { ids: ['box'], patch: { x: 7 } })
    tabB.run('page.add', {
      id: 'p2',
      name: 'Page 2',
      frame: { id: 'p2-sq', name: 'Square', width: 1080, height: 1080 },
    })
    sync()
    expect(design.nodes.box?.props.x).toBe(7)
    expect(design.frames['p2-sq']).toMatchObject({ pageId: 'p2', x: 0, y: 0 })
    expect(box?.props.x).toBe(100)
    tabA.run('node.delete', { ids: ['box'] })
    expect(Object.keys(design.nodes)).not.toContain('box')
  })

  it('hands out a design that cannot be changed, so no caller can corrupt what later reads reuse', () => {
    const { tabA } = twoTabs()
    const design = tabA.design()
    expect(() => {
      ;(design.nodes.box as { props: { width: number } }).props.width = -50
    }).toThrow()
    expect(() => {
      ;(design.nodes as Record<string, unknown>).ghost = {}
    }).toThrow()
    expect(() => {
      ;(design.frames as Record<string, unknown>).ghost = {}
    }).toThrow()
    expect(tabA.design().nodes.box?.props.width).toBe(200)
  })

  it('reads a layer that arrives holding a link id its frame holds as a full read does, and again once the link is free', () => {
    const { a, b, tabA, tabB, sync } = twoTabs()
    tabA.design()
    // Another tab's layer in the square with the box's link id, as two pastes at once can make.
    b.transact(() => root(b).nodes.set('zz', toYNode(Layer.parse(dot('sq', 'box')))))
    sync()
    expectFullRead(tabA, a)
    expect(tabA.design().nodes.zz?.link).toBe('zz')
    expect(tabA.design().nodes.box?.link).toBe('box')
    // With the box gone, the link is free again, and the layer has it.
    tabB.run('node.delete', { ids: ['box'] })
    sync()
    expectFullRead(tabA, a)
    expect(tabA.design().nodes.zz?.link).toBe('box')
  })

  it('reads two new layers of one frame with one link id as a full read does', () => {
    const { a, b, tabA, sync } = twoTabs()
    tabA.design()
    b.transact(() => {
      root(b).nodes.set('n1', toYNode(Layer.parse(dot('banner', 'shared'))))
      root(b).nodes.set('n2', toYNode(Layer.parse(dot('banner', 'shared'))))
    })
    sync()
    expectFullRead(tabA, a)
    expect([tabA.design().nodes.n1?.link, tabA.design().nodes.n2?.link]).toEqual(['shared', 'n2'])
  })

  it('reads a layer another tab wrote into another frame as a full read does', () => {
    const { a, b, tabA, sync } = twoTabs()
    tabA.design()
    b.transact(() => root(b).nodes.get('box')?.set('parentId', 'banner'))
    sync()
    expectFullRead(tabA, a)
    // The banner holds its own copy of the box already: that one, sorting first, keeps the link.
    expect(tabA.design().nodes.box).toMatchObject({ parentId: 'banner', link: 'box-2' })
    expect(tabA.design().nodes['banner-box']?.link).toBe('box')
  })
})
