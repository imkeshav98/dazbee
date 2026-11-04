// Class strings for looks that controls in more than one folder share, such as the dashed button
// that adds something or takes an upload.

/** The ring a focused control shows when reached by keyboard. */
export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

/**
 * A row on glass lit by the hover tint under the pointer and the pressed tint while pressed, its muted
 * and coloured text in the text colour while lit (the lit utility in app/globals.css).
 */
export const LIT_ROW = 'hover:bg-hover hover:lit active:bg-pressed active:lit'

/** A dashed button that adds something or takes an upload: Add image, Upload, a kit's Add. */
export const DASHED_BUTTON = `flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line-strong text-xs font-semibold text-muted transition-colors duration-[var(--chrome-fast)] hover:border-accent hover:text-text focus-within:border-accent focus-within:text-text ${FOCUS_RING}`
