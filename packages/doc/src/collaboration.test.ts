import { describe, expect, it } from 'vitest'

import { type Design, parseDesign } from '@dazbee/schema'

import { childrenOf, type DesignDoc, loadDesign, openSession, readDesign, type Session } from './index.ts'
import { testDesign, twoTabs } from './test-design.ts'

/** A fuzz run makes hundreds of commands and full reads; a cold CI runner needs more than vitest's 5 s. */
const FUZZ_TIMEOUT = 30_000

describe('changes no one undoes', () => {
  it('a change made untracked stays through undo and redo, and undo reverts the edit before it', () => {
    const result = parseDesign(testDesign())
    if (!result.success) throw new Error(result.errors.join('\n'))
    const session = openSession(loadDesign(result.design))
    const [id] = Object.keys(session.design().nodes)
    if (!id) throw new Error('no layer')
    session.run('node.update', { ids: [id], patch: { x: 11 } })
    session.untracked(() => session.run('node.update', { ids: [id], patch: { y: 22 } }))
    expect(session.canUndo()).toBe(true)
    session.undo()
    expect(session.design().nodes[id]?.props).toMatchObject({ y: 22 })
    expect((session.design().nodes[id]?.props as { x: number }).x).not.toBe(11)
    expect(session.canUndo()).toBe(false)
    session.redo()
    expect(session.design().nodes[id]?.props).toMatchObject({ x: 11, y: 22 })
  })
})

describe('what undo and redo can do', () => {
  it('says whether there is a step to undo or redo, and calls back each time that may change', () => {
    const result = parseDesign(testDesign())
    if (!result.success) throw new Error(result.errors.join('\n'))
    const session = openSession(loadDesign(result.design))
    const [id] = Object.keys(session.design().nodes)
    if (!id) throw new Error('no layer')
    let calls = 0
    const stop = session.onHistory(() => calls++)
    expect([session.canUndo(), session.canRedo()]).toEqual([false, false])
    session.run('node.update', { ids: [id], patch: { x: 11 } })
    expect([session.canUndo(), session.canRedo(), calls > 0]).toEqual([true, false, true])
    calls = 0
    session.undo()
    expect([session.canUndo(), session.canRedo(), calls > 0]).toEqual([false, true, true])
    calls = 0
    session.redo()
    expect([session.canUndo(), session.canRedo(), calls > 0]).toEqual([true, false, true])
    stop()
    calls = 0
    session.undo()
    expect(calls).toBe(0)
  })

  it('a change from another tab gives this tab nothing to undo', () => {
    const { tabA, tabB, sync } = twoTabs()
    const [id] = Object.keys(tabB.design().nodes)
    if (!id) throw new Error('no layer')
    tabB.run('node.update', { ids: [id], patch: { x: 5 } })
    sync()
    expect([tabA.canUndo(), tabA.canRedo()]).toEqual([false, false])
  })
})

