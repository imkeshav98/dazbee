// The rows the editor's layer menus show, in order, as the specs check them: the full menu (the
// small menu's ⋯ and a right-click on a layer) with the menus beside its rows, and the top bar's
// Arrange ⋯ with the moves beside its Order; and readers of the rows a menu shows. A picked frame's
// ⋯ keeps its own list in frames-on-canvas.ts.
import type { Locator, Page } from './test.ts'

/**
 * A row of a menu: what a spec names it by (its `data-action`, or the test id of a row that opens a
 * menu beside it or in its place), its words, and how it reads with its key after them.
 */
export interface Row {
  id: string
  name: string
  reads: string
}

/**
 * The full menu's rows in order; `group` marks Ungroup, there only for a group or a box. A layer
 * under a mask shows Release mask (`RELEASE_MASK`) in Use as mask's place.
 */
export const FULL_MENU: readonly (Row & { group?: true })[] = [
  { id: 'more-copy', name: 'Copy', reads: 'Copy' },
  { id: 'more-paste', name: 'Paste', reads: 'Paste' },
  { id: 'duplicate', name: 'Duplicate', reads: 'DuplicateCtrl+D' },
  { id: 'more-copy-to-frames', name: 'Copy to other frames', reads: 'Copy to other frames' },
  { id: 'boxSelection', name: 'Put in a box', reads: 'Put in a boxCtrl+Alt+G' },
  { id: 'ungroup', name: 'Ungroup', reads: 'UngroupCtrl+Shift+G', group: true },
  { id: 'mask', name: 'Use as mask', reads: 'Use as maskCtrl+Alt+M' },
  { id: 'lockLinked', name: 'Lock in all frames', reads: 'Lock in all framesCtrl+Alt+Shift+L' },
  { id: 'hideLinked', name: 'Hide in all frames', reads: 'Hide in all framesCtrl+Alt+Shift+H' },
  { id: 'deleteLinked', name: 'Delete from all frames', reads: 'Delete from all frames' },
]
/** The row in Use as mask's place for a layer under a mask. */
export const RELEASE_MASK: Row = { id: 'releaseMask', name: 'Release mask', reads: 'Release mask' }
/**
 * The rows of the menus beside the full menu's rows, by the test id of the row that opens each
 * (`more-<id>`); `text` marks Copy to other frames ▸ Text, there only for text layers.
 */
export const FULL_MENU_BESIDE: Record<'copy' | 'paste' | 'copy-to-frames', readonly (Row & { text?: true })[]> = {
  copy: [
    { id: 'copy', name: 'Copy', reads: 'CopyCtrl+C' },
    { id: 'copyStyle', name: 'Copy style', reads: 'Copy styleCtrl+Alt+C' },
  ],
  paste: [
    { id: 'paste', name: 'Paste', reads: 'PasteCtrl+V' },
    { id: 'pasteStyle', name: 'Paste style', reads: 'Paste styleCtrl+Alt+V' },
  ],
  'copy-to-frames': [
    { id: 'styleToLinked', name: 'Style', reads: 'StyleCtrl+Alt+Shift+C' },
    { id: 'textToLinked', name: 'Text', reads: 'TextCtrl+Alt+Shift+T', text: true },
    { id: 'layerToLinked', name: 'Layer', reads: 'Layer' },
  ],
}
/**
 * Arrange ⋯'s rows in order, by their test ids (`rotation` for the rotation field, which has none)
 * and the words of each row: Order ▸; Line up ▸ for one layer (`one`); the rotation field unless a
 * group or a boolean is selected (`turns`); Text direction ▸ for text (`text`).
 */
export const ARRANGE: readonly { id: string; name: string; only?: 'one' | 'turns' | 'text' }[] = [
  { id: 'more-order', name: 'Order' },
  { id: 'more-line-up', name: 'Line up', only: 'one' },
  { id: 'rotation', name: 'Rotation', only: 'turns' },
  { id: 'more-text-direction', name: 'Text direction', only: 'text' },
]
/** The moves in the menu beside Arrange's Order, in order. */
export const ORDER_MENU: readonly Row[] = [
  { id: 'bringToFront', name: 'Bring to front', reads: 'Bring to frontCtrl+Shift+]' },
  { id: 'bringForward', name: 'Bring forward', reads: 'Bring forwardCtrl+]' },
  { id: 'sendBackward', name: 'Send backward', reads: 'Send backwardCtrl+[' },
  { id: 'sendToBack', name: 'Send to back', reads: 'Send to backCtrl+Shift+[' },
]

