import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { readDesign } from '../index.ts'
import { badge, openShapes, openTestSession, testDoc } from '../test-design.ts'

/** The box's and headline's linked copies in the banner, as they are now. */
const copies = (doc: Y.Doc) => {
  const design = readDesign(doc)
  return { box: design.nodes['banner-box'], headline: design.nodes['banner-headline'] }
}

describe('node.create', () => {
  it('adds a layer on top of its siblings with a link id of its own, and undo removes it', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)

    const id = tab.run('node.create', { parentId: 'sq', layer: badge })

    const design = readDesign(doc)
    expect(design.nodes[id]).toMatchObject({ type: 'graphic', parentId: 'sq', name: 'Badge' })
    const siblings = Object.values(design.nodes)
      .filter((n) => n.parentId === 'sq')
      .map((n) => n.index)
    expect(design.nodes[id]?.index).toBe(siblings.sort().at(-1))
    const link = design.nodes[id]?.link
    expect(Object.values(design.nodes).filter((n) => n.link === link)).toHaveLength(1)

    tab.undo()
    expect(readDesign(doc).nodes[id]).toBeUndefined()
  })

  it('gives each layer it adds a new link id, in any frame', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const a = tab.run('node.create', { parentId: 'sq', layer: badge })
    const b = tab.run('node.create', { parentId: 'banner', layer: badge })
    const design = readDesign(doc)
    expect(design.nodes[a]?.link).not.toBe(design.nodes[b]?.link)
    expect(['box', 'headline']).not.toContain(design.nodes[a]?.link)
  })

  it('rejects invalid input before touching the document', () => {
    const doc = testDoc()
    const before = Y.encodeStateVector(doc)
    const tab = openTestSession(doc)

    expect(() =>
      tab.run('node.create', { parentId: 'sq', layer: { ...badge, props: { ...badge.props, opacity: 3 } } }),
    ).toThrow(/node.create: layer.props.opacity/)
    expect(() => tab.run('node.create', { parentId: 'nowhere', layer: badge })).toThrow(
      /node.create: parent "nowhere" is neither a frame nor a layer/,
    )
    expect(() => tab.run('node.create', { parentId: 'p1', layer: badge })).toThrow(
      /node.create: parent "p1" is neither a frame nor a layer/,
    )
    expect(() => tab.run('node.create', { id: 'banner', parentId: 'sq', layer: badge })).toThrow(/id "banner" is taken/)
    expect(Y.encodeStateVector(doc)).toEqual(before)
  })

  it('refuses the id of a deleted layer, so undoing that delete still works', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    tab.run('node.delete', { ids: ['box'] })
    expect(() => tab.run('node.create', { id: 'box', parentId: 'sq', layer: badge })).toThrow(/id "box" is taken/)
    tab.undo()
    expect(readDesign(doc).nodes.box?.name).toBe('Box')
  })
})

