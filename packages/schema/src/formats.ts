import { z } from 'zod'

import { FractionalIndex } from './primitives.ts'

export const Format = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  order: FractionalIndex,
})
export type Format = z.infer<typeof Format>

/** What keeps a size from being a format, for the app to put in its own words. */
export type FormatSizeIssue = 'whole' | 'short' | 'long' | 'ratio'

/** How formats group when picking one: by the shape of the frame. */
export type FormatShape = 'square' | 'portrait' | 'tall' | 'landscape' | 'wide'

/**
 * Sizes a format may take when added or resized (#38): 1:3 to 3:1, a short side of at least
 * 100 px and no side past 8000 px. Designs already holding other sizes still load.
 */
export const FORMAT_LIMITS = { maxRatio: 3, minShortSide: 100, maxSide: 8000 } as const

export const FORMAT_SHAPES: readonly FormatShape[] = ['square', 'portrait', 'tall', 'landscape', 'wide']

/** The sizes offered when adding a format; the app names them. Each sits inside FORMAT_LIMITS. */
export const FORMAT_PRESETS = [
  { id: 'feed-square', width: 1080, height: 1080 },
  { id: 'square-large', width: 1200, height: 1200 },
  { id: 'feed-portrait', width: 1080, height: 1350 },
  { id: 'pin', width: 1000, height: 1500 },
  { id: 'story', width: 1080, height: 1920 },
  { id: 'half-page', width: 300, height: 600 },
  { id: 'medium-rectangle', width: 300, height: 250 },
  { id: 'large-rectangle', width: 336, height: 280 },
  { id: 'slide-4-3', width: 1024, height: 768 },
  { id: 'link-image', width: 1200, height: 628 },
  { id: 'video-hd', width: 1920, height: 1080 },
  { id: 'header-3-1', width: 1500, height: 500 },
] as const
export type FormatPreset = (typeof FORMAT_PRESETS)[number]

export function formatSizeIssue(width: number, height: number): FormatSizeIssue | undefined {
  const { maxRatio, minShortSide, maxSide } = FORMAT_LIMITS
  if (!Number.isInteger(width) || !Number.isInteger(height)) return 'whole'
  if (Math.min(width, height) < minShortSide) return 'short'
  if (Math.max(width, height) > maxSide) return 'long'
  if (width > height * maxRatio || height > width * maxRatio) return 'ratio'
  return undefined
}

/** Why a format can't be this size, or undefined when it can. */
export function formatSizeProblem(width: number, height: number): string | undefined {
  const { maxRatio, minShortSide, maxSide } = FORMAT_LIMITS
  const issue = formatSizeIssue(width, height)
  if (!issue) return undefined
  return {
    whole: 'a format is a whole number of pixels',
    short: `a format's short side is at least ${minShortSide} px`,
    long: `a format's sides are at most ${maxSide} px`,
    ratio: `a format runs from 1:${maxRatio} to ${maxRatio}:1`,
  }[issue]
}

export function shapeOf(width: number, height: number): FormatShape {
  const ratio = width / height
  if (ratio >= 1.75) return 'wide'
  if (ratio > 1.05) return 'landscape'
  if (ratio >= 0.95) return 'square'
  if (ratio > 0.62) return 'portrait'
  return 'tall'
}
