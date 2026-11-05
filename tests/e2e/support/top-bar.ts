// Opening what the editor's top bar, its menus and the pills over the stage open, as a person does:
// each opener clicks its item unless what it opens shows, and gives it once it shows. And the
// pieces of the editor the top bar specs check never meet.
import { expect, type Locator, type Page } from '@playwright/test'

import { EDITOR_CHROME } from './layout.ts'
import { FULL_MENU_BESIDE } from './menu-rows.ts'

/** The editor's chrome and the pieces of the top bar, small menu and edit panel that must never meet. */
export const PIECES = {
  ...EDITOR_CHROME,
  'top bar': '[data-testid="top-bar-row"]',
  'second row': '[data-testid="top-bar-overflow"]',
  'pop-up': '[data-radix-popper-content-wrapper]',
  'small menu': '[data-testid="small-menu"]',
  'edit panel': '#edit-panel',
  flyout: '#editor-flyout',
  toasts: '[data-toasts] > *',
}
/** The design's name and the font's name end in "…" by design when there is no room. */
export const UNCUT = 'h1, [data-testid="bar-font"], [data-testid="edit-panel-note"]'

/**
 * The menus beside a menu's rows that `moreAction` looks in, by their test ids: the full menu's
 * Copy, Paste and Copy to other frames, and Arrange's Line up and Order.
 */
const SUBMENUS = [...Object.keys(FULL_MENU_BESIDE), 'line-up', 'order']

/** Where each of the selection's cards is now: the top bar's pop-up or edit panel that holds it. */
const HOLDER: Record<string, string> = {
  'layout-card': 'position',
  'flow-card': 'position',
  'appearance-card': 'transparency',
  'spacing-card': 'spacing',
  'text-box-card': 'spacing',
  'box-card': 'box',
  'auto-layout-card': 'stack',
  'combine-card': 'combine-op',
  'mask-card': 'mask',
  'adjust-card': 'edit',
  'look-card': 'edit',
  'photos-card': 'edit',
  'text-fit-card': 'spacing',
  'stroke-look': 'outline',
  'stroke-card': 'outline',
  'effect-tiles': 'effects',
  'effects-card': 'effects',
  'brand-colours': 'colour',
  'design-colours': 'colour',
  'auto-layout-advanced': 'stack',
}

/** Opens the zoom pill's menu: the zooms, the rulers and snapping. */
export async function zoomMenu(page: Page) {
  const menu = page.getByTestId('zoom-menu')
  if (!(await menu.isVisible())) await page.getByTestId('zoom').click()
  return menu
}

/**
 * Opens the full menu from the small menu's ⋯, unless it is open, and gives it once it shows: the
 * selected layers' own actions. A row that closes it is waited out by its caller, so a menu still
 * closing is never taken for an open one.
 */
export async function moreMenu(page: Page) {
  const menu = page.getByTestId('bar-more-menu')
  if (!(await menu.isVisible())) await page.getByTestId('bar-more').click()
  await expect(menu).toBeVisible()
  return menu
}

/**
 * Hides the dock and the rail, which the full menu lies over on a phone, so a layout check sees
 * the rest; '' shows them again.
 */
export const underPhoneMenu = (page: Page, visibility: 'hidden' | '') =>
  page.evaluate((to) => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-dock], [data-testid="rail"]'))
      el.style.visibility = to
  }, visibility)

/**
 * Waits until an element and what it holds have played their entrances (a pop-up pops in scaled
 * and raised), so the boxes measured in it are where they stay. Only animations that end at a time
 * count: endless ones and those driven by scrolling, as the scroll bars' are, are left out.
 */
const entered = (locator: Locator) =>
  locator.evaluate(async (el) => {
    const entrances = el.getAnimations({ subtree: true }).filter((animation) => {
      const end = animation.effect?.getComputedTiming().endTime
      return typeof end === 'number' && Number.isFinite(end)
    })
    await Promise.all(entrances.map((animation) => animation.finished.catch(() => undefined)))
  })

/**
 * Opens what one of the top bar's items opens, `bar-<id>`, unless it is open, and gives it once it
 * shows: its pop-up, or the edit panel. An item in the bar's second row is reached through ⋯.
 */
export async function barMenu(page: Page, id: string) {
  const menu = page.getByTestId(`bar-${id}-menu`)
  if (!(await menu.isVisible())) {
    const item = page.getByTestId(`bar-${id}`)
    if (!(await item.isVisible()) && (await page.getByTestId('bar-overflow').isVisible()))
      await page.getByTestId('bar-overflow').click()
    await item.click()
    await expect(menu).toBeVisible()
  }
  await entered(menu)
  return menu
}

