import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { formatScope } from '@dazbee/schema'

import { openSession, readDesign } from '../index.ts'
import { badge, openShapes, testDoc } from '../test-design.ts'

describe('node.create', () => {
  it('adds a layer on top of its siblings, and undo removes it', () => {
    const doc = testDoc()
    const tab = openSession(doc)

    const id = tab.run('node.create', { parentId: 'p1', layer: badge })

    const design = readDesign(doc)
    expect(design.nodes[id]).toMatchObject({ type: 'graphic', parentId: 'p1', name: 'Badge' })
    const siblings = Object.values(design.nodes)
      .filter((n) => n.parentId === 'p1')
      .map((n) => n.index)
    expect(design.nodes[id]?.index).toBe(siblings.sort().at(-1))

    tab.undo()
    expect(readDesign(doc).nodes[id]).toBeUndefined()
  })

  it('rejects invalid input before touching the document', () => {
    const doc = testDoc()
    const before = Y.encodeStateVector(doc)
    const tab = openSession(doc)

    expect(() =>
      tab.run('node.create', { parentId: 'p1', layer: { ...badge, props: { ...badge.props, opacity: 3 } } }),
    ).toThrow(/node.create: layer.props.opacity/)
    expect(() => tab.run('node.create', { parentId: 'nowhere', layer: badge })).toThrow(
      /node.create: parent "nowhere" is neither a page nor a layer/,
    )
    expect(Y.encodeStateVector(doc)).toEqual(before)
  })

  it('refuses the id of a deleted layer, so undoing that delete still works', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    tab.run('node.delete', { ids: ['box'] })
    expect(() => tab.run('node.create', { id: 'box', parentId: 'p1', layer: badge })).toThrow(/id "box" is taken/)
    tab.undo()
    expect(readDesign(doc).nodes.box?.name).toBe('Box')
  })
})

describe('node.update', () => {
  it('sets base properties, or overrides them for one format only', () => {
    const doc = testDoc()
    const tab = openSession(doc)

    tab.run('node.update', { ids: ['box'], patch: { x: 140, opacity: 0.5 } })
    tab.run('node.update', { ids: ['box'], scope: 'format:banner', patch: { x: 8, width: 40 } })

    const design = readDesign(doc)
    expect(design.nodes.box?.props).toMatchObject({ x: 140, opacity: 0.5, width: 200 })
    expect(design.overrides['format:banner']?.box).toEqual({ x: 8, width: 40 })
  })

  it('refuses a patch that would make the layer invalid', () => {
    const tab = openSession(testDoc())
    expect(() => tab.run('node.update', { ids: ['box'], patch: { opacity: 2 } })).toThrow(/node.update: box.opacity/)
    expect(() => tab.run('node.update', { ids: ['box'], patch: { text: 'x' } })).toThrow(
      /node.update: a graphic has no property "text"/,
    )
  })

  it("keeps preset shapes' parameters, per format too", () => {
    const { doc, tab } = openShapes()
    tab.run('node.update', { ids: ['c'], patch: { shape: { kind: 'polygon', sides: 8, cornerRadius: 12 } } })
    tab.run('node.update', {
      ids: ['a'],
      scope: 'format:wide',
      patch: { shape: { kind: 'rect', corners: [40, 0, 40, 0] } },
    })
    tab.run('node.create', {
      parentId: 'p1',
      layer: {
        type: 'graphic',
        name: 'Arrow',
        props: {
          x: 0,
          y: 500,
          width: 300,
          height: 0,
          rotation: 30,
          shape: { kind: 'line', end: 'arrow' },
          strokes: [{ paint: { type: 'solid', color: '#000000FF' }, width: 4 }],
        },
      },
    })
    const d = readDesign(doc)
    expect(d.nodes.c?.props).toHaveProperty('shape', { kind: 'polygon', sides: 8, cornerRadius: 12 })
    expect(d.overrides['format:wide']?.a?.shape).toEqual({ kind: 'rect', cornerRadius: 0, corners: [40, 0, 40, 0] })
    expect(Object.values(d.nodes).find((n) => n.name === 'Arrow')?.props).toMatchObject({
      height: 0,
      shape: { kind: 'line', start: 'none', end: 'arrow' },
    })
    expect(() => tab.run('node.update', { ids: ['c'], patch: { shape: { kind: 'polygon', sides: 2 } } })).toThrow(
      /c.shape.sides/,
    )
    expect(() => tab.run('node.update', { ids: ['b'], patch: { shape: { kind: 'star', innerRadius: 1.5 } } })).toThrow(
      /b.shape.innerRadius/,
    )
  })
})

