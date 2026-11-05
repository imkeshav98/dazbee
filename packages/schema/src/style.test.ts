import { describe, expect, it } from 'vitest'

import { Layer } from './layers.ts'
import { LayerStyle, restyle, styleOf } from './style.ts'

const red = '#E0262BFF'
const navy = '#14213DFF'

const graphic = (props: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  Layer.parse({
    type: 'graphic',
    parentId: 'f',
    link: 'g',
    index: 'a0',
    name: 'Shape',
    ...extra,
    props: {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 15,
      shape: { kind: 'rect', cornerRadius: 8 },
      fills: [{ type: 'solid', color: red }],
      strokes: [{ paint: { type: 'solid', color: navy }, width: 2 }],
      effects: [{ type: 'layerBlur', radius: 4 }],
      opacity: 0.5,
      blendMode: 'multiply',
      ...props,
    },
  })

const text = (style: Record<string, unknown> = {}, props: Record<string, unknown> = {}, extra = {}) =>
  Layer.parse({
    type: 'text',
    parentId: 'f',
    link: 't',
    index: 'a1',
    name: 'Text',
    ...extra,
    props: {
      x: 0,
      y: 0,
      width: 300,
      height: 80,
      text: 'Sale',
      style: { fontFamily: 'Inter', fontSize: 40, color: navy, ...style },
      ...props,
    },
  })

const group = Layer.parse({
  type: 'group',
  parentId: 'f',
  link: 'grp',
  index: 'a2',
  name: 'Group',
  props: { x: 0, y: 0, width: 10, height: 10 },
})

describe('styleOf', () => {
  it('takes fill, outline, effects, transparency and corners from a shape, never its place, size or turn', () => {
    const style = styleOf(graphic())
    expect(LayerStyle.parse(style)).toEqual(style)
    expect(style).toMatchObject({
      fills: [{ type: 'solid', color: red }],
      strokes: [{ width: 2 }],
      effects: [{ type: 'layerBlur', radius: 4 }],
      opacity: 0.5,
      blendMode: 'multiply',
      corners: 8,
    })
    for (const key of ['x', 'y', 'width', 'height', 'rotation']) expect(style).not.toHaveProperty(key)
  })

  it('takes a rectangle’s own corners when it has them', () => {
    expect(styleOf(graphic({ shape: { kind: 'rect', cornerRadius: 0, corners: [1, 2, 3, 4] } })).corners).toEqual([
      1, 2, 3, 4,
    ])
    expect(styleOf(graphic({ shape: { kind: 'ellipse' } })).corners).toBeUndefined()
  })

  it('takes a text’s font, weight, colour, spacing and outline, never its font size', () => {
    const style = styleOf(
      text({ fontWeight: 700, fontStyle: 'italic', letterSpacing: 2, lineHeight: 1.2 }, { paragraphSpacing: 6 }),
    )
    expect(style.text).toEqual({
      fontFamily: 'Inter',
      fontWeight: 700,
      fontStyle: 'italic',
      color: navy,
      letterSpacing: 2,
      lineHeight: 1.2,
      paragraphSpacing: 6,
      outline: null,
    })
    expect(JSON.stringify(style)).not.toContain('fontSize')
    expect(style.fills).toBeUndefined()
  })

  it('keeps the brand bindings of what it takes', () => {
    expect(styleOf(graphic({}, { bindings: { fill: 'brand:primary' } })).bindings).toEqual({ fill: 'brand:primary' })
  })
})

describe('restyle', () => {
  it('changes nothing on a layer that has the style already', () => {
    const layer = graphic()
    expect(restyle(layer, styleOf(layer))).toBeNull()
  })

  it('sets what differs, and leaves place, size and turn as they are', () => {
    const from = graphic({ fills: [{ type: 'solid', color: navy }], opacity: 1, blendMode: 'normal' })
    const change = restyle(graphic(), styleOf(from))
    expect(change?.patch).toEqual({ fills: [{ type: 'solid', color: navy }], opacity: 1, blendMode: 'normal' })
  })

  it('sets a text’s font and spacing in its base style, keeping its font size, and clears what the style lacks', () => {
    const to = text({ fontSize: 22, lineHeight: 1.5, outline: { width: 1, color: red } }, { paragraphSpacing: 4 })
    const change = restyle(to, styleOf(text({ fontFamily: 'Lora', fontWeight: 600 })))
    expect(change?.patch.style).toEqual({
      fontFamily: 'Lora',
      fontWeight: 600,
      fontStyle: 'normal',
      fontSize: 22,
      color: navy,
      letterSpacing: 0,
    })
    expect(change?.patch).toHaveProperty('paragraphSpacing', undefined)
  })

  it('sets only what the layer has: a text’s style leaves a shape’s fills, and a shape’s leaves a text’s font', () => {
    const onShape = restyle(graphic(), styleOf(text()))
    expect(onShape?.patch).not.toHaveProperty('fills')
    expect(onShape?.patch).toMatchObject({ effects: [], opacity: 1, blendMode: 'normal' })
    expect(restyle(text(), styleOf(graphic()))?.patch).not.toHaveProperty('style')
  })

  it('gives a layer that can’t pass through a normal blend from a group that does', () => {
    expect(restyle(graphic(), styleOf(group))?.patch.blendMode).toBe('normal')
  })

  it('sets corners as each shape holds them', () => {
    const corners = styleOf(graphic({ shape: { kind: 'rect', cornerRadius: 0, corners: [1, 2, 3, 4] } }))
    expect(restyle(graphic(), corners)?.patch.shape).toEqual({ kind: 'rect', cornerRadius: 8, corners: [1, 2, 3, 4] })
    const star = graphic({ shape: { kind: 'star', cornerRadius: 0 } })
    expect(restyle(star, corners)?.patch.shape).toMatchObject({ kind: 'star', cornerRadius: 1 })
    expect(
      restyle(graphic({ shape: { kind: 'rect', corners: [1, 2, 3, 4] } }), styleOf(graphic()))?.patch.shape,
    ).toEqual({ kind: 'rect', cornerRadius: 8 })
    const ellipse = graphic({ shape: { kind: 'ellipse' }, opacity: 1 })
    expect(restyle(ellipse, styleOf(graphic()))?.patch).not.toHaveProperty('shape')
  })

  it('carries the bindings of what it sets, and keeps the ones it leaves', () => {
    const bound = styleOf(graphic({}, { bindings: { fill: 'brand:primary' } }))
    expect(restyle(graphic(), bound)?.bindings).toEqual({ fill: 'brand:primary' })
    const loose = restyle(graphic({}, { bindings: { fill: 'brand:primary' } }), styleOf(graphic()))
    expect(loose?.bindings).toEqual({})
    const kept = restyle(text({}, {}, { bindings: { fontFamily: 'brand:heading' } }), styleOf(graphic()))
    expect(kept?.bindings).toEqual({ fontFamily: 'brand:heading' })
  })
})