/**
 * Closes the open pop-up or panel of an item on the top bar with Esc, by the item's test id
 * (`bar-align`, `bar-more`, or `more-order` for the menu beside that row of Arrange ⋯), and waits
 * until it is gone.
 */
export async function closeBarMenu(page: Page, button: string) {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId(`${button}-menu`)).toBeHidden()
}

/** The fill list: in the Colour panel, or a photo's in its Edit image panel, opened. */
export const fillList = async (page: Page) => {
  const panel = await barMenu(page, (await page.getByTestId('bar-colour').count()) > 0 ? 'colour' : 'edit')
  return panel.getByTestId('fill-list')
}

/** The Pages panel, from Pages by the zoom pill: opened. */
export async function pagesPanel(page: Page) {
  const panel = page.getByTestId('bar-pages-menu')
  if (!(await panel.isVisible())) await page.getByTestId('pages-button').click()
  await expect(panel).toBeVisible()
  return panel
}

/** The text colour's hex field, in the Colour panel, under its +: opened. */
export async function textColourHex(page: Page) {
  const panel = await barMenu(page, 'colour')
  const field = panel.getByRole('textbox', { name: 'Text colour hex' })
  if (!(await field.isVisible())) await panel.getByTestId('colour-pick').click()
  return field
}

/** The outline list, in the Outline panel, opened. */
export const strokeList = async (page: Page) => (await barMenu(page, 'outline')).getByTestId('stroke-list')

/**
 * Clicks an action of the full menu, or of the right-click menu or Arrange ⋯ when `menu` is it, by
 * the start of its name (the first row that starts so, leaving out rows that open a menu beside
 * them and greyed rows): in the menu, or in the menu beside a row (the full menu's Copy ▸, Paste ▸
 * and Copy to other frames ▸, Arrange's Line up ▸ and Order ▸). The action closes the menu, and
 * this waits until it has.
 */
export async function moreAction(page: Page, name: string, menu?: Locator) {
  const root = menu ?? (await moreMenu(page))
  const named = (within: Locator) =>
    within
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .and(within.locator('button:not([aria-haspopup]):not([aria-disabled="true"])'))
      .first()
  const run = async (action: Locator) => {
    await action.click()
    await expect(root).toBeHidden()
  }
  if ((await named(root).count()) > 0) return run(named(root))
  for (const id of SUBMENUS) {
    const row = root.getByTestId(`more-${id}`)
    if ((await row.count()) === 0) continue
    const beside = page.getByTestId(`more-${id}-menu`)
    await row.click()
    await expect(beside).toBeVisible()
    if ((await named(beside).count()) > 0) return run(named(beside))
    await page.keyboard.press('Escape')
    await expect(beside).toBeHidden()
  }
  throw new Error(`no ${name} in the menu`)
}

/** Opens the menu beside one of the full menu's rows, `more-<id>`, and gives it once it shows. */
export async function moreSubmenu(page: Page, id: string) {
  const sub = page.getByTestId(`more-${id}-menu`)
  if (!(await sub.isVisible())) await (await moreMenu(page)).getByTestId(`more-${id}`).click()
  await expect(sub).toBeVisible()
  return sub
}

/**
 * Opens the top bar's Arrange ⋯ for the selected layers, unless it is open, and gives it once it
 * shows: how they sit (Order ▸, Line up ▸, the rotation field, Text direction ▸). On a phone it is a
 * sheet.
 */
export const arrangeMenu = (page: Page) => barMenu(page, 'arrange')

/** Opens the menu beside one of Arrange ⋯'s rows, `more-<id>` (order, line-up, text-direction), and gives it once it shows. */
export async function arrangeSubmenu(page: Page, id: string) {
  const sub = page.getByTestId(`more-${id}-menu`)
  if (!(await sub.isVisible())) await (await arrangeMenu(page)).getByTestId(`more-${id}`).click()
  await expect(sub).toBeVisible()
  return sub
}

/**
 * One of the selection's cards, by its test id, in the pop-up or edit panel of the top bar that
 * holds it, opened: the shape's card in Shape (or a photo's Corners), the fills in Colour (or a
 * photo's Edit image panel).
 */
export async function openCard(page: Page, testId: string) {
  const has = async (id: string) => (await page.getByTestId(`bar-${id}`).count()) > 0
  const holder =
    testId === 'fill-card'
      ? (await has('colour'))
        ? 'colour'
        : 'edit'
      : testId === 'shape-card'
        ? (await has('shape'))
          ? 'shape'
          : 'corners'
        : testId === 'box-card' && !(await has('box'))
          ? 'corners'
          : HOLDER[testId]
  if (!holder) throw new Error(`no top bar item holds ${testId}`)
  return (await barMenu(page, holder)).getByTestId(testId)
}
