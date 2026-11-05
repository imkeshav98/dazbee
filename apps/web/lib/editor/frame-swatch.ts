import type { Design } from '@dazbee/schema'

import { hexOf } from '@/lib/colour.ts'

/** The swatch for a frame's fills: the fill on top that shows, a gradient's first stop, a rainbow for an image, or empty for none. */
export function swatchOf(design: Design, frameId: string): string | 'mixed' | 'none' {
  const top = (design.frames[frameId]?.fills ?? []).findLast((fill) => fill.visible !== false)
  if (!top) return 'none'
  const colour = top.type === 'solid' ? top.color : 'stops' in top ? top.stops[0]?.color : undefined
  return colour === undefined ? 'mixed' : hexOf(colour)
}
