import { describe, expect, it } from 'vitest'

import { twoTabs } from './test-design.ts'

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
      parentId: 'p1',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 1, height: 1 } },
    })
    expect(seen).toEqual(['deep: x 7, no c1', 'shallow: x 7, has c1', 'deep: x 7, has c1'])
  })

  it('hands out a live design: one read before an edit shows the edit, and a layer kept from before stays as it was', () => {
    const { tabA, tabB, sync } = twoTabs()
    const design = tabA.design()
    const box = design.nodes.box
    tabA.run('node.update', { ids: ['box'], patch: { x: 7 } })
    tabB.run('node.update', { ids: ['headline'], scope: 'format:banner', patch: { y: 9 } })
    sync()
    expect(design.nodes.box?.props.x).toBe(7)
    expect(design.overrides['format:banner']?.headline).toMatchObject({ y: 9 })
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
    expect(tabA.design().nodes.box?.props.width).toBe(200)
  })
})