describe('override.reset', () => {
  it('puts layers back to the base in one format, and undo brings the overrides back', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    tab.run('node.update', { ids: ['box'], scope: 'format:banner', patch: { x: 8, y: 4, width: 40 } })

    tab.run('override.reset', { ids: ['box'], scope: 'format:banner', paths: ['x', 'y'] })
    expect(readDesign(doc).overrides['format:banner']?.box).toEqual({ width: 40 })

    tab.run('override.reset', { ids: ['box'], scope: 'format:banner' })
    const design = readDesign(doc)
    expect(design.overrides['format:banner']?.box).toBeUndefined()
    expect(design.nodes.box?.props).toMatchObject({ x: 100, width: 200 })

    tab.undo()
    expect(readDesign(doc).overrides['format:banner']?.box).toEqual({ width: 40 })
    expect(() => tab.run('override.reset', { ids: ['box'], scope: 'format:nope' })).toThrow(/no format "nope"/)
    expect(() => tab.run('override.reset', { ids: ['gone'], scope: 'format:banner' })).toThrow(/no layer "gone"/)
  })
})

describe('node.visibleEverywhere', () => {
  const visibleIn = (doc: Y.Doc, id: string) => {
    const design = readDesign(doc)
    return Object.keys(design.formats).map(
      (f) => (design.overrides[formatScope(f)]?.[id]?.visible ?? design.nodes[id]?.props.visible) !== false,
    )
  }

  it('hides a layer in every format, then shows it, one undo step each, and leaves its other own values', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    // Hidden in the banner only, with a place of its own there.
    tab.run('node.update', { ids: ['box'], scope: 'format:banner', patch: { visible: false, x: 4 } })
    expect(visibleIn(doc, 'box')).toEqual([true, false])

    tab.run('node.visibleEverywhere', { ids: ['box', 'headline'], visible: false })
    expect(visibleIn(doc, 'box')).toEqual([false, false])
    expect(visibleIn(doc, 'headline')).toEqual([false, false])
    expect(readDesign(doc).overrides['format:banner']?.box).toEqual({ x: 4 })
    expect(readDesign(doc).overrides['format:banner']?.headline).toMatchObject({ text: 'Sale' })

    tab.run('node.visibleEverywhere', { ids: ['box'], visible: true })
    expect(visibleIn(doc, 'box')).toEqual([true, true])

    tab.undo()
    expect(visibleIn(doc, 'box')).toEqual([false, false])
    tab.undo()
    expect(visibleIn(doc, 'box')).toEqual([true, false])
    expect(visibleIn(doc, 'headline')).toEqual([true, true])
  })

  it('refuses a layer it does not know', () => {
    const tab = openSession(testDoc())
    expect(() => tab.run('node.visibleEverywhere', { ids: ['nope'], visible: false })).toThrow(/no layer "nope"/)
  })
})

