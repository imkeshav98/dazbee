import { alphaOf, type Design, withAlpha } from '@dazbee/schema'

/**
 * The swatch for a frame's fills, as the frame looks: the fill on top that shows, as #RRGGBBAA with
 * its colour's alpha and its own opacity, a gradient's first stop, a rainbow for an image, or empty
 * for none.
 */
export function swatchOf(design: Design, frameId: string): string | 'mixed' | 'none' {
  const top = (design.frames[frameId]?.fills ?? []).findLast((fill) => fill.visible !== false)
  if (!top) return 'none'
  const colour = top.type === 'solid' ? top.color : 'stops' in top ? top.stops[0]?.color : undefined
  return colour === undefined ? 'mixed' : withAlpha(colour, alphaOf(colour) * (top.opacity ?? 1))
}
