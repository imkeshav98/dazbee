// The rows the editor's layer menus show, in order, as the specs check them: the full menu (the
// small menu's ⋯ and a right-click on a layer) with the menus beside its rows, and the top bar's
// Arrange ⋯ with the moves beside its Order. A picked frame's ⋯ keeps its own list in
// frames-on-canvas.ts.
import type { Locator } from './test.ts'

/** A row of a menu: its words, and how it reads with its key after them. */
export interface Row {
  name: string
  reads: string
}

/**
 * The full menu's rows in order, by their words and as each reads with its key; `group` marks
 * Ungroup, there only for a group or a box.
 */
export const FULL_MENU: readonly (Row & { group?: true })[] = [
  { name: 'Copy', reads: 'Copy' },
  { name: 'Paste', reads: 'Paste' },
  { name: 'Duplicate', reads: 'DuplicateCtrl+D' },
  { name: 'Copy to other frames', reads: 'Copy to other frames' },
  { name: 'Put in a box', reads: 'Put in a boxCtrl+Alt+G' },
  { name: 'Ungroup', reads: 'UngroupCtrl+Shift+G', group: true },
  { name: 'Use as mask', reads: 'Use as maskCtrl+Alt+M' },
  { name: 'Lock in all frames', reads: 'Lock in all framesCtrl+Alt+Shift+L' },
  { name: 'Hide in all frames', reads: 'Hide in all framesCtrl+Alt+Shift+H' },
  { name: 'Delete from all frames', reads: 'Delete from all frames' },
]
/**
 * The rows of the menus beside the full menu's rows, by the test id of the row that opens each
 * (`more-<id>`); `text` marks Copy to other frames ▸ Text, there only for text layers.
 */
export const FULL_MENU_BESIDE: Record<'copy' | 'paste' | 'copy-to-frames', readonly (Row & { text?: true })[]> = {
  copy: [
    { name: 'Copy', reads: 'CopyCtrl+C' },
    { name: 'Copy style', reads: 'Copy styleCtrl+Alt+C' },
  ],
  paste: [
    { name: 'Paste', reads: 'PasteCtrl+V' },
    { name: 'Paste style', reads: 'Paste styleCtrl+Alt+V' },
  ],
  'copy-to-frames': [
    { name: 'Style', reads: 'StyleCtrl+Alt+Shift+C' },
    { name: 'Text', reads: 'TextCtrl+Alt+Shift+T', text: true },
    { name: 'Layer', reads: 'Layer' },
  ],
}
/**
 * Arrange ⋯'s rows in order, by their test ids (`rotation` for the rotation field, which has none):
 * Order ▸; Line up ▸ for one layer (`one`); the rotation field unless a group or a boolean is
 * selected (`turns`); Text direction ▸ for text (`text`).
 */
export const ARRANGE: readonly { id: string; only?: 'one' | 'turns' | 'text' }[] = [
  { id: 'more-order' },
  { id: 'more-line-up', only: 'one' },
  { id: 'rotation', only: 'turns' },
  { id: 'more-text-direction', only: 'text' },
]
/** The moves in the menu beside Arrange's Order, in order, by their words and as each reads with its key. */
export const ORDER_MENU: readonly Row[] = [
  { name: 'Bring to front', reads: 'Bring to frontCtrl+Shift+]' },
  { name: 'Bring forward', reads: 'Bring forwardCtrl+]' },
  { name: 'Send backward', reads: 'Send backwardCtrl+[' },
  { name: 'Send to back', reads: 'Send to backCtrl+Shift+[' },
]

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