describe('node.update', () => {
  it('sets properties of the layers given; their linked copies stay as they were', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const before = copies(doc)

    tab.run('node.update', { ids: ['box'], patch: { x: 140, opacity: 0.5 } })
    tab.run('node.update', { ids: ['banner-headline'], patch: { x: 8, width: 40 } })

    const design = readDesign(doc)
    expect(design.nodes.box?.props).toMatchObject({ x: 140, opacity: 0.5, width: 200 })
    expect(design.nodes['banner-headline']?.props).toMatchObject({ x: 8, width: 40 })
    expect(design.nodes.headline?.props).toMatchObject({ x: 60, width: 960 })
    expect(copies(doc).box).toEqual(before.box)
  })

  it('refuses a patch that would make the layer invalid, and text, which text.edit changes', () => {
    const tab = openTestSession(testDoc())
    expect(() => tab.run('node.update', { ids: ['box'], patch: { opacity: 2 } })).toThrow(/node.update: box.opacity/)
    expect(() => tab.run('node.update', { ids: ['box'], patch: { text: 'x' } })).toThrow(
      /node.update: a graphic has no property "text"/,
    )
    expect(() => tab.run('node.update', { ids: ['headline'], patch: { text: 'x' } })).toThrow(
      /change text with text.edit/,
    )
  })

  it("keeps preset shapes' parameters, in each copy on its own", () => {
    const { doc, tab } = openShapes()
    tab.run('node.update', { ids: ['c'], patch: { shape: { kind: 'polygon', sides: 8, cornerRadius: 12 } } })
    tab.run('node.update', { ids: ['wide-a'], patch: { shape: { kind: 'rect', corners: [40, 0, 40, 0] } } })
    tab.run('node.create', {
      parentId: 'sq',
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
    expect(d.nodes['wide-c']?.props).toHaveProperty('shape', { kind: 'polygon', sides: 3, cornerRadius: 0 })
    expect(d.nodes['wide-a']?.props).toHaveProperty('shape', { kind: 'rect', cornerRadius: 0, corners: [40, 0, 40, 0] })
    expect(d.nodes.a?.props).toHaveProperty('shape', { kind: 'rect', cornerRadius: 0, corners: [0, 10, 20, 30] })
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

describe('node.delete', () => {
  it('removes layers and their children; their linked copies stay', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const group = tab.run('node.create', {
      parentId: 'sq',
      layer: { type: 'group', name: 'G', props: { x: 0, y: 0, width: 10, height: 10 } },
    })
    tab.run('node.move', { id: 'headline', parentId: group })
    const before = copies(doc)

    tab.run('node.delete', { ids: [group] })

    const design = readDesign(doc)
    expect(Object.keys(design.nodes).sort()).toEqual(['banner-box', 'banner-headline', 'box'])
    expect(copies(doc)).toEqual(before)

    tab.undo()
    expect(readDesign(doc).nodes.headline?.parentId).toBe(group)
  })

  it("a group with a delete-locked layer inside can't be deleted", () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    tab.run('node.create', {
      id: 'g',
      parentId: 'sq',
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
    const tab = openTestSession(doc)
    tab.run('node.lock', { ids: ['box'], lock: { move: true, resize: true, content: true, style: true, delete: true } })
    tab.run('node.rename', { id: 'box', name: '  Hero card ' })
    expect(readDesign(doc).nodes.box?.name).toBe('Hero card')
    expect(readDesign(doc).nodes['banner-box']?.name).toBe('Box')
    tab.undo()
    expect(readDesign(doc).nodes.box?.name).not.toBe('Hero card')
    expect(() => tab.run('node.rename', { id: 'box', name: '   ' })).toThrow()
    expect(() => tab.run('node.rename', { id: 'nope', name: 'X' })).toThrow(/no layer "nope"/)
  })
})

describe('node.lock', () => {
  it('sets flags one by one, and clearing them all drops the field', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
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

  it("each flag refuses only its own changes, on the layer locked: its linked copy isn't locked", () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const all = { move: true, resize: true, content: true, style: true, delete: true }
    tab.run('node.lock', { ids: ['box', 'headline'], lock: { move: true } })
    expect(() => tab.run('node.update', { ids: ['box'], patch: { x: 1 } })).toThrow(/"box" is locked \(move\)/)
    tab.run('node.update', { ids: ['banner-box'], patch: { y: 1 } })
    tab.run('node.update', { ids: ['box'], patch: { width: 50, opacity: 0.5 } })

    tab.run('node.lock', { ids: ['box', 'headline'], lock: all })
    expect(readDesign(doc).nodes['banner-box']).not.toHaveProperty('lock')
    expect(() => tab.run('node.update', { ids: ['box'], patch: { rotation: 15 } })).toThrow(/locked \(resize\)/)
    expect(() => tab.run('node.update', { ids: ['box'], patch: { opacity: 1 } })).toThrow(/locked \(style\)/)
    expect(() => tab.run('text.edit', { id: 'headline', op: { kind: 'insert', at: 0, text: 'Big ' } })).toThrow(
      /locked \(content\)/,
    )
    expect(() =>
      tab.run('text.edit', { id: 'headline', op: { kind: 'style', at: 0, length: 3, style: { fontWeight: 700 } } }),
    ).toThrow(/locked \(style\)/)
    expect(() => tab.run('node.delete', { ids: ['box'] })).toThrow(/locked \(delete\)/)
    tab.run('text.edit', { id: 'banner-headline', op: { kind: 'insert', at: 0, text: 'Big ' } })
    // Hiding is not locked, z-order and copies aren't either.
    tab.run('node.update', { ids: ['box'], patch: { visible: false } })
    tab.run('node.reorder', { ids: ['box'], to: 'front' })
    tab.run('node.duplicate', { ids: ['box'] })
    expect(readDesign(doc).nodes.box?.props).toMatchObject({ width: 50, opacity: 0.5, visible: false })
    expect(readDesign(doc).nodes['banner-box']?.props).toMatchObject({ y: 1, width: 200, visible: true })
  })
})

describe('node.bind', () => {
  it('binds a fill, text colour and font to brand tokens and unbinds them, each one undo step (#53)', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const before = copies(doc)
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
    expect(copies(doc)).toEqual(before)
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
  it('makes layers masks and plain again, each one undo step; their linked copies stay as they were', () => {
    const doc = testDoc()
    const tab = openTestSession(doc)
    const before = copies(doc)
    tab.run('node.mask', { ids: ['box'], mask: 'alpha' })
    let design = readDesign(doc)
    expect(design.nodes.box?.props.mask).toBe('alpha')
    expect(copies(doc)).toEqual(before)
    tab.run('node.mask', { ids: ['box'], mask: null })
    design = readDesign(doc)
    expect(design.nodes.box?.props).not.toHaveProperty('mask')
    tab.undo()
    expect(readDesign(doc).nodes.box?.props.mask).toBe('alpha')
    tab.run('node.lock', { ids: ['box'], lock: { style: true } })
    expect(() => tab.run('node.mask', { ids: ['box'], mask: null })).toThrow(/locked \(style\)/)
  })
})
