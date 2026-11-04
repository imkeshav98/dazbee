// The editor chrome's own looks, as class strings, and the colours offered without a brand kit: every
// editor control that looks like one of these takes it from here instead of spelling its classes again.
// Looks that controls outside the editor share live in components/ui/looks.ts.

import { FOCUS_RING, LIT_ROW } from '@/components/ui/looks.ts'

/** A disabled control: faded and not clickable. */
const DISABLED = 'disabled:pointer-events-none disabled:opacity-40'

/** A small pill button, as the mock's chips under a list. */
export const CHIP = `inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-line px-3 text-xs font-semibold text-muted transition-colors duration-[var(--chrome-fast)] hover:border-line-strong hover:text-text ${DISABLED}`

/** A small square icon button in a card's row. */
export const ICON_BUTTON =
  'grid size-7 shrink-0 cursor-pointer place-items-center rounded-row text-subtle transition-colors duration-[var(--chrome-fast)] hover:bg-hover hover:text-text active:bg-pressed disabled:pointer-events-none disabled:opacity-30'

/** A chip in pink, for a choice that is set: the header card's sizes. */
export const CHIP_ACCENT = `${CHIP} border-transparent bg-accent-soft text-accent-text hover:border-transparent hover:text-accent-text`
/** A word-sized button that acts at once, in pink: a menu row's Reset. */
export const LINK_BUTTON = `shrink-0 cursor-pointer rounded-row px-1.5 text-[12px] font-semibold text-accent-text ${LIT_ROW} ${FOCUS_RING}`
/** A button with words and no box until hovered, as a panel's Done or Delete. */
export const QUIET_BUTTON = `flex h-8 cursor-pointer items-center gap-1.5 rounded-row px-3 text-[13px] font-medium text-muted hover:bg-hover hover:text-text active:bg-pressed disabled:pointer-events-none disabled:opacity-50 ${FOCUS_RING}`

/** A square tile showing one image asset's thumbnail, in the asset library and the image picker. */
export const ASSET_TILE =
  'grid aspect-square place-items-center overflow-hidden rounded-[10px] border border-line bg-bg/40 transition-colors duration-[var(--chrome-fast)]'

/** A popover's frosted panel, as the cards are: the shape menu, the image picker, Add format. */
export const POPOVER = 'pop-in z-50 rounded-card surface-frost'
/** A menu of rows: ⋯ More, the right-click menu, and the menus beside their rows. */
export const MENU = `${POPOVER} flex flex-col p-1.5`

/** A tool dock button's shape; its width is the caller's. */
export const DOCK_BUTTON = `grid h-10 cursor-pointer place-items-center rounded-[12px] transition-colors duration-[var(--chrome-fast)] ${FOCUS_RING}`
/** The dock's colours for the tool in use, and for the others. */
export const DOCK_ON = 'bg-accent-solid text-on-accent'
export const DOCK_OFF = 'text-muted hover:bg-hover hover:text-text active:bg-pressed active:text-text'
/** One tool's square dock button, lit while the tool is in use. */
export const dockTool = (on: boolean) => `${DOCK_BUTTON} w-10 ${on ? DOCK_ON : DOCK_OFF}`

/** A round colour swatch that picks its colour; its size is the caller's. */
export const SWATCH =
  'shrink-0 cursor-pointer rounded-full border border-line-strong transition-transform duration-[var(--chrome-fast)] hover:scale-110'

/** Colours a click away when the brand's kit has none; the hex fields take any colour. */
export const SWATCHES = [
  '#FFFFFF',
  '#FBF7F2',
  '#1A1420',
  '#FF48B0',
  '#3D6BFF',
  '#FFD23F',
  '#3DD68C',
  '#FF6B3D',
] as const

/**
 * The ring round a picked swatch or tile, as in the mock: pink with a gap, a shape and not only a
 * colour, so it reads without colour vision too.
 */
export const PICKED_RING = 'shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]'

