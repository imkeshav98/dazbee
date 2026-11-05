import { describe, expect, it } from 'vitest'

import { readDesign } from '../index.ts'
import { openTestSession, testDoc } from '../test-design.ts'

describe('text.edit', () => {
  it('inserts, deletes and styles ranges of a text layer; its linked copy keeps its own text', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const copy = readDesign(doc).nodes['banner-headline']

    tab.run('text.edit', { id: 'headline', op: { kind: 'insert', at: 11, text: '!' } })
    tab.run('text.edit', { id: 'headline', op: { kind: 'delete', at: 0, length: 7 } })
    tab.run('text.edit', { id: 'headline', op: { kind: 'style', at: 0, length: 4, style: { color: '#FF0000FF' } } })

    const text = readDesign(doc).nodes.headline
    if (text?.type !== 'text') throw new Error('not text')
    expect(text.props.text).toBe('sale!')
    // Typed text takes the style of the character before it, as in any editor.
    expect(text.props.runs).toEqual([
      { start: 0, end: 4, style: { fontWeight: 800, color: '#FF0000FF' } },
      { start: 4, end: 5, style: { fontWeight: 800 } },
    ])
    expect(readDesign(doc).nodes['banner-headline']).toEqual(copy)

    expect(() => tab.run('text.edit', { id: 'box', op: { kind: 'delete', at: 0, length: 1 } })).toThrow(
      /"box" is a graphic, not a text layer/,
    )
    expect(() => tab.run('text.edit', { id: 'headline', op: { kind: 'delete', at: 3, length: 9 } })).toThrow(
      /runs past the end/,
    )
  })

  it('edits a linked copy on its own, and each edit is one undo step', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    tab.run('text.edit', { id: 'banner-headline', op: { kind: 'insert', at: 4, text: '!' } })
    expect(readDesign(doc).nodes['banner-headline']?.props).toMatchObject({ text: 'Sale!' })
    expect(readDesign(doc).nodes.headline?.props).toMatchObject({ text: 'Summer sale' })
    tab.undo()
    expect(readDesign(doc).nodes['banner-headline']?.props).toMatchObject({ text: 'Sale' })
  })
})

describe('text.fit', () => {
  it('sizes a text box, rounded, in one undo step; its linked copy stays as it was', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const copy = readDesign(doc).nodes['banner-headline']
    tab.run('text.fit', { id: 'headline', width: 300.004, height: 90.456 })
    expect(readDesign(doc).nodes.headline?.props).toMatchObject({ width: 300, height: 90.46 })
    expect(readDesign(doc).nodes['banner-headline']).toEqual(copy)
    tab.undo()
    expect(readDesign(doc).nodes.headline?.props).toMatchObject({ width: 960, height: 100 })
    expect(() => tab.run('text.fit', { id: 'box', width: 1, height: 1 })).toThrow(
      /"box" is a graphic, not a text layer/,
    )
    expect(() => tab.run('text.fit', { id: 'headline', width: -1, height: 1 })).toThrow(/width/)
  })

  it('writes nothing when the box already fits', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    tab.run('text.fit', { id: 'headline', width: 960, height: 100.001 })
    expect(tab.canUndo()).toBe(false)
  })
})