/** The words of a row of any of the lists above, by its id. */
export function rowName(id: string) {
  const rows = [...FULL_MENU, RELEASE_MASK, ...Object.values(FULL_MENU_BESIDE).flat(), ...ARRANGE, ...ORDER_MENU]
  const row = rows.find((one) => one.id === id)
  if (!row) throw new Error(`no menu row ${id}`)
  return row.name
}
/** The full menu's rows for a selection, by their words: Ungroup only for a group or a box. */
export const fullMenuRows = ({ group = false } = {}) =>
  FULL_MENU.filter((row) => group || !row.group).map((row) => row.name)
/** The rows of the menu beside the full menu's row `more-<id>`, by their words: Text only for text layers. */
export const besideRows = (id: keyof typeof FULL_MENU_BESIDE, { text = false } = {}) =>
  FULL_MENU_BESIDE[id].filter((row) => text || !row.text).map((row) => row.name)
/**
 * Arrange ⋯'s rows for a selection, by their test ids: Line up only for one layer, the rotation
 * field unless a group or a boolean is selected, Text direction only for text.
 */
export const arrangeRows = ({ several = false, group = false, text = false } = {}) =>
  ARRANGE.filter(
    ({ only }) => (only !== 'one' || !several) && (only !== 'turns' || !group) && (only !== 'text' || text),
  ).map((row) => row.id)
/** The rows open Arrange ⋯ shows, in order, by the test ids `ARRANGE` names them by. */
export const arrangeRowsOf = (menu: Locator) =>
  menu
    .locator('[data-testid^="more-"], [data-scrub]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid') ?? 'rotation'))

/** A row of a menu by its id in the lists above: the first button whose name starts with its words. */
export const rowIn = (menu: Locator, id: string) =>
  menu.getByRole('button', { name: new RegExp(`^${rowName(id)}`) }).first()
/** The words of each row that shows in a menu, in order, as they read on screen: a key that shows reads too. */
export const shownRows = (menu: Locator) =>
  menu
    .locator('button')
    .evaluateAll((rows) =>
      rows.filter((row) => row.checkVisibility()).map((row) => (row as HTMLElement).innerText.trim()),
    )
/** How many of a menu's shortcut keys show. */
export const shownKeys = (menu: Locator) =>
  menu.locator('kbd').evaluateAll((keys) => keys.filter((key) => key.checkVisibility()).length)
/**
 * The rows of the open menus that the tooltip showing now covers, by their words: every row, back
 * row and field that shows in them, the tooltip's own menu's included. Empty while it covers none.
 */
export const rowsUnderTooltip = (page: Page) =>
  page.evaluate(() => {
    const tip = document.querySelector('[role="tooltip"]')?.parentElement
    if (!tip) return []
    const t = tip.getBoundingClientRect()
    return [...document.querySelectorAll('[data-radix-popper-content-wrapper] :is(button, [data-scrub])')]
      .filter((row) => !tip.contains(row) && row.checkVisibility())
      .filter((row) => {
        const r = row.getBoundingClientRect()
        const across = Math.min(r.right, t.right) - Math.max(r.left, t.left)
        const down = Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top)
        return across > 0.5 && down > 0.5
      })
      .map((row) => (row as HTMLElement).innerText.trim() || (row.getAttribute('aria-label') ?? ''))
  })
/** The words of the rows that show in a menu lit with a tint, as the hover tint lights a row under a pointer. */
export const litRows = (menu: Locator) =>
  menu
    .locator('button')
    .evaluateAll((rows) =>
      rows
        .filter((row) => row.checkVisibility() && getComputedStyle(row).backgroundColor !== 'rgba(0, 0, 0, 0)')
        .map((row) => (row as HTMLElement).innerText.trim()),
    )