/** The look of a value typed into a field: a number, a hex, a dash pattern. */
export const VALUE_TEXT = 'font-mono text-[12px] tabular-nums text-text'
/** A field to type a value into, as tall as a knob: its border shows the focus, with no ring besides. */
export const FIELD = `h-8 min-w-0 w-full rounded-row border border-line bg-surface px-1.5 ${VALUE_TEXT} outline-none focus-visible:outline-none! placeholder:text-subtle focus:border-accent`
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
 * and a soft fill behind them showing where the value sits in its range: from `--fill-from`, `--fill` wide,
 * with a line at the value (`--fill-at`) on a field that has a range (`data-ranged`).
 */
export const KNOB = `relative flex h-8 min-w-0 cursor-ew-resize touch-pan-y select-none items-center gap-2 overflow-hidden rounded-row border border-line bg-surface px-2.5 text-[12px] font-semibold text-muted transition-colors duration-[var(--chrome-fast)] hover:border-line-strong focus-within:border-accent before:pointer-events-none before:absolute before:inset-y-0 before:start-[var(--fill-from,0%)] before:w-[var(--fill,0%)] before:bg-accent-soft before:transition-[width] before:duration-75 data-ranged:after:pointer-events-none data-ranged:after:absolute data-ranged:after:inset-y-1.5 data-ranged:after:start-[clamp(4px,var(--fill-at),calc(100%-6px))] data-ranged:after:w-0.5 data-ranged:after:-translate-x-1/2 data-ranged:after:rounded-full data-ranged:after:bg-accent data-ranged:after:shadow-[0_0_8px_rgb(255_72_176/0.7)] rtl:data-ranged:after:translate-x-1/2`
/** Knobs two to a row; a lone last one takes the whole row. */
export const KNOBS = 'grid grid-cols-2 gap-1.5 [&>:last-child:nth-child(odd)]:col-span-2'
/**
 * A row of choices that look as one control, one of them on, in a sunken well: each as wide as its
 * words need, sharing what is left. Muted text in the well takes the well's shade.
 */
export const SEGMENTS =
  'grid auto-cols-auto grid-flow-col gap-0.5 rounded-[10px] bg-well p-[3px] [--text-muted:var(--glass-well-muted)] [&>*]:min-w-max'
/** One choice of SEGMENTS, aria-checked (or aria-pressed) while it is the one: on a chip, in the text colour. */
export const SEGMENT = `h-7 min-w-0 cursor-pointer truncate rounded-[7px] px-2 text-[12px] font-semibold text-muted transition-colors duration-[var(--chrome-fast)] hover:text-text aria-checked:bg-chip aria-checked:text-text aria-pressed:bg-chip aria-pressed:text-text ${FOCUS_RING}`

/** A row of a menu: its words at the start, a shortcut or a switch at the end. */
export const MENU_ITEM = `group flex h-9 w-full shrink-0 cursor-pointer items-center justify-between gap-3 rounded-row px-2.5 text-start text-[13px] font-medium text-text transition-colors duration-[var(--chrome-fast)] ${LIT_ROW} ${DISABLED} ${FOCUS_RING}`
/** The hairline between a menu's groups of rows. */
export const MENU_DIVIDER = 'mx-1.5 my-1 border-t border-line'
/** A shortcut shown in a menu row. */
export const MENU_KEY = 'font-mono text-[11px] font-normal text-subtle'
/** A switch drawn in a menu row or a card's row that is role="switch": checked, its knob slides to the end. */
export const SWITCH =
  'relative h-5 w-[34px] shrink-0 rounded-full bg-subtle/70 transition-colors duration-[var(--chrome-fast)] group-aria-checked:bg-accent-solid after:absolute after:start-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform after:duration-[var(--chrome-fast)] group-aria-checked:after:translate-x-3.5 rtl:group-aria-checked:after:-translate-x-3.5'

