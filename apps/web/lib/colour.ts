// Colours as the app shows and types them, over the design's #RRGGBBAA values: the #RRGGBB part, a
// field's change to the hex or the alpha, and the hex people read and type.
import { alphaOf, withAlpha, withHex } from '@dazbee/schema'

/** A colour's #RRGGBB part, without its alpha. */
export const hexOf = (color: string) => color.slice(0, 7)

/** A change that sets a colour's #RRGGBB and keeps its alpha, as the document holds it then; opaque when it has none. */
export const hexChange = (hex: string) => (now: string | undefined) => withHex(now ?? '', hex)

/** A change that sets a colour's alpha, from 0 to 1, and keeps its #RRGGBB; black when there is no colour. */
export const alphaChange = (alpha: number) => (now: string | undefined) => withAlpha(now || '#000000', alpha)

/** A colour as people type it: #RRGGBB, with the alpha only when it isn't opaque. */
export const hexText = (color: string) => (alphaOf(color) === 1 ? hexOf(color) : color).toUpperCase()

/** A typed hex colour as the design stores it, #RRGGBBAA, or null when it isn't one. */
export function parseHex(text: string): string | null {
  const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text.trim())
  return match ? `#${match[1]}${match[2] ?? 'FF'}`.toUpperCase() : null
}
