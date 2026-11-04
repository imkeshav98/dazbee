// Class strings for looks that controls in more than one folder share, such as the dashed button
// that adds something or takes an upload.

/** The ring a focused control shows when reached by keyboard. */
export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

/**
 * A row on glass lit by the hover tint under the pointer and the pressed tint while pressed, its muted
 * and coloured text in the text colour while lit (the lit utility in app/globals.css).
 */
export const LIT_ROW = 'hover:bg-hover hover:lit active:bg-pressed active:lit'

/**
 * A row of choices that look as one control, one of them on, in a sunken well: each as wide as its
 * words need, sharing what is left. Muted text in the well takes the well's shade.
 */
export const SEGMENTS =
  'grid auto-cols-auto grid-flow-col gap-0.5 rounded-[10px] bg-well p-[3px] [--text-muted:var(--glass-well-muted)] [&>*]:min-w-max'
/**
 * One choice of SEGMENTS, lit by the tints under the pointer and while pressed, and aria-checked (or
 * aria-pressed) while it is the one: on a chip, in the text colour, which the tints leave be.
 */
export const SEGMENT = `h-7 min-w-0 cursor-pointer truncate rounded-[7px] px-2 text-[12px] font-semibold text-muted transition-colors duration-[var(--chrome-fast)] ${LIT_ROW} aria-checked:bg-chip aria-checked:text-text aria-pressed:bg-chip aria-pressed:text-text ${FOCUS_RING}`

/**
 * A button that confirms a delete: solid red under white words, which read whatever lies behind the
 * glass it sits on.
 */
export const DANGER_SOLID =
  'bg-danger-solid text-on-accent hover:bg-danger-solid-hover hover:text-on-accent active:bg-danger-solid-hover active:text-on-accent'

/** A dashed button that adds something or takes an upload: Add image, Upload, a kit's Add. */
export const DASHED_BUTTON = `flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line-strong text-xs font-semibold text-muted transition-colors duration-[var(--chrome-fast)] hover:border-accent hover:text-text focus-within:border-accent focus-within:text-text ${FOCUS_RING}`