describe('node.delete', () => {
  it('removes layers, their children and their overrides', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    const group = tab.run('node.create', {
      parentId: 'p1',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } },
    })
    tab.run('node.move', { id: 'headline', parentId: group })

    tab.run('node.delete', { ids: [group] })

    const design = readDesign(doc)
    expect(Object.keys(design.nodes)).toEqual(['box'])
    expect(design.overrides['format:banner']).toEqual({})

    tab.undo()
    expect(readDesign(doc).nodes.headline?.parentId).toBe(group)
  })

  it("a group with a delete-locked layer inside can't be deleted", () => {
    const doc = testDoc()
    const tab = openSession(doc)
    tab.run('node.create', {
      id: 'g',
      parentId: 'p1',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } },
    })
    tab.run('node.create', { id: 'dot', parentId: 'g', layer: badge })
    tab.run('node.lock', { ids: ['dot'], lock: { delete: true } })
    expect(() => tab.run('node.delete', { ids: ['g'] })).toThrow(/"dot" is locked \(delete\)/)
    expect(readDesign(doc).nodes.g).toBeDefined()
  })
})

describe('node.rename', () => {
  it('renames a layer in one undo step, locked or not, and refuses an empty name (#59)', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    tab.run('node.lock', { ids: ['box'], lock: { move: true, resize: true, content: true, style: true, delete: true } })
    tab.run('node.rename', { id: 'box', name: '  Hero card ' })
    expect(readDesign(doc).nodes.box?.name).toBe('Hero card')
    tab.undo()
    expect(readDesign(doc).nodes.box?.name).not.toBe('Hero card')
    expect(() => tab.run('node.rename', { id: 'box', name: '   ' })).toThrow()
    expect(() => tab.run('node.rename', { id: 'nope', name: 'X' })).toThrow(/no layer "nope"/)
  })
})

describe('node.lock', () => {
  it('sets flags one by one, and clearing them all drops the field', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    tab.run('node.lock', { ids: ['box'], lock: { move: true } })
    expect(readDesign(doc).nodes.box?.lock).toEqual({
      move: true,
      resize: false,
      content: false,
      style: false,
      delete: false,
    })
    tab.run('node.lock', { ids: ['box'], lock: { delete: true } })
    expect(readDesign(doc).nodes.box?.lock).toMatchObject({ move: true, delete: true })
    tab.run('node.lock', { ids: ['box'], lock: { move: false, delete: false } })
    expect(readDesign(doc).nodes.box).not.toHaveProperty('lock')
    tab.undo()
    expect(readDesign(doc).nodes.box?.lock).toMatchObject({ move: true, delete: true })
  })

  it('each flag refuses only its own changes, in the base and in every format', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    const all = { move: true, resize: true, content: true, style: true, delete: true }
    tab.run('node.lock', { ids: ['box', 'headline'], lock: { move: true } })
    expect(() => tab.run('node.update', { ids: ['box'], patch: { x: 1 } })).toThrow(/"box" is locked \(move\)/)
    expect(() => tab.run('node.update', { ids: ['box'], scope: 'format:banner', patch: { y: 1 } })).toThrow(
      /locked \(move\)/,
    )
    tab.run('node.update', { ids: ['box'], patch: { width: 50, opacity: 0.5 } })
    tab.run('node.update', { ids: ['box'], scope: 'format:banner', patch: { visible: false } })

    tab.run('node.lock', { ids: ['box', 'headline'], lock: all })
    expect(() => tab.run('node.update', { ids: ['box'], patch: { rotation: 15 } })).toThrow(/locked \(resize\)/)
    expect(() => tab.run('node.update', { ids: ['box'], patch: { opacity: 1 } })).toThrow(/locked \(style\)/)
    expect(() => tab.run('text.edit', { id: 'headline', op: { kind: 'insert', at: 0, text: 'Big ' } })).toThrow(
      /locked \(content\)/,
    )
    expect(() =>
      tab.run('text.edit', { id: 'headline', op: { kind: 'style', at: 0, length: 3, style: { fontWeight: 700 } } }),
    ).toThrow(/locked \(style\)/)
    expect(() => tab.run('node.delete', { ids: ['box'] })).toThrow(/locked \(delete\)/)
    // Hiding is not locked, z-order and copies aren't either.
    tab.run('node.update', { ids: ['box'], patch: { visible: false } })
    tab.run('node.reorder', { ids: ['box'], to: 'front' })
    tab.run('node.duplicate', { ids: ['box'] })
    expect(readDesign(doc).nodes.box?.props).toMatchObject({ width: 50, opacity: 0.5, visible: false })
  })
})

