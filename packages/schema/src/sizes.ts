/** What keeps a size from being a frame's, for the app to put in its own words. */
export type SizeIssue = 'whole' | 'short' | 'long' | 'ratio'

/** How a size reads at a glance, for the brand's Recent filter. */
export type SizeShape = 'square' | 'portrait' | 'tall' | 'landscape' | 'wide'

/**
 * Sizes a frame may be made or resized to: whole pixels, sides from 50 to 8000 px, up to 12 times
 * as long as wide. Designs holding other sizes still load.
 */
export const SIZE_LIMITS = { minSide: 50, maxSide: 8000, maxRatio: 12 } as const

/** The channels the offered sizes are grouped by, in the order they are shown. */
export const SIZE_CHANNELS = ['meta', 'google', 'linkedin-x'] as const
export type SizeChannel = (typeof SIZE_CHANNELS)[number]

/** The sizes offered when adding a frame, by channel in SIZE_CHANNELS order; the app names them by id. Each sits inside SIZE_LIMITS. */
export const SIZE_PRESETS = [
  { id: 'feed-square', channel: 'meta', width: 1080, height: 1080 },
  { id: 'feed-portrait', channel: 'meta', width: 1080, height: 1350 },
  { id: 'story', channel: 'meta', width: 1080, height: 1920 },
  { id: 'medium-rectangle', channel: 'google', width: 300, height: 250 },
  { id: 'leaderboard', channel: 'google', width: 728, height: 90 },
  { id: 'half-page', channel: 'google', width: 300, height: 600 },
  { id: 'link-image', channel: 'linkedin-x', width: 1200, height: 628 },
] as const satisfies readonly { id: string; channel: SizeChannel; width: number; height: number }[]
export type SizePreset = (typeof SIZE_PRESETS)[number]

/** The size a design starts at when nothing gives it one: the first preset, Feed square. */
export const BLANK_SIZE: SizePreset = SIZE_PRESETS[0]

/** What keeps a frame from being this size, or undefined when it can be. */
export function sizeIssue(width: number, height: number): SizeIssue | undefined {
  const { minSide, maxSide, maxRatio } = SIZE_LIMITS
  if (!Number.isInteger(width) || !Number.isInteger(height)) return 'whole'
  if (Math.min(width, height) < minSide) return 'short'
  if (Math.max(width, height) > maxSide) return 'long'
  if (Math.max(width, height) > Math.min(width, height) * maxRatio) return 'ratio'
  return undefined
}

/** Why a frame can't be this size, in English for a command's refusal, or undefined when it can be. */
export function sizeProblem(width: number, height: number): string | undefined {
  const { minSide, maxSide, maxRatio } = SIZE_LIMITS
  const issue = sizeIssue(width, height)
  if (!issue) return undefined
  return {
    whole: 'a frame is a whole number of pixels',
    short: `a frame's sides are at least ${minSide} px`,
    long: `a frame's sides are at most ${maxSide} px`,
    ratio: `a frame is at most ${maxRatio} times as long as it is wide`,
  }[issue]
}

/** The first preset of exactly this size, or undefined for a size of your own. */
export function presetOf(width: number, height: number): SizePreset | undefined {
  return SIZE_PRESETS.find((preset) => preset.width === width && preset.height === height)
}

/** How a size reads at a glance. */
export function shapeOf(width: number, height: number): SizeShape {
  const ratio = width / height
  if (ratio >= 1.75) return 'wide'
  if (ratio > 1.05) return 'landscape'
  if (ratio >= 0.95) return 'square'
  if (ratio > 0.62) return 'portrait'
  return 'tall'
}
