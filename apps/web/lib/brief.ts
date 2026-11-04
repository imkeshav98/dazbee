// The brand home's brief (#84): the sizes it offers, and the blank design Make drafts opens until AI
// drafts arrive (phase 2).
import { type DesignInput, newFramePosition, SIZE_PRESETS, type SizePreset } from '@dazbee/schema'

/** The sizes offered on the brief, the everyday ones; the editor adds any other. */
export const BRIEF_SIZES = ['feed-square', 'feed-portrait', 'story', 'link-image'] as const

export type BriefSize = (typeof BRIEF_SIZES)[number]

/** The background a new frame starts with. */
const WHITE = [{ type: 'solid' as const, color: '#FFFFFFFF' }]

/**
 * A blank design in the sizes a brief picked: one page holding an empty, white frame per size, in
 * the presets' order, each placed by the frame rule so they stand in a row. With no size it knows,
 * one frame of the first brief size.
 */
export function briefDesign(name: string, sizeIds: string[], sizeName: (id: SizePreset['id']) => string): DesignInput {
  const picked = SIZE_PRESETS.filter((p) => sizeIds.includes(p.id))
  const presets = picked.length > 0 ? picked : SIZE_PRESETS.filter((p) => p.id === BRIEF_SIZES[0])
  const placed: { x: number; y: number; width: number }[] = []
  const frames = presets.map((preset, i) => {
    const at = newFramePosition(placed)
    placed.push({ ...at, width: preset.width })
    const frame = { pageId: 'p1', name: sizeName(preset.id), width: preset.width, height: preset.height, ...at }
    return [`f${i + 1}`, { ...frame, fills: WHITE, order: `a${i}` }] as const
  })
  return {
    meta: { designId: 'replaced-by-the-api', name },
    pages: { p1: { name: 'Page 1', order: 'a0' } },
    frames: Object.fromEntries(frames),
    nodes: {},
  }
}
