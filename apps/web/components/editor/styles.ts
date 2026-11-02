// The editor chrome's shared looks, as class strings: every control that looks like one of these
// takes it from here instead of spelling its classes again.

/** The ring a focused control shows when reached by keyboard. */
export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

/** A disabled control: faded and not clickable. */
const DISABLED = 'disabled:pointer-events-none disabled:opacity-40'

/** A small pill button, as the mock's chips under a list. */
export const CHIP = `inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-line px-3 text-xs font-semibold text-muted transition-colors duration-[var(--chrome-fast)] hover:border-line-strong hover:text-text ${DISABLED}`

/** A small square icon button in a card's row. */
export const ICON_BUTTON = 'grid size-7 shrink-0 cursor-pointer place-items-center rounded-row text-subtle transition-colors duration-[var(--chrome-fast)] hover:bg-hover hover:text-text disabled:pointer-events-none disabled:opacity-30'

/** A dashed button that adds something or takes an upload: Add image, Upload, a kit's Add. */
export const DASHED_BUTTON = `flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line-strong text-xs font-semibold text-muted transition-colors duration-[var(--chrome-fast)] hover:border-accent hover:text-text focus-within:border-accent focus-within:text-text ${FOCUS_RING}`

/** A chip in pink, for a choice that is set: the header card's sizes. */
export const CHIP_ACCENT = `${CHIP} border-transparent bg-accent-soft text-accent-text hover:border-transparent hover:text-accent-text`
/** A word-sized button that acts at once, in pink: a menu row's Reset. */
export const LINK_BUTTON = `shrink-0 cursor-pointer rounded-row px-1.5 text-[12px] font-semibold text-accent-text hover:bg-hover ${FOCUS_RING}`

/** A square tile showing one image asset's thumbnail, in the asset library and the image picker. */
export const ASSET_TILE = 'grid aspect-square place-items-center overflow-hidden rounded-[10px] border border-line bg-bg/40 transition-colors duration-[var(--chrome-fast)]'

/** A popover's frosted panel, as the cards are: the shape menu, the image picker, Add format. */
export const POPOVER = 'pop-in z-50 rounded-card surface-frost'
/** A menu of rows: ⋯ More, the right-click menu, and the menus beside their rows. */
export const MENU = `${POPOVER} flex flex-col p-1.5`

/** A tool dock button's shape; its width is the caller's. */
export const DOCK_BUTTON = `grid h-10 cursor-pointer place-items-center rounded-[12px] transition-colors duration-[var(--chrome-fast)] ${FOCUS_RING}`
/** The dock's colours for the tool in use, and for the others. */
export const DOCK_ON = 'bg-accent-solid text-on-accent'
export const DOCK_OFF = 'text-muted hover:bg-hover hover:text-text'
/** One tool's square dock button, lit while the tool is in use. */
export const dockTool = (on: boolean) => `${DOCK_BUTTON} w-10 ${on ? DOCK_ON : DOCK_OFF}`

/** A round colour swatch that picks its colour; its size is the caller's. */
export const SWATCH = 'shrink-0 cursor-pointer rounded-full border border-line-strong transition-transform duration-[var(--chrome-fast)] hover:scale-110'

/** The look of a value typed into a field: a number, a hex, a dash pattern. */
export const VALUE_TEXT = 'font-mono text-[12px] tabular-nums text-text'
/** A field to type a value into, as tall as a knob. */
export const FIELD = `h-8 min-w-0 w-full rounded-row border border-line bg-surface px-1.5 ${VALUE_TEXT} outline-none placeholder:text-subtle focus:border-accent`
/** Where a dragged row would land in a list: a line across it, placed by the row above or below. */
export const DROP_LINE = 'pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-accent'

/** A layer's picture in a list row, and the ring it has while the layer is selected. */
export const LAYER_PICTURE = 'border border-line bg-surface'
export const LAYER_PICTURE_PICKED = 'border-accent ring-1 ring-accent'

/** A small name over or beside a card's field. */
export const FIELD_LABEL = 'text-xs font-semibold text-muted'

/** A dropdown field's box, as tall as a knob. */
export const SELECT = 'h-8 w-full bg-surface px-1.5 text-[12px]'
/**
 * A number you drag sideways, as in the mock: its label at the start, its value in mono at the end,
 * and a soft fill behind them showing where the value sits in its range (`--fill`).
 */