/** A tile to pick, as the effects and the box modes are: its picture, its name under it, lit while it is on. */
export const TILE = `group flex min-w-0 cursor-pointer flex-col items-center gap-1 text-[11px] font-semibold text-muted aria-pressed:text-text aria-checked:text-text ${FOCUS_RING}`
const TILE_FACE_BASE =
  'grid w-full place-items-center overflow-hidden rounded-[10px] border border-line bg-bg/60 transition-colors duration-[var(--chrome-fast)] group-hover:border-line-strong group-aria-pressed:border-accent group-aria-pressed:ring-1 group-aria-pressed:ring-accent group-aria-checked:border-accent group-aria-checked:ring-1 group-aria-checked:ring-accent'
/** The picture of a TILE, wider than tall. */
export const TILE_FACE_WIDE = `${TILE_FACE_BASE} aspect-[3/2]`
/** A row that turns something on or off, with role="switch": its words, then the switch. */
export const SWITCH_ROW = `group flex h-8 w-full cursor-pointer items-center justify-between gap-3 rounded-row text-[13px] font-semibold text-text ${FOCUS_RING}`

/** One part of an edit panel or pop-up: a card's controls under a small heading, a hairline above all but the first. */
export const PANEL_PART = 'flex flex-col gap-2.5 border-t border-line pt-3 first:border-t-0 first:pt-0'
/** A small heading over a group of an edit panel's choices, as Line up with the size. */
export const PANEL_HEADING = 'text-xs font-semibold text-muted'
/** A boxed button of an edit panel that acts at once: its icon, then its words, or its icon alone. */
export const PANEL_BUTTON = `flex h-[34px] min-w-0 cursor-pointer items-center gap-2 rounded-row border border-line bg-surface px-2.5 text-[12.5px] font-medium whitespace-nowrap text-text transition-colors duration-[var(--chrome-fast)] hover:bg-hover disabled:cursor-not-allowed disabled:opacity-45 [&>span]:truncate ${FOCUS_RING}`
/** An edit panel's button among many that act at once, as Position's moves: unfilled, lit by the tints. */
export const PANEL_ACTION = `flex h-[34px] min-w-0 cursor-pointer items-center gap-2 rounded-row px-2.5 text-[12.5px] font-medium whitespace-nowrap text-text transition-colors duration-[var(--chrome-fast)] hover:bg-hover active:bg-pressed disabled:cursor-not-allowed disabled:opacity-45 [&>span]:truncate ${FOCUS_RING}`
/** A switch shaped as a knob, its name at the start: Lock ratio among the size fields. */
export const KNOB_SWITCH = `group flex h-8 min-w-0 cursor-pointer items-center justify-between gap-2 rounded-row border border-line bg-surface px-2.5 text-[12px] font-semibold whitespace-nowrap text-muted transition-colors duration-[var(--chrome-fast)] hover:border-line-strong aria-checked:text-text ${FOCUS_RING}`

/** The top bar's row on the stage, under the header pill: where the bar sits, and the room the fit keeps for it. */
export const BAR_ROW = 'top-[90px] max-sm:top-[72px]'
/** The top bar's height, for the room the fit keeps. */
export const BAR_ROW_HEIGHT = 'h-[38px]'
/** One button of the bar: words or an icon, lit while its popover is open. */
export const BAR_BUTTON = `flex h-[30px] min-w-[30px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-row px-2 text-[12px] font-semibold whitespace-nowrap text-text transition-colors duration-[var(--chrome-fast)] hover:bg-hover active:bg-pressed aria-expanded:bg-hover ${FOCUS_RING}`
/** A button of the bar that turns something on or off, such as bold: lit while it is on. */
export const BAR_TOGGLE = `${BAR_BUTTON} aria-pressed:bg-accent-soft aria-pressed:text-accent-text ${DISABLED}`
/** The swatch a bar button shows for a colour the selected layers don't share. */
export const MIXED_COLOUR = 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)'
/** The upright hairline between the bar's groups of buttons. */
export const BAR_DIVIDER = 'mx-0.5 h-5 w-px bg-line'

/** A small message floating at the stage's start corner: a layer removed, something auto layout decides. */
export const TOAST =
  'toast-in pointer-events-auto flex h-10 items-center gap-2 rounded-card surface-frost ps-3.5 pe-1.5 text-[13px]'
