// Every control the top bar offers, and its one home for each kind of selection: on the bar itself,
// or in the pop-up or edit panel one of the bar's items opens. The specs that check where a control
// lives, and the ones that use Position, Align and Text style, read their controls from here.
import type { Locator, Page } from '@playwright/test'

import { entered } from './top-bar.ts'

/** Where a control lives: on the bar, or in what the bar's item with this key opens. */
export type Home = 'bar' | 'position' | 'align' | 'text-style' | 'line-up' | 'edit'

/** A control the bar offers: how a spec finds it, and its words or name where a spec reads them. */
export interface Control {
  find: string
  name?: string
}

/** The kinds of selection the bar has its own items for, as the one home spec selects them. */
export type BarCase = 'text' | 'shape' | 'photo' | 'photos' | 'box' | 'several' | 'locked'

/** The bar's controls, each by a selector that matches it wherever it is. */
export const CONTROLS = {
  font: { find: '[data-testid="bar-font"]' },
  size: { find: '[data-testid="bar-size"]' },
  colour: { find: '[data-testid="bar-colour"]' },
  textStyle: { find: '[data-testid="bar-text-style"]' },
  bold: { find: '[data-testid="bar-bold"]', name: 'Bold' },
  italic: { find: '[data-testid="bar-italic"]', name: 'Italic' },
  underline: { find: '[data-testid="bar-underline"]', name: 'Underline' },
  strikethrough: { find: '[data-testid="bar-strikethrough"]', name: 'Strikethrough' },
  align: { find: '[data-testid="text-align"]', name: 'Align' },
  direction: { find: '[data-testid="text-direction"]', name: 'Direction' },
  vertical: { find: '[data-testid="text-vertical"]', name: 'Vertical' },
  list: { find: '[data-testid="bar-list"]' },
  case: { find: '[data-testid="bar-case"]' },
  spacing: { find: '[data-testid="bar-spacing"]' },
  edit: { find: '[data-testid="bar-edit"]' },
  replace: { find: 'button[aria-label="Replace the image"]' },
  crop: { find: '[data-testid="bar-crop"]' },
  corners: { find: '[data-testid="bar-corners"]' },
  shape: { find: '[data-testid="bar-shape"]' },
  boxCard: { find: '[data-testid="bar-box"]' },
  stackPanel: { find: '[data-testid="bar-stack"]' },
  outline: { find: '[data-testid="bar-outline"]' },
  effects: { find: '[data-testid="bar-effects"]' },
  transparency: { find: '[data-testid="bar-transparency"]' },
  stack: { find: '[data-action="autoLayout"]' },
  lineUp: { find: '[data-testid="bar-line-up"]' },
  position: { find: '[data-testid="bar-position"]' },
  locked: { find: '[data-testid="bar-locked"]' },
  unlock: { find: '[data-testid="bar-unlock"]' },
  width: { find: '[role="spinbutton"][aria-label="Width"]', name: 'Width' },
  height: { find: '[role="spinbutton"][aria-label="Height"]', name: 'Height' },
  x: { find: '[role="spinbutton"][aria-label="X position"]', name: 'X position' },
  y: { find: '[role="spinbutton"][aria-label="Y position"]', name: 'Y position' },
  rotation: { find: '[role="spinbutton"][aria-label="Rotation in degrees"]', name: 'Rotation in degrees' },
  lockRatio: { find: '[data-testid="lock-ratio"]', name: 'Lock ratio' },
  bringForward: { find: '[data-action="bringForward"]', name: 'Forward' },
  sendBackward: { find: '[data-action="sendBackward"]', name: 'Backward' },
  bringToFront: { find: '[data-action="bringToFront"]', name: 'To front' },
  sendToBack: { find: '[data-action="sendToBack"]', name: 'To back' },
  alignLeft: { find: '[data-action="alignLeft"]', name: 'Left' },
  alignCentre: { find: '[data-action="alignCentre"]', name: 'Centre' },
  alignRight: { find: '[data-action="alignRight"]', name: 'Right' },
  alignTop: { find: '[data-action="alignTop"]', name: 'Top' },
  alignMiddle: { find: '[data-action="alignMiddle"]', name: 'Middle' },
  alignBottom: { find: '[data-action="alignBottom"]', name: 'Bottom' },
  distributeHorizontal: { find: '[data-action="distributeHorizontal"]' },
  distributeVertical: { find: '[data-action="distributeVertical"]' },
} as const satisfies Record<string, Control>

export type ControlId = keyof typeof CONTROLS

/** Position's numbers, in order: W, H, X, Y and Rotate, then Lock ratio. */
export const POSITION_NUMBERS = ['width', 'height', 'x', 'y', 'rotation'] as const satisfies readonly ControlId[]
/** Position's Order moves, in order, two to a row. */
export const ORDER_MOVES = [
  'bringForward',
  'sendBackward',
  'bringToFront',
  'sendToBack',
] as const satisfies readonly ControlId[]
/** Position's Line up with the frame, in order: Left, Centre, Right, then Top, Middle, Bottom. */
export const FRAME_LINE_UP = [
  'alignLeft',
  'alignCentre',
  'alignRight',
  'alignTop',
  'alignMiddle',
  'alignBottom',
] as const satisfies readonly ControlId[]
/** Text style's four toggles, in order. */
export const TEXT_STYLES = ['bold', 'italic', 'underline', 'strikethrough'] as const satisfies readonly ControlId[]
/** The text's Align pop-up's three labelled rows, in order. */
export const ALIGN_ROWS = ['align', 'direction', 'vertical'] as const satisfies readonly ControlId[]

