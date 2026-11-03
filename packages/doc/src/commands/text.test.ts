import { describe, expect, it } from 'vitest'

import { parseDesign } from '@dazbee/schema'

import { loadDesign, openSession, readDesign } from '../index.ts'
import { testDesign, testDoc } from '../test-design.ts'

describe('text.edit', () => {
  it('inserts, deletes and styles ranges of a text layer', () => {
    const doc = testDoc()
    const tab = openSession(doc)

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

    expect(() => tab.run('text.edit', { id: 'box', op: { kind: 'delete', at: 0, length: 1 } })).toThrow(
      /"box" is a graphic, not a text layer/,
    )
    expect(() => tab.run('text.edit', { id: 'headline', op: { kind: 'delete', at: 3, length: 9 } })).toThrow(
      /runs past the end/,
    )
  })

  it("keeps a format's own runs on their characters as text is typed and deleted, and leaves a format with its own text be", () => {
    const result = parseDesign({
      ...testDesign(),
      overrides: {
        // The square's own runs: "Summer" bigger, "sale" in pink.
        'format:sq': {
          headline: {
            runs: [
              { start: 0, end: 6, style: { fontSize: 120 } },
              { start: 7, end: 11, style: { color: '#FF3D6EFF' } },
            ],
          },
        },
        'format:banner': { headline: { text: 'Sale', runs: [{ start: 0, end: 4, style: { fontWeight: 800 } }] } },
      },
    })
    if (!result.success) throw new Error(result.errors.join('\n'))
    const doc = loadDesign(result.design)
    const tab = openSession(doc)
    const own = () => readDesign(doc).overrides['format:sq']?.headline?.runs
    // Before every run: both move along.
    tab.run('text.edit', { id: 'headline', op: { kind: 'insert', at: 0, text: 'Hot ' } })
    expect(own()).toEqual([
      { start: 4, end: 10, style: { fontSize: 120 } },
      { start: 11, end: 15, style: { color: '#FF3D6EFF' } },
    ])
    // Inside a run, and at its end, as the text takes the character before's style: it grows.
    tab.run('text.edit', { id: 'headline', op: { kind: 'insert', at: 7, text: 'mmm' } })
    tab.run('text.edit', { id: 'headline', op: { kind: 'insert', at: 18, text: '!' } })
    expect(readDesign(doc).nodes.headline?.props).toMatchObject({ text: 'Hot Summmmmer sale!' })
    expect(own()).toEqual([
      { start: 4, end: 13, style: { fontSize: 120 } },
      { start: 14, end: 19, style: { color: '#FF3D6EFF' } },
    ])
    // A delete across a run's edge trims it; one across a whole run removes it.
    tab.run('text.edit', { id: 'headline', op: { kind: 'delete', at: 10, length: 5 } })
    expect(own()).toEqual([
      { start: 4, end: 10, style: { fontSize: 120 } },
      { start: 10, end: 14, style: { color: '#FF3D6EFF' } },
    ])
    tab.run('text.edit', { id: 'headline', op: { kind: 'delete', at: 9, length: 5 } })
    expect(own()).toEqual([{ start: 4, end: 9, style: { fontSize: 120 } }])
    // The banner's own text has its own runs, which the base's typing never moves.
    expect(readDesign(doc).overrides['format:banner']?.headline?.runs).toEqual([
      { start: 0, end: 4, style: { fontWeight: 800 } },
    ])
    // Each edit is one undo step, its runs with it.
    tab.undo()
    expect(own()).toEqual([
      { start: 4, end: 10, style: { fontSize: 120 } },
      { start: 10, end: 14, style: { color: '#FF3D6EFF' } },
    ])
  })
})

describe('text.fit', () => {
  it('sizes a text box in each format, base from the primary, one undo step', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    tab.run('text.fit', {
      id: 'headline',
      sizes: { sq: { width: 300, height: 90 }, banner: { width: 120, height: 40 } },
    })
    const d = readDesign(doc)
    expect(d.nodes.headline?.props).toMatchObject({ width: 300, height: 90 })
    expect(d.overrides['format:banner']?.headline).toMatchObject({ width: 120, height: 40 })
    expect(d.overrides['format:sq']?.headline).toBeUndefined()
    tab.undo()
    expect(readDesign(doc).nodes.headline?.props).not.toMatchObject({ width: 300, height: 90 })
    expect(() => tab.run('text.fit', { id: 'box', sizes: {} })).toThrow(/"box" is a graphic, not a text layer/)
    expect(() => tab.run('text.fit', { id: 'headline', sizes: { story: { width: 1, height: 1 } } })).toThrow(
      /no format "story"/,
    )
  })
})
