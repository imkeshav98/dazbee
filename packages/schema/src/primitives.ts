import { z } from 'zod'

/** Ids are random strings made on the device (21 chars in production; fixtures use short readable ones). */
export const Id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[\w-]+$/, 'ids are letters, digits, _ and -')
export type Id = z.infer<typeof Id>
export const NodeId = Id
export type NodeId = z.infer<typeof NodeId>
export const PageId = Id
export type PageId = z.infer<typeof PageId>
export const FormatId = Id
export type FormatId = z.infer<typeof FormatId>
export const AssetId = Id
export type AssetId = z.infer<typeof AssetId>

/** A fractional index: a short string that sorts between its neighbours. */
export const FractionalIndex = z
  .string()
  .min(1)
  .regex(/^[0-9A-Za-z]+$/, 'fractional indexes are base-62 strings')
export type FractionalIndex = z.infer<typeof FractionalIndex>

/** #RRGGBBAA, upper or lower case. */
export const Color = z.string().regex(/^#[0-9a-fA-F]{8}$/, 'colours are #RRGGBBAA')
export type Color = z.infer<typeof Color>

export const Point = z.object({ x: z.number(), y: z.number() })
export type Point = z.infer<typeof Point>

/** A box that isn't turned. */
export type Rect = { x: number; y: number; width: number; height: number }

export const BlendMode = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
])
export type BlendMode = z.infer<typeof BlendMode>

/**
 * How a group or box mixes with what is under it (#43). Pass-through, the default, adds no
 * layer of its own: each child mixes with what is under the group as if it weren't grouped.
 * Any other mode first draws the children together, so their own modes mix only with each
 * other, then mixes the result. A pass-through group with opacity or effects is drawn
 * together too, as normal, since its opacity and effects apply to the whole.
 */
export const ContainerBlendMode = z.enum([...BlendMode.options, 'pass-through'])
export type ContainerBlendMode = z.infer<typeof ContainerBlendMode>

/** Code-unit order, the same on every device (unlike localeCompare) and the order fractional indexes use. */
export const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** A record of pages or formats as `[id, item]` pairs, by order, ties broken by id. */
export const inOrder = <T extends { readonly order: string }>(record: Readonly<Record<string, T>>): [string, T][] =>
  Object.entries(record).sort(([a, x], [b, y]) => byCodeUnits(x.order, y.order) || byCodeUnits(a, b))

/** A colour's alpha, from 0 to 1. */
export const alphaOf = (color: string) => Number.parseInt(color.slice(7, 9) || 'FF', 16) / 255

/** A colour with its alpha set, from 0 to 1. */
export const withAlpha = (color: string, alpha: number) =>
  `${color.slice(0, 7)}${Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()}`

/** A colour with its red, green and blue set from a `#RRGGBB`, keeping its alpha. */
export const withHex = (color: string, hex: string) => `${hex}${color.slice(7, 9) || 'FF'}`