export const KNOB = `relative flex h-8 min-w-0 cursor-ew-resize touch-pan-y select-none items-center gap-2 overflow-hidden rounded-row border border-line bg-surface px-2.5 text-[12px] font-semibold text-muted transition-colors duration-[var(--chrome-fast)] hover:border-line-strong focus-within:border-accent before:pointer-events-none before:absolute before:inset-y-0 before:start-0 before:w-[var(--fill,0%)] before:bg-accent-soft before:transition-[width] before:duration-75`
/** Knobs two to a row; a lone last one takes the whole row. */
export const KNOBS = 'grid grid-cols-2 gap-1.5 [&>:last-child:nth-child(odd)]:col-span-2'
/** Four small knobs on one line, as a box's X, Y, W and H. */
export const KNOBS_FOUR = 'grid grid-cols-4 gap-1 [&>*]:gap-1 [&>*]:px-[7px]'
/** A row of choices that look as one control, one of them on. */
export const SEGMENTS = 'grid auto-cols-fr grid-flow-col gap-0.5 rounded-[10px] bg-hover p-[3px]'
/** One choice of SEGMENTS, aria-checked while it is the one. */
export const SEGMENT = `h-7 min-w-0 cursor-pointer truncate rounded-[7px] px-2 text-[12px] font-semibold text-muted transition-colors duration-[var(--chrome-fast)] hover:text-text aria-checked:bg-accent-solid aria-checked:text-on-accent ${FOCUS_RING}`

/** A row of a menu: its words at the start, a shortcut or a switch at the end. */
export const MENU_ITEM = `group flex h-9 w-full shrink-0 cursor-pointer items-center justify-between gap-3 rounded-row px-2.5 text-start text-[13px] font-medium text-text transition-colors duration-[var(--chrome-fast)] hover:bg-hover ${DISABLED} ${FOCUS_RING}`
/** The hairline between a menu's groups of rows. */
export const MENU_DIVIDER = 'mx-1.5 my-1 border-t border-line'
/** A shortcut shown in a menu row. */
export const MENU_KEY = 'font-mono text-[11px] font-normal text-subtle'
/** A switch drawn in a menu row or a card's row that is role="switch": checked, its knob slides to the end. */
export const SWITCH = 'relative h-5 w-[34px] shrink-0 rounded-full bg-line-strong transition-colors duration-[var(--chrome-fast)] group-aria-checked:bg-accent-solid after:absolute after:start-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform after:duration-[var(--chrome-fast)] group-aria-checked:after:translate-x-3.5 rtl:group-aria-checked:after:-translate-x-3.5'

/** A tile to pick, as the effects and the box modes are: its picture, its name under it, lit while it is on. */
export const TILE = `group flex min-w-0 cursor-pointer flex-col items-center gap-1 text-[11px] font-semibold text-muted aria-pressed:text-text aria-checked:text-text ${FOCUS_RING}`
const TILE_FACE_BASE = 'grid w-full place-items-center overflow-hidden rounded-[10px] border border-line bg-bg/60 transition-colors duration-[var(--chrome-fast)] group-hover:border-line-strong group-aria-pressed:border-accent group-aria-checked:border-accent'
/** The picture of a TILE, square. */
export const TILE_FACE = `${TILE_FACE_BASE} aspect-square`
/** The picture of a TILE, wider than tall. */
export const TILE_FACE_WIDE = `${TILE_FACE_BASE} aspect-[3/2]`
/** A row that turns something on or off, with role="switch": its words, then the switch. */
export const SWITCH_ROW = `group flex h-8 w-full cursor-pointer items-center justify-between gap-3 rounded-row text-[13px] font-semibold text-text ${FOCUS_RING}`

/** The bar by the selection: a frosted pill of buttons on the stage. */
export const BAR = 'absolute z-20 flex items-center gap-0.5 rounded-[14px] surface-frost p-1'
/** One button of the bar: words or an icon, lit while its popover is open. */
export const BAR_BUTTON = `flex h-[30px] min-w-[30px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-row px-2 text-[12px] font-semibold whitespace-nowrap text-text transition-colors duration-[var(--chrome-fast)] hover:bg-hover aria-expanded:bg-hover ${FOCUS_RING}`
/** A button of the bar that turns something on or off, such as bold: lit while it is on. */
export const BAR_TOGGLE = `${BAR_BUTTON} aria-pressed:bg-accent-soft aria-pressed:text-accent-text ${DISABLED}`
/** The body of a bar popover that holds a list, such as the fills or the strokes. */
export const BAR_PANEL = 'flex w-80 flex-col gap-3 p-1.5'
/** The swatch a bar button shows for a colour the selected layers don't share. */
export const MIXED_COLOUR = 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)'
/** The upright hairline between the bar's groups of buttons. */
export const BAR_DIVIDER = 'mx-0.5 h-5 w-px bg-line'

/** A small message floating at the stage's start corner: a layer removed, something auto layout decides. */
export const TOAST = 'toast-in pointer-events-auto flex h-10 items-center gap-2 rounded-card surface-frost ps-3.5 pe-1.5 text-[13px]'
