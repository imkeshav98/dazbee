// The swatches' shared look in the edit panels: the fixed colours offered without a brand kit, and
// the ring round the one picked.

/** Colours a click away when the brand's kit has none; the hex fields take any colour. */
export const SWATCHES = ['#FFFFFF', '#FBF7F2', '#1A1420', '#FF48B0', '#3D6BFF', '#FFD23F', '#3DD68C', '#FF6B3D'] as const

/**
 * The ring round a picked swatch or tile, as in the mock: pink with a gap, a shape and not only a
 * colour, so it reads without colour vision too.
 */
export const PICKED_RING = 'shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]'
