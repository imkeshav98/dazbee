import { describe, expect, it } from 'vitest'

import { type Design, frameIdOf } from '@dazbee/schema'

import { childrenOf, descendants } from '../children.ts'
import { readDesign } from '../design-doc.ts'
import { copyIn } from '../links.ts'
import { linkedDesign, openTestSession, testDoc } from '../test-design.ts'
import { fitted } from './fit.ts'

const square = { width: 1080, height: 1080 }

function open() {
  const doc = testDoc(linkedDesign())
  return { doc, tab: openTestSession(doc) }
}

/** The ids under a frame or layer, back to front. */
const kids = (design: Design, parentId: string) => childrenOf(design, parentId).map(([id]) => id)
/** How many layers a frame holds with a link id. */
const held = (design: Design, frameId: string, link: string) =>
  descendants(design, frameId).filter((id) => design.nodes[id]?.link === link).length

describe('node.copyToFrames', () => {
  it('copies a layer into every linked frame that has no copy of it, laid out to fit, on top, in one undo step', () => {
    const { doc, tab } = open()
    const before = readDesign(doc)

    const copies = tab.run('node.copyToFrames', { ids: ['badge'] })

    const design = readDesign(doc)
    expect(copies.map((id) => frameIdOf(design, id))).toEqual(['story', 'wide', 'tall'])
    const badge = before.nodes.badge?.props as { x: number; y: number; width: number; height: number }
    for (const [i, frameId] of (['story', 'wide', 'tall'] as const).entries()) {
      const copy = design.nodes[copies[i] as string]
      expect(copy).toMatchObject({ link: 'badge', parentId: frameId, name: 'badge' })
      const to = design.frames[frameId] as { width: number; height: number }
      expect(copy?.props).toMatchObject(fitted(badge, badge, { from: square, to }))
      expect(kids(design, frameId).at(-1)).toBe(copies[i])
    }
    expect(copyIn(design, 'other', 'badge')).toBeUndefined()

    tab.undo()
    expect(Object.keys(readDesign(doc).nodes).sort()).toEqual(Object.keys(before.nodes).sort())
    tab.redo()
    expect(copyIn(readDesign(doc), 'tall', 'badge')).toBeDefined()
  })

  it('puts a copy inside the copy of its parent where the frame has one, laid out to fit it, else at the frame’s top', () => {
    const { doc, tab } = open()

    const [inStory, inTall] = tab.run('node.copyToFrames', { ids: ['price'] })

    const design = readDesign(doc)
    // The story's group copy is 600 × 100 at 100, 400; the square's group is 600 × 300 at 100, 100.
    expect(design.nodes[inStory as string]).toMatchObject({
      parentId: 'story-grp',
      link: 'price',
      props: { x: 166.67, y: 466.67, width: 66.67, height: 33.33, style: { fontSize: 20 } },
    })
    expect(kids(design, 'story-grp')).toEqual(['story-title', inStory])
    // The tall frame has no copy of the group: the price goes on top of its frame, laid out to fit it.
    expect(design.nodes[inTall as string]).toMatchObject({
      parentId: 'tall',
      props: { x: 27.78, y: 180.56, width: 55.56, height: 27.78, style: { fontSize: 16.67 } },
    })
    expect(kids(design, 'tall')).toEqual(['tall-bg', inTall])
  })

  it('makes a group copied in take in the frame’s own copies of its children, copying the ones it lacks', () => {
    const { doc, tab } = open()

    const [inWide, inTall] = tab.run('node.copyToFrames', { ids: ['grp'] })

    const design = readDesign(doc)
    expect(design.nodes[inWide as string]).toMatchObject({ type: 'group', link: 'grp', parentId: 'wide' })
    // The wide frame's own title and price move into the copy, as they are, in the group's order.
    expect(kids(design, inWide as string)).toEqual(['wide-title', 'wide-price'])
    expect(design.nodes['wide-title']?.props).toMatchObject({ x: 40, y: 40, style: { fontSize: 40 } })
    expect(held(design, 'wide', 'title')).toBe(1)
    expect(kids(design, 'wide')).toEqual(['wide-bg', inWide])
    // The tall frame had neither: both are copied in, inside the copy, laid out to fit.
    const tallKids = kids(design, inTall as string)
    expect(tallKids.map((id) => design.nodes[id]?.link)).toEqual(['title', 'price'])
    expect(tallKids).not.toContain('title')

    tab.undo()
    const undone = readDesign(doc)
    expect(undone.nodes['wide-title']?.parentId).toBe('wide')
    expect(kids(undone, 'wide')).toEqual(['wide-bg', 'wide-title', 'wide-price'])
  })

  it('puts a copy under the copy of the nearest layer above it in its own frame', () => {
    const { doc, tab } = open()
    const [, badgeInWide] = tab.run('node.copyToFrames', { ids: ['badge'] })

    const [groupInWide] = tab.run('node.copyToFrames', { ids: ['grp'] })

    expect(kids(readDesign(doc), 'wide')).toEqual(['wide-bg', groupInWide, badgeInWide])
  })

  it('copies several layers at once, a layer inside another coming along with it where that one goes', () => {
    const { doc, tab } = open()

    const copies = tab.run('node.copyToFrames', { ids: ['badge', 'price', 'grp'] })

    const design = readDesign(doc)
    // The group goes into the wide and tall frames with its price; the story has the group, so the price goes into it.
    expect(copies.map((id) => design.nodes[id]?.link)).toEqual(['badge', 'badge', 'badge', 'grp', 'grp', 'price'])
    expect(design.nodes[copies[5] as string]?.parentId).toBe('story-grp')
    for (const frameId of ['story', 'wide', 'tall']) {
      for (const link of ['badge', 'grp', 'title', 'price']) expect(held(design, frameId, link)).toBe(1)
    }
  })

  it('refuses when every linked frame has a copy already, or the frame has none linked', () => {
    const { tab } = open()
    expect(() => tab.run('node.copyToFrames', { ids: ['bg'] })).toThrow(/no linked frame lacks/)
    expect(() => tab.run('node.copyToFrames', { ids: ['other-x'] })).toThrow(/no linked frame lacks/)
    expect(() => tab.run('node.copyToFrames', { ids: ['nope'] })).toThrow(/no layer/)
  })
})
