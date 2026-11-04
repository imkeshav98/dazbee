import { describe, expect, it } from 'vitest'

import { hug } from './hug.ts'
import { sessionOf } from './test-boxes.ts'

const square = (parentId: string, index: string, x: number) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name: 'Square',
  props: { x, y: 0, width: 50, height: 50, shape: { kind: 'rect' as const } },
})

/** A group holding two squares, fitted to them. */
function harness() {
  return sessionOf({
    meta: { schemaVersion: 5, designId: 'd', name: 'D', kind: 'single', primaryFormatId: 'sq' },
    formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
    pages: { p1: { name: 'One', order: 'a0' } },
    nodes: {
      group: {
        type: 'group',
        parentId: 'p1',
        index: 'a0',
        name: 'Group',
        props: { x: 0, y: 0, width: 150, height: 50 },
      },
      left: square('group', 'a0', 0),
      right: square('group', 'a1', 100),
    },
  })
}

describe('hug', () => {
  it('fits a group to what it holds again', () => {
    const session = harness()
    session.run('node.update', { ids: ['right'], patch: { x: 200 } })
    hug(session, ['group'])
    expect(session.design().nodes.group?.props).toMatchObject({ x: 0, width: 250 })
  })

  it('leaves out layers that are gone, and runs nothing when none are left', () => {
    const session = harness()
    session.run('node.update', { ids: ['right'], patch: { x: 200 } })
    hug(session, ['gone', 'group'])
    expect(session.design().nodes.group?.props).toMatchObject({ width: 250 })
    const steps = () => (session.canUndo() ? 'some' : 'none')
    session.undo()
    session.undo()
    expect(steps()).toBe('none')
    hug(session, ['gone'])
    expect(steps()).toBe('none')
  })
})