describe('two tabs', () => {
  it('undo in one tab reverts only its own edits, never the other tab’s', () => {
    const { a, b, tabA, tabB, sync } = twoTabs()

    tabA.run('node.update', { ids: ['box'], patch: { x: 500 } })
    sync()
    tabB.run('node.update', { ids: ['box'], patch: { y: 700 } })
    tabB.run('text.edit', { id: 'headline', op: { kind: 'insert', at: 0, text: 'Big ' } })
    sync()

    tabA.undo()
    sync()

    for (const doc of [a, b]) {
      const design = readDesign(doc)
      expect(design.nodes.box?.props).toMatchObject({ x: 100, y: 700 })
      expect(design.nodes.headline?.type === 'text' && design.nodes.headline.props.text).toBe('Big Summer sale')
    }

    // The other tab's undo takes back its own last edit, the text, and leaves the rest.
    tabB.undo()
    sync()

    for (const doc of [a, b]) {
      const design = readDesign(doc)
      expect(design.nodes.box?.props).toMatchObject({ x: 100, y: 700 })
      expect(design.nodes.headline?.type === 'text' && design.nodes.headline.props.text).toBe('Summer sale')
    }
  })

  it('the same property set by each tab in turn: each undo takes back only its own tab’s value', () => {
    const { a, b, tabA, tabB, sync } = twoTabs()

    tabA.run('node.update', { ids: ['box'], patch: { y: 400 } })
    sync()
    tabB.run('node.update', { ids: ['box'], patch: { y: 600 } })
    sync()

    // A's undo leaves B's later value.
    tabA.undo()
    sync()
    for (const doc of [a, b]) expect(readDesign(doc).nodes.box?.props.y).toBe(600)

    // B's undo puts back the value B replaced, which was A's.
    tabB.undo()
    sync()
    for (const doc of [a, b]) expect(readDesign(doc).nodes.box?.props.y).toBe(400)
  })

  it('undoing an edit that won over a concurrent edit restores the old value instead of leaving it unset', () => {
    // Yjs alone deletes the key here: the old value was overwritten by both tabs, so its undo has nothing to restore.
    for (const [first, second] of [
      ['a', 'b'],
      ['b', 'a'],
    ] as const) {
      const tabs = twoTabs()
      const tab = { a: tabs.tabA, b: tabs.tabB }
      tab[first].run('node.update', { ids: ['box'], patch: { x: 1 } })
      tab[second].run('node.update', { ids: ['box'], patch: { x: 2 } })
      tabs.sync()

      const bValue = first === 'b' ? 1 : 2
      const bWon = readDesign(tabs.a).nodes.box?.props.x === bValue

      tab.a.undo()
      tabs.sync()

      // If b's edit won, a's undo must leave it alone; if a's won, undo goes back to the value before.
      const expected = bWon ? bValue : 100
      expect(readDesign(tabs.a).nodes.box?.props.x).toBe(expected)
      expect(readDesign(tabs.b).nodes.box?.props.x).toBe(expected)

      tab.a.redo()
      tabs.sync()
      expect(readDesign(tabs.a).nodes.box?.props.x).toBeTypeOf('number')
      tab.a.undo()
      tabs.sync()
      expect(readDesign(tabs.a).nodes.box?.props.x).toBeTypeOf('number')
      expect(readDesign(tabs.b)).toEqual(readDesign(tabs.a))
    }
  })

  it('a drag is one undo step, and undoing it leaves the other tab’s edits made during it', () => {
    const { a, b, tabA, tabB, sync } = twoTabs()

    tabA.gesture(() => {
      for (let i = 1; i <= 30; i++) {
        tabA.run('node.update', { ids: ['box'], patch: { x: 100 + i * 10 } })
        if (i % 10 === 0) {
          sync()
          tabB.run('node.update', { ids: ['box'], patch: { y: 100 + i } })
          sync()
        }
      }
    })
    tabA.run('node.update', { ids: ['box'], patch: { width: 50 } })
    sync()

    tabA.undo()
    sync()
    expect(readDesign(a).nodes.box?.props).toMatchObject({ x: 400, width: 200 })
    tabA.undo()
    sync()
    expect(tabA.canUndo()).toBe(false)
    for (const doc of [a, b]) expect(readDesign(doc).nodes.box?.props).toMatchObject({ x: 100, y: 130, width: 200 })
  })

  it('undoing a gesture that won over another tab’s edit restores the value from before the gesture', () => {
    const { a, b, tabA, tabB, sync } = twoTabs()
    tabB.run('node.update', { ids: ['box'], patch: { x: 7 } })
    tabA.gesture(() => {
      tabA.run('node.update', { ids: ['box'], patch: { x: 300 } })
      tabA.run('node.update', { ids: ['box'], patch: { x: 310 } })
    })
    sync()
    // Both tabs set x at once; whichever won, undoing A must not leave x unset.
    tabA.undo()
    sync()
    for (const doc of [a, b]) expect(readDesign(doc).nodes.box?.props.x).toBeTypeOf('number')
  })

  it('undoing a drag that first overrode a layer in a format removes the override whole', () => {
    const { a, b, tabA, sync } = twoTabs()
    tabA.gesture(() => {
      for (let i = 1; i <= 5; i++)
        tabA.run('node.update', { ids: ['box'], scope: 'format:banner', patch: { x: 100 + i, y: 100 + i } })
    })
    sync()
    tabA.undo()
    sync()
    for (const doc of [a, b]) expect(readDesign(doc).overrides['format:banner']?.box).toBeUndefined()
  })

  it('two tabs overriding the same layer in a new format at once keep both changes', () => {
    const { a, b, tabA, tabB, sync } = twoTabs()
    tabA.run('format.add', { id: 'story', name: 'Story', width: 1080, height: 1920 })
    sync()
    tabA.run('node.update', { ids: ['box'], scope: 'format:story', patch: { x: 1 } })
    tabB.run('node.update', { ids: ['box'], scope: 'format:story', patch: { y: 2 } })
    sync()
    // The new format was seeded with the box's whole scaled layout; both tabs' changes land on it.
    for (const doc of [a, b])
      expect(readDesign(doc).overrides['format:story']?.box).toEqual({ x: 1, y: 2, width: 200, height: 100 })
  })

  it('a move in a format another tab removed at once leaves no overrides behind', () => {
    const { a, b, tabA, tabB, sync } = twoTabs()
    tabA.run('format.add', { id: 'story', name: 'Story', width: 1080, height: 1920 })
    sync()
    tabA.run('format.remove', { id: 'story' })
    tabB.run('node.update', { ids: ['box'], scope: 'format:story', patch: { x: 5 } })
    sync()
    for (const [doc, tab] of [
      [a, tabA],
      [b, tabB],
    ] as const) {
      expect(readDesign(doc).formats.story).toBeUndefined()
      expect(readDesign(doc).overrides['format:story']).toBeUndefined()
      expect(tab.design().overrides['format:story']).toBeUndefined()
    }
  })

  it('a layer copied into a format another tab removed at once leaves no overrides behind', () => {
    const { a, b, tabA, tabB, sync } = twoTabs()
    tabA.run('format.add', { id: 'story', name: 'Story', width: 1080, height: 1920 })
    sync()
    tabA.run('format.remove', { id: 'story' })
    const [copy = ''] = tabB.run('node.duplicate', { ids: ['box'] })
    sync()
    for (const [doc, tab] of [
      [a, tabA],
      [b, tabB],
    ] as const) {
      const design = readDesign(doc)
      expect(design.overrides['format:story']).toBeUndefined()
      expect(design.nodes[copy]).toBeDefined()
      expect(tab.design().overrides['format:story']).toBeUndefined()
    }
  })

  it('concurrent moves that would put two groups inside each other are repaired the same way in both tabs', () => {
    const { a, b, tabA, tabB, sync } = twoTabs()
    const group = { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } } as const
    tabA.run('node.create', { id: 'g1', parentId: 'p1', layer: group })
    tabA.run('node.create', { id: 'g2', parentId: 'p1', layer: group })
    sync()

    tabA.run('node.move', { id: 'g1', parentId: 'g2' })
    tabB.run('node.move', { id: 'g2', parentId: 'g1' })
    sync()

    const designA = readDesign(a)
    expect(readDesign(b)).toEqual(designA)
    expect([designA.nodes.g1?.parentId, designA.nodes.g2?.parentId].sort()).toEqual(['g1', 'p1'])
  })

  it.each([1, 7, 42, 2026, 31337])(
    '200 random commands from each tab end in the same valid design on both (seed %i)',
    (seed) => {
      const { a, b, tabA, tabB, sync } = twoTabs()
      const random = seeded(seed)
      for (let i = 0; i < 200; i++) {
        randomCommand(tabA, a, random)
        randomCommand(tabB, b, random)
        if (random() < 0.3) sync()
      }
      sync()
      expect(readDesign(b)).toEqual(readDesign(a))
    },
    FUZZ_TIMEOUT,
  )

  it.each(process.env.MANY_SEEDS ? Array.from({ length: 300 }, (_, i) => i + 1000) : [3, 99, 4242])(
    "each tab's session view equals a full read after every command, sync and repair (seed %i)",
    (seed) => {
      const { a, b, tabA, tabB, sync } = twoTabs()
      const random = seeded(seed)
      for (let i = 0; i < 200; i++) {
        randomCommand(tabA, a, random)
        expectFullRead(tabA, a)
        randomCommand(tabB, b, random)
        expectFullRead(tabB, b)
        if (random() < 0.3) {
          sync()
          expectFullRead(tabA, a)
          expectFullRead(tabB, b)
        }
      }
    },
    FUZZ_TIMEOUT,
  )
})

