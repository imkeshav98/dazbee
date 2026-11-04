// Class strings for looks that controls in more than one folder share, such as the dashed button
// that adds something or takes an upload.

/** On a phone, a menu's row is at least 44 px tall, a touch target a finger can hit. */
export const TOUCH_ROW = 'max-sm:min-h-[44px]'

/** The ring a focused control shows when reached by keyboard. */
export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

/** A dashed button that adds something or takes an upload: Add image, Upload, a kit's Add. */
export const DASHED_BUTTON = `flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line-strong text-xs font-semibold text-muted transition-colors duration-[var(--chrome-fast)] hover:border-accent hover:text-text focus-within:border-accent focus-within:text-text ${FOCUS_RING}`