/** What Position holds for one layer that turns: its numbers, Lock ratio, Order, Line up. */
const POSITION_ONE = Object.fromEntries(
  [...POSITION_NUMBERS, 'lockRatio', ...ORDER_MOVES, ...FRAME_LINE_UP].map((id) => [id, 'position']),
) as Record<ControlId, Home>
/** What Position holds for several layers: no Line up, since theirs is on the bar. */
const POSITION_SEVERAL = Object.fromEntries(
  [...POSITION_NUMBERS, 'lockRatio', ...ORDER_MOVES].map((id) => [id, 'position']),
) as Record<ControlId, Home>
const ON_BAR = (...ids: ControlId[]) => Object.fromEntries(ids.map((id) => [id, 'bar'])) as Record<ControlId, Home>

/** Each kind of selection's controls, each with its one home. */
export const HOMES: Record<BarCase, Partial<Record<ControlId, Home>>> = {
  text: {
    ...ON_BAR('font', 'size', 'colour', 'textStyle', 'list', 'case', 'spacing', 'effects', 'transparency', 'position'),
    ...Object.fromEntries(TEXT_STYLES.map((id) => [id, 'text-style'])),
    ...Object.fromEntries(ALIGN_ROWS.map((id) => [id, 'align'])),
    ...POSITION_ONE,
  },
  shape: { ...ON_BAR('colour', 'outline', 'shape', 'effects', 'transparency', 'position'), ...POSITION_ONE },
  photo: {
    ...ON_BAR('edit', 'replace', 'crop', 'corners', 'outline', 'effects', 'transparency', 'position'),
    ...POSITION_ONE,
  },
  photos: { ...ON_BAR('edit', 'replace', 'corners', 'outline', 'effects', 'transparency'), ...POSITION_SEVERAL },
  box: {
    ...ON_BAR('colour', 'outline', 'stackPanel', 'boxCard', 'effects', 'transparency', 'position'),
    ...POSITION_ONE,
  },
  several: {
    ...ON_BAR('colour', 'outline', 'effects', 'transparency', 'stack', 'lineUp', 'position'),
    ...Object.fromEntries(
      [...FRAME_LINE_UP, 'distributeHorizontal', 'distributeVertical'].map((id) => [id, 'line-up']),
    ),
    ...POSITION_SEVERAL,
  },
  locked: { ...ON_BAR('locked', 'unlock', 'position'), ...POSITION_ONE },
}

/** The bar's items by their keys, in order, as the bar shows them. */
export const barItems = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="top-bar"] [data-item]')].map((el) => el.dataset.item),
  )

/** A control by its id, inside what holds it. */
export const control = (within: Locator | Page, id: ControlId) => within.locator(CONTROLS[id].find)

/** Closes whatever the bar has open with Esc, one thing at a time, never letting the selection go. */
async function closeAll(page: Page) {
  const open = () =>
    page.evaluate(
      () =>
        document.querySelector('[data-radix-popper-content-wrapper]') !== null ||
        (document.getElementById('edit-panel')?.checkVisibility() ?? false),
    )
  for (let i = 0; i < 6 && (await open()); i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }
}

/** How many of each control show in what a locator holds. */
async function countIn(within: Locator, ids: readonly ControlId[]) {
  const counts = new Map<ControlId, number>()
  for (const id of ids) {
    const n = await control(within, id).evaluateAll((els) => els.filter((el) => el.checkVisibility()).length)
    if (n > 0) counts.set(id, n)
  }
  return counts
}

/**
 * Where each control shows for the selection now, by opening every item of the bar that opens
 * something and every menu beside a row in it: a control's homes, each as many times as it shows
 * there. The bar's own items are counted with nothing open.
 */
export async function homesOf(page: Page) {
  const ids = Object.keys(CONTROLS) as ControlId[]
  const found = new Map<ControlId, Home[]>()
  const add = (home: string, counts: Map<ControlId, number>) => {
    for (const [id, n] of counts) found.set(id, [...(found.get(id) ?? []), ...Array<Home>(n).fill(home as Home)])
  }
  const bar = page.getByTestId('top-bar')
  if (await page.getByTestId('bar-overflow').isVisible()) await page.getByTestId('bar-overflow').click()
  add('bar', await countIn(bar, ids))
  for (const key of await barItems(page)) {
    if (!key || key.startsWith('divider')) continue
    const button = bar.locator(`[data-item="${key}"] > *`).first()
    const opens = await button.evaluate(
      (el) => el.getAttribute('aria-controls') === 'edit-panel' || el.getAttribute('aria-haspopup') === 'dialog',
    )
    // Replace opens the image picker, which holds pictures, not controls.
    if (!opens || key === 'replace') continue
    if (await page.getByTestId('bar-overflow').isVisible()) {
      if (!(await button.isVisible())) await page.getByTestId('bar-overflow').click()
    }
    await button.click()
    const panel = (await button.getAttribute('aria-controls')) === 'edit-panel'
    const holder = panel ? page.locator('#edit-panel') : page.getByTestId(`bar-${key}-menu`)
    await holder.waitFor()
    await entered(holder)
    add(key, await countIn(holder, ids))
    // The menus beside its rows count as its own.
    const rows = holder.locator('[data-testid^="more-"][aria-haspopup]')
    for (let i = 0; i < (await rows.count()); i++) {
      const row = rows.nth(i)
      const beside = page.getByTestId(`${await row.getAttribute('data-testid')}-menu`)
      await row.click()
      if (!(await beside.isVisible().catch(() => false))) continue
      add(key, await countIn(beside, ids))
      await page.keyboard.press('Escape')
    }
    await closeAll(page)
  }
  return Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)))
}

/** The homes `HOMES` names for a selection, in the shape `homesOf` reads them in. */
export const expectedHomes = (which: BarCase) =>
  Object.fromEntries(
    Object.entries(HOMES[which])
      .map(([id, home]) => [id, [home]] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  )