describe('node.bind', () => {
  it('binds a fill, text colour and font to brand tokens and unbinds them, each one undo step (#53)', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    tab.run('node.bind', { ids: ['box'], target: 'fill', ref: 'brand:primary', value: '#E0262BFF' })
    let design = readDesign(doc)
    expect(design.nodes.box?.bindings).toEqual({ fill: 'brand:primary' })
    // The token's value is stored too, for drawing without the brand kit.
    expect(design.nodes.box?.type === 'graphic' && design.nodes.box.props.fills.at(-1)).toMatchObject({
      type: 'solid',
      color: '#E0262BFF',
    })
    tab.run('node.bind', { ids: ['headline'], target: 'fontFamily', ref: 'brand:heading', value: 'Playfair Display' })
    tab.run('node.bind', { ids: ['headline'], target: 'textColor', ref: 'brand:primary', value: '#E0262BFF' })
    design = readDesign(doc)
    expect(design.nodes.headline?.bindings).toEqual({ fontFamily: 'brand:heading', textColor: 'brand:primary' })
    expect(design.nodes.headline?.type === 'text' && design.nodes.headline.props.style).toMatchObject({
      fontFamily: 'Playfair Display',
      color: '#E0262BFF',
    })
    // Unbinding keeps the value; the last binding gone, the key goes.
    tab.run('node.bind', { ids: ['box'], target: 'fill', ref: null })
    design = readDesign(doc)
    expect(design.nodes.box).not.toHaveProperty('bindings')
    expect(design.nodes.box?.type === 'graphic' && design.nodes.box.props.fills.at(-1)).toMatchObject({
      color: '#E0262BFF',
    })
    tab.undo()
    expect(readDesign(doc).nodes.box?.bindings).toEqual({ fill: 'brand:primary' })
    tab.undo()
    tab.undo()
    expect(readDesign(doc).nodes.headline).not.toHaveProperty('bindings')
    // A text layer has no fill, a binding needs the value, and a locked style can't be bound.
    expect(() =>
      tab.run('node.bind', { ids: ['headline'], target: 'fill', ref: 'brand:primary', value: '#E0262BFF' }),
    ).toThrow(/a text has no fill/)
    expect(() => tab.run('node.bind', { ids: ['box'], target: 'fill', ref: 'brand:primary' })).toThrow(
      /needs the value/,
    )
    expect(() => tab.run('node.bind', { ids: ['box'], target: 'fill', ref: 'brand:primary', value: 'red' })).toThrow(
      /#RRGGBBAA/,
    )
    tab.run('node.lock', { ids: ['box'], lock: { style: true } })
    expect(() => tab.run('node.bind', { ids: ['box'], target: 'fill', ref: null })).toThrow(/locked \(style\)/)
  })
})

describe('node.mask', () => {
  it('makes layers masks in every format and plain again, each one undo step', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    // A stray format override of the flag goes when the base one is set.
    tab.run('node.update', { ids: ['box'], scope: 'format:banner', patch: { mask: 'luminance' } })
    tab.run('node.mask', { ids: ['box'], mask: 'alpha' })
    let design = readDesign(doc)
    expect(design.nodes.box?.props.mask).toBe('alpha')
    expect(design.overrides['format:banner']?.box).toBeUndefined()
    tab.run('node.mask', { ids: ['box'], mask: null })
    design = readDesign(doc)
    expect(design.nodes.box?.props).not.toHaveProperty('mask')
    tab.undo()
    expect(readDesign(doc).nodes.box?.props.mask).toBe('alpha')
    tab.run('node.lock', { ids: ['box'], lock: { style: true } })
    expect(() => tab.run('node.mask', { ids: ['box'], mask: null })).toThrow(/locked \(style\)/)
  })
})
