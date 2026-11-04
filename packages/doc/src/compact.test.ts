import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import type { Layer } from '@dazbee/schema'

import { root, toYNode } from './design-doc.ts'
import { compact, type DesignDoc, readDesign } from './index.ts'
import { openTestSession, testDoc, twoTabs } from './test-design.ts'

const sizeOf = (doc: DesignDoc) => Y.encodeStateAsUpdate(doc).byteLength
const badge = (x: number) =>
  ({
    type: 'graphic',
    name: 'Badge',
    props: {
      x,
      y: 40,
      width: 120,
      height: 120,
      shape: { kind: 'ellipse' },
      fills: [{ type: 'solid', color: '#FFC400FF' }],
    },
  }) as const

/** 50 layers that stay, made with commands, and with `deletes` more made, edited and deleted. */
function edited(deletes: number) {
  const doc = testDoc()
  const tab = openTestSession(doc)
  for (let i = 0; i < 50; i++) tab.run('node.create', { parentId: 'sq', layer: badge(i) })
  for (let i = 0; i < deletes; i++) {
    const id = tab.run('node.create', { parentId: 'sq', layer: badge(i) })
    tab.run('node.update', { ids: [id], patch: { x: 8, width: 40 } })
    tab.run('node.delete', { ids: [id] })
  }
  return { doc, tab }
}

describe('compact', () => {
  // 3,000 commands: under 1 s here, but over vitest's default 5 s on a CI runner busy with other packages' tests.
  it('drops 1,000 deleted layers, and the design reads the same', () => {
    // The sync server compacts its own copy, which holds no tab's undo history: a tab's undo
    // manager keeps the values its edits replaced, so they could not be collected.
    const doc = new Y.Doc()
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(edited(1000).doc))
    const design = readDesign(doc)
    const before = sizeOf(doc)

    expect(compact(doc)).toEqual({ layers: 1000 })

    expect(readDesign(doc)).toEqual(design)
    // Yjs keeps each dropped key's name, so this is not as small as a design that never had them,
    // but most of it is gone.
    expect(sizeOf(doc)).toBeLessThan(before / 3)
    // And the doc a tab would load has nothing deleted left in it.
    const loaded = new Y.Doc()
    Y.applyUpdate(loaded, Y.encodeStateAsUpdate(doc))
    expect(loaded.getMap('nodes').size).toBe(Object.keys(design.nodes).length)
  }, 30_000)

  it('writes nothing when nothing was deleted', () => {
    const { doc } = edited(0)
    const before = Y.encodeStateVector(doc)
    expect(compact(doc)).toEqual({ layers: 0 })
    expect(Y.encodeStateVector(doc)).toEqual(before)
  })

  it('drops a layer added to a frame another tab deleted, and keeps one that repair only moves', () => {
    const { a, tabA, tabB, sync } = twoTabs()
    tabA.run('page.add', {
      id: 'p2',
      name: 'Page 2',
      frame: { id: 'p2-sq', name: 'Square', width: 1080, height: 1080 },
    })
    sync()
    tabA.run('page.delete', { id: 'p2' })
    tabB.run('node.create', { id: 'lost', parentId: 'p2-sq', layer: badge(1) })
    sync()
    // A text another tab's write put inside a shape: repair moves it to the shape's frame.
    const headline = readDesign(a).nodes.headline as Layer
    a.transact(() => root(a).nodes.set('moved', toYNode({ ...headline, parentId: 'box', link: 'moved' })))
    const design = readDesign(a)
    expect(design.nodes.moved?.parentId).toBe('sq')

    expect(compact(a)).toEqual({ layers: 1 })

    expect(root(a).nodes.has('lost')).toBe(false)
    expect(root(a).nodes.has('moved')).toBe(true)
    expect(readDesign(a)).toEqual(design)
  })

  it('a tab that kept the old state, and edited offline, comes back to the same design', () => {
    const { doc: server, tab } = edited(20)
    const box = tab.run('node.create', { parentId: 'sq', layer: badge(300) })
    const offline = new Y.Doc()
    Y.applyUpdate(offline, Y.encodeStateAsUpdate(server))
    // It left and edited a layer that is still there; meanwhile the server compacted.
    openTestSession(offline).run('node.update', { ids: [box], patch: { x: 640 } })
    compact(server)

    Y.applyUpdate(server, Y.encodeStateAsUpdate(offline, Y.encodeStateVector(server)))
    Y.applyUpdate(offline, Y.encodeStateAsUpdate(server, Y.encodeStateVector(offline)))

    expect(readDesign(offline)).toEqual(readDesign(server))
    expect(readDesign(server).nodes[box]?.props).toMatchObject({ x: 640 })
    expect(offline.getMap('nodes').size).toBe(server.getMap('nodes').size)
  })

  it('a tab cut off before compaction can no longer undo its delete, and nothing breaks', () => {
    const { doc: server } = edited(0)
    const cutOff = new Y.Doc()
    Y.applyUpdate(cutOff, Y.encodeStateAsUpdate(server))
    const tab = openTestSession(cutOff)
    const id = tab.run('node.create', { parentId: 'sq', layer: badge(1) })
    tab.run('node.delete', { ids: [id] })
    Y.applyUpdate(server, Y.encodeStateAsUpdate(cutOff, Y.encodeStateVector(server)))
    // It drops off, the server compacts, and the tab undoes the delete before it reconnects.
    compact(server)
    tab.undo()
    expect(readDesign(cutOff).nodes[id]).toBeDefined()

    Y.applyUpdate(cutOff, Y.encodeStateAsUpdate(server, Y.encodeStateVector(cutOff)))
    Y.applyUpdate(server, Y.encodeStateAsUpdate(cutOff, Y.encodeStateVector(server)))
    expect(readDesign(cutOff).nodes[id]).toBeUndefined()
    expect(readDesign(cutOff)).toEqual(readDesign(server))
  })

  it('a tab that opens after compaction can undo its own edits as usual', () => {
    const { doc } = edited(10)
    compact(doc)
    const tab = openTestSession(doc)
    const id = tab.run('node.create', { parentId: 'sq', layer: badge(1) })
    tab.run('node.delete', { ids: [id] })
    tab.undo()
    expect(readDesign(doc).nodes[id]).toMatchObject({ name: 'Badge' })
  })
})
