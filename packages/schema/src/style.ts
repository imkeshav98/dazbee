// A layer's style, as Copy style takes it and Paste style and Copy to other frames ▸ Style set it:
// fill, outline, effects, transparency, corners, font, weight, colour and spacing, with the brand
// bindings of those. It never holds font size, position, size or rotation.
import { z } from 'zod'

import { Effect } from './effects.ts'
import { type Layer, Stroke, TextStyle } from './layers.ts'
import { Paint } from './paint.ts'
import { ContainerBlendMode } from './primitives.ts'
import { BINDING_TARGETS, Bindings, type BindingTarget, canBind } from './variables.ts'

const Radius = z.number().min(0)

/** A text's look without its size: font, weight, colour, spacing and the outline along its glyphs. Null is none. */
const TextLook = z.object({
  fontFamily: TextStyle.shape.fontFamily,
  fontWeight: z.number().int().min(100).max(900),
  fontStyle: z.enum(['normal', 'italic']),
  color: TextStyle.shape.color,
  letterSpacing: z.number(),
  lineHeight: z.number().positive().nullable(),
  paragraphSpacing: z.number().min(0).nullable(),
  outline: z.object({ width: z.number().min(0), color: TextStyle.shape.color }).nullable(),
})

export const LayerStyle = z.object({
  /** A graphic's, box's or boolean's fills and outlines; left out for a text. */
  fills: Paint.array().optional(),
  strokes: Stroke.array().optional(),
  effects: Effect.array(),
  opacity: z.number().min(0).max(1),
  blendMode: ContainerBlendMode,
  /** One radius for every corner, or each corner's own from the top left clockwise; left out for a layer without corners. */
  corners: z.union([Radius, z.tuple([Radius, Radius, Radius, Radius])]).optional(),
  /** A text's look; left out for any other layer. */
  text: TextLook.optional(),
  /** The brand bindings of the fill, the text colour and the font. */
  bindings: Bindings,
})
export type LayerStyle = z.infer<typeof LayerStyle>

/** What setting a style changes on a layer: its props, a value of undefined clearing one, and its bindings after. */
export interface Restyle {
  patch: Record<string, unknown>
  bindings: Bindings
}

type Corners = NonNullable<LayerStyle['corners']>
type Props = Readonly<Record<string, unknown>>
type ShapeProps = { kind: string; cornerRadius?: number; corners?: [number, number, number, number] }

/** A layer's style. */
export function styleOf(layer: Layer): LayerStyle {
  const props = layer.props as Props
  const style: LayerStyle = {
    effects: layer.props.effects,
    opacity: layer.props.opacity,
    blendMode: layer.props.blendMode,
    bindings: {},
  }
  if ('fills' in layer.props) style.fills = layer.props.fills
  if ('strokes' in layer.props) style.strokes = layer.props.strokes
  const corners = cornersOf(layer)
  if (corners !== undefined) style.corners = corners
  if (layer.type === 'text') {
    const s = layer.props.style
    style.text = {
      fontFamily: s.fontFamily,
      fontWeight: s.fontWeight,
      fontStyle: s.fontStyle,
      color: s.color,
      letterSpacing: s.letterSpacing,
      lineHeight: s.lineHeight ?? null,
      paragraphSpacing: (props.paragraphSpacing as number | undefined) ?? null,
      outline: s.outline ?? null,
    }
  }
  for (const target of BINDING_TARGETS) {
    const ref = layer.bindings?.[target]
    if (ref && sets(style, layer, target)) style.bindings[target] = ref
  }
  return style
}

/**
 * What setting a style changes on a layer, only in what the layer has: fills and outlines on a
 * graphic, box or boolean, the font on a text, corners where it has corners. A blend only a
 * group or box can have becomes normal on any other layer. Null when the layer has the style already.
 */
export function restyle(layer: Layer, style: LayerStyle): Restyle | null {
  const props = layer.props as Props
  const wanted: Record<string, unknown> = {
    effects: style.effects,
    opacity: style.opacity,
    blendMode: style.blendMode === 'pass-through' && !holdsLayers(layer) ? 'normal' : style.blendMode,
  }
  if (style.fills && 'fills' in props) wanted.fills = style.fills
  if (style.strokes && 'strokes' in props) wanted.strokes = style.strokes
  if (style.corners !== undefined) Object.assign(wanted, withCorners(layer, style.corners))
  if (style.text && layer.type === 'text') {
    const { lineHeight, paragraphSpacing, outline, ...look } = style.text
    const kept = Object.entries(layer.props.style).filter(([key]) => key !== 'lineHeight' && key !== 'outline')
    wanted.style = {
      ...Object.fromEntries(kept),
      ...look,
      ...(lineHeight === null ? {} : { lineHeight }),
      ...(outline === null ? {} : { outline }),
    }
    wanted.paragraphSpacing = paragraphSpacing ?? undefined
  }
  const patch = Object.fromEntries(Object.entries(wanted).filter(([key, value]) => !same(value, props[key])))
  const bindings: Bindings = Object.fromEntries(
    BINDING_TARGETS.flatMap((target) => {
      const ref = sets(style, layer, target) ? style.bindings[target] : layer.bindings?.[target]
      return ref ? [[target, ref]] : []
    }),
  )
  return Object.keys(patch).length === 0 && same(bindings, layer.bindings ?? {}) ? null : { patch, bindings }
}

/** Whether a style sets what a binding target binds on this layer. */
function sets(style: LayerStyle, layer: Layer, target: BindingTarget) {
  if (!canBind(layer.type, target)) return false
  return target === 'fill' ? style.fills !== undefined : style.text !== undefined
}

function holdsLayers(layer: Layer) {
  return layer.type === 'box' || layer.type === 'group'
}

/** A layer's corners: a box's, or a rectangle's, polygon's or star's; undefined for any other. */
function cornersOf(layer: Layer): Corners | undefined {
  if (layer.type === 'box') return layer.props.cornerRadius
  if (layer.type !== 'graphic') return undefined
  const shape = layer.props.shape as ShapeProps
  if (shape.kind === 'rect') return shape.corners ?? shape.cornerRadius ?? 0
  if (shape.kind === 'polygon' || shape.kind === 'star') return shape.cornerRadius ?? 0
  return undefined
}

/**
 * The props that give a layer these corners: a box's radius, a rectangle's radius or own corners,
 * or a polygon's or star's one radius (the top left corner's, from four).
 */
function withCorners(layer: Layer, corners: Corners): Record<string, unknown> {
  if (layer.type === 'box') return { cornerRadius: corners }
  if (layer.type !== 'graphic') return {}
  const shape = layer.props.shape as ShapeProps
  if (shape.kind === 'rect') {
    const rest = Object.fromEntries(Object.entries(shape).filter(([key]) => key !== 'corners'))
    return { shape: Array.isArray(corners) ? { ...rest, corners } : { ...rest, cornerRadius: corners } }
  }
  if (shape.kind === 'polygon' || shape.kind === 'star')
    return { shape: { ...shape, cornerRadius: Array.isArray(corners) ? corners[0] : corners } }
  return {}
}

/** Whether two JSON values are the same, whatever order their keys are in; an undefined key counts as missing. */
function same(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b)
}

/** A JSON value as text with every object's keys sorted. */
function stable(value: unknown): string | undefined {
  if (Array.isArray(value)) return `[${value.map((v) => stable(v) ?? 'null').join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
