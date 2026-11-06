// The rows every menu of the app shows, in order, as the specs check them: the full menu (the
// small menu's ⋯ and a right-click on a layer) with the menus beside its rows, the right-click menu
// on empty canvas, Share, the shape menu, the zoom menu, a page card's ⋯ and a library tile's ⋯;
// and readers of the rows a menu shows. A picked frame's ⋯ keeps its own list in
// frames-on-canvas.ts, and the top bar's controls are in bar-homes.ts.
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
  { id: 'selectLinkedCopies', name: 'Select copies', reads: 'Select copiesCtrl+Alt+A' },
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
/** The right-click menu's one row on empty canvas, while the frame there has hidden layers. */
export const CANVAS_MENU: readonly Row[] = [
  { id: 'showHidden', name: 'Show hidden layers', reads: 'Show hidden layers' },
]
/** Share's rows, by their test ids. */
export const SHARE_MENU: readonly Row[] = [
  { id: 'export-open', name: 'Export', reads: 'Export' },
  { id: 'template-open', name: 'Save as template', reads: 'Save as template' },
]
/** The dock's shape menu, by each row's `data-shape`: one is picked, the shape the tool draws. */
export const SHAPE_MENU: readonly Row[] = [
  { id: 'rect', name: 'Rectangle', reads: 'RectangleR' },
  { id: 'ellipse', name: 'Ellipse', reads: 'EllipseO' },
  { id: 'box', name: 'Box', reads: 'Box' },
  { id: 'polygon', name: 'Polygon', reads: 'Polygon' },
  { id: 'star', name: 'Star', reads: 'Star' },
  { id: 'line', name: 'Line', reads: 'LineL' },
  { id: 'arrow', name: 'Arrow', reads: 'ArrowShift+L' },
]
/** The zoom menu: its zooms, then the two rows that turn the rulers and snapping on and off. */
export const ZOOM_MENU: readonly (Row & { check?: true })[] = [
  { id: 'zoomIn', name: 'Zoom in', reads: 'Zoom inCtrl+=' },
  { id: 'zoomOut', name: 'Zoom out', reads: 'Zoom outCtrl+-' },
  { id: 'zoomFit', name: 'Zoom to fit', reads: 'Zoom to fitShift+1' },
  { id: 'zoomSelection', name: 'Zoom to selection', reads: 'Zoom to selectionShift+2' },
  { id: 'zoom100', name: 'Zoom to 100%', reads: 'Zoom to 100%Ctrl+0' },
  { id: 'rulers', name: 'Rulers', reads: 'RulersShift+R', check: true },
  { id: 'snap', name: 'Snap while dragging', reads: 'Snap while dragging', check: true },
]
/** A page card's ⋯ on the Pages card, the last after a line. */
export const PAGE_MENU: readonly Row[] = [
  { id: 'rename', name: 'Rename', reads: 'Rename' },
  { id: 'duplicate', name: 'Duplicate page', reads: 'Duplicate page' },
  { id: 'moveUp', name: 'Move up', reads: 'Move up' },
  { id: 'moveDown', name: 'Move down', reads: 'Move down' },
  { id: 'remove', name: 'Delete page', reads: 'Delete page' },
]
/** Why a page card's ⋯ greys a row, by the row's id. */
export const PAGE_MENU_WHY = {
  moveUp: 'This page is first already',
  moveDown: 'This page is last already',
  remove: 'A design keeps at least one page',
} as const
/** A library tile's ⋯, for a design; a template's has no Duplicate. */
export const TILE_MENU: readonly (Row & { design?: true })[] = [
  { id: 'rename', name: 'Rename', reads: 'Rename' },
  { id: 'duplicate', name: 'Duplicate', reads: 'Duplicate', design: true },
  { id: 'delete', name: 'Delete', reads: 'Delete' },
]

/** The words of the row with this id in one of the lists above. */
export const nameOf = (rows: readonly Row[], id: string) => rows.find((row) => row.id === id)?.name ?? id
/** The words of a row of any of the lists above, by its id. */
export function rowName(id: string) {
  const rows = [...FULL_MENU, RELEASE_MASK, ...Object.values(FULL_MENU_BESIDE).flat()]
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
/** The first menu item of a menu whose words start with `name`, of any kind: a row, a check or a pick. */
export const namedRow = (menu: Locator, name: string) =>
  menu
    .locator('[role^="menuitem"]')
    .filter({ hasText: new RegExp(`^${name}`) })
    .first()
/** A row of a menu by its id in the lists above: the first menu item whose words start with its words. */
export const rowIn = (menu: Locator, id: string) => namedRow(menu, rowName(id))
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