/** A session's live design equals a full read of its document, layer order under every parent included. */
function expectFullRead(tab: Session, doc: DesignDoc) {
  const full = readDesign(doc)
  const view = tab.design()
  expect(view).toEqual(full)
  const order = (design: Design) =>
    Object.fromEntries(
      [...Object.keys(design.pages), ...Object.keys(design.nodes)].map((id) => [
        id,
        childrenOf(design, id).map(([child]) => child),
      ]),
    )
  expect(order(view)).toEqual(order(full))
}

function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32
}

/** One plausible edit through the tab's commands; refused commands are part of the test too. */
function randomCommand(tab: Session, doc: DesignDoc, random: () => number) {
  const design = readDesign(doc)
  const ids = Object.keys(design.nodes)
  const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)] as T
  const containers = [
    ...Object.keys(design.pages),
    ...ids.filter((id) => ['group', 'frame'].includes(design.nodes[id]?.type ?? '')),
  ]
  const roll = random()
  try {
    if (roll < 0.2 || ids.length === 0) {
      tab.run('node.create', {
        parentId: pick(containers),
        layer:
          random() < 0.3
            ? { type: 'group', name: 'G', props: { x: 0, y: 0, width: 50, height: 50 } }
            : {
                type: 'graphic',
                name: 'R',
                props: { x: random() * 1000, y: random() * 1000, width: 40, height: 40, shape: { kind: 'rect' } },
              },
      })
    } else if (roll < 0.5) {
      tab.run('node.update', {
        ids: [pick(ids)],
        scope: random() < 0.5 ? 'base' : 'format:banner',
        patch: { x: Math.round(random() * 1000) },
      })
    } else if (roll < 0.65) {
      const parentId = pick(containers)
      const under = ids.filter((id) => design.nodes[id]?.parentId === parentId)
      tab.run('node.move', {
        id: pick(ids),
        parentId,
        ...(under.length && random() < 0.5 ? { before: pick(under) } : {}),
      })
    } else if (roll < 0.75) {
      tab.run('node.delete', { ids: [pick(ids)] })
    } else if (roll < 0.9 && design.nodes.headline?.type === 'text') {
      const length = design.nodes.headline.props.text.length
      tab.run(
        'text.edit',
        random() < 0.6 || length < 2
          ? {
              id: 'headline',
              op: { kind: 'insert', at: Math.floor(random() * (length + 1)), text: pick(['a', 'ब', 'ع', '!']) },
            }
          : { id: 'headline', op: { kind: 'delete', at: Math.floor(random() * (length - 1)), length: 1 } },
      )
    } else if (roll < 0.93) {
      if (random() < 0.5) tab.run('page.add', { name: 'P' })
      else tab.run('format.add', { name: 'F', width: 100 + Math.floor(random() * 900), height: 100 })
    } else if (roll < 0.96 && design.nodes.headline?.type === 'text' && design.nodes.headline.props.text.length > 1) {
      tab.run('text.edit', {
        id: 'headline',
        op: { kind: 'style', at: 0, length: 1, style: { fontWeight: pick([400, 700]) } },
      })
    } else if (roll < 0.985) {
      const which = random()
      if (which < 0.4)
        tab.run('node.reorder', {
          ids: [pick(ids), pick(ids)],
          to: pick(['forward', 'backward', 'front', 'back'] as const),
        })
      else if (which < 0.55) tab.run('node.duplicate', { ids: [pick(ids)] })
      else if (which < 0.7) tab.run('node.lock', { ids: [pick(ids)], lock: { move: random() < 0.5 } })
      else if (which < 0.8) {
        const first = pick(ids)
        const siblings = ids.filter((id) => design.nodes[id]?.parentId === design.nodes[first]?.parentId)
        tab.run('node.group', { ids: [first, pick(siblings)] })
      } else if (which < 0.9) tab.run('node.ungroup', { ids: [pick(ids)] })
      else tab.run('node.hug', { ids: [pick(ids)] })
    } else if (random() < 0.5) {
      tab.undo()
    } else {
      tab.redo()
    }
  } catch (e) {
    if (!(e instanceof Error) || e.name !== 'CommandError') throw e
  }
}
