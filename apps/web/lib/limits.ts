// The furthest the panels' number fields go: past these a design only breaks (text that leaves the
// canvas, a box millions of pixels wide), so a value typed, stepped or dragged stops at them. Every
// field stops at `any` either way unless it has its own, closer, limits.
export const LIMITS = {
  any: 100_000,
  fontSize: 2_000,
  lineHeight: 10,
  letterSpacing: 1_000,
  paragraphSpacing: 1_000,
  effectOffset: 10_000,
  effectBlur: 1_000,
  effectSpread: 1_000,
} as const
