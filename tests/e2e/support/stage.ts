// Driving the editor stage with real pointer and keyboard input, for the selection and group
// checks (#40, #41): drags with modifiers pressed as a hand would, shortcut presses from the one
// table, and reading layers back from the document.
import { pressFor, type ShortcutAction } from '@dazbee/editor/shortcuts'
import type { DesignInput } from '@dazbee/schema'
import { expect, type Browser, type Locator, type Page } from '@playwright/test'
import { designOf, openTabs, placed, screenPoint } from './editor.ts'
import { DEV_BRAND, seed, type InBrand } from './seed.ts'

/**
 * Opens a fresh copy of a design in one tab, 1440 × 1000, with the camera where design pixels in
 * steps of 5 land on whole screen pixels, so drags measure exactly. The copy belongs to the brand
 * given, or the development brand.
 */
export async function openStage(browser: Browser, content: DesignInput, { brandId = DEV_BRAND }: InBrand = {}) {
  const { tabs, errors } = await openTabs(browser, 1, await seed(content, { brandId }), { brandId })
  const page = tabs[0] as Page
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => window.dazbee?.setCamera({ x: 100, y: 60, zoom: 0.8 }))
  await page.evaluate(() => window.dazbee?.drawn())
  return { page, errors }
}

export interface Design {
  nodes: Record<string, { parentId: string; index: string; lock?: Record<string, boolean>; props: Record<string, unknown> }>
  overrides: Record<string, Record<string, Record<string, unknown>>>
}
export const read = async (page: Page) => JSON.parse(await designOf(page)) as Design
export const props = async (page: Page, id: string) => placed(await read(page), id, 'sq') as { x: number; y: number; width: number; height: number; rotation?: number; visible?: boolean }
export const selection = (page: Page) => page.evaluate(() => window.dazbee?.selection() ?? [])
/** Presses an action's shortcut and waits for the redraw, so the handles stand where the box now is. */
export const press = async (page: Page, action: ShortcutAction) => {
  await page.keyboard.press(pressFor(action))
  await page.evaluate(() => window.dazbee?.drawn())
}
export const order = async (page: Page) => Object.entries((await read(page)).nodes)
  .filter(([, n]) => n.parentId === 'p1').sort(([a, x], [b, y]) => (x.index < y.index ? -1 : x.index > y.index ? 1 : a < b ? -1 : 1)).map(([id]) => id)

/**
 * Drags with the mouse between two design pixels of the square, in a few steps like a hand would.
 * Modifier keys go down once the drag has started, as a designer presses Shift mid-drag; with
 * `before` they are held from the press, as for a Shift marquee that adds to the selection.
 */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, modifiers: ('Shift' | 'Alt')[] = [], before = false) {
  const a = await screenPoint(page, from.x, from.y)
  const b = await screenPoint(page, to.x, to.y)
  await dragScreen(page, a, b, modifiers, before)
}
export async function dragScreen(page: Page, a: { x: number; y: number }, b: { x: number; y: number }, modifiers: ('Shift' | 'Alt')[] = [], before = false) {
  await page.mouse.move(a.x, a.y)
  if (before) for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2)
  if (!before) for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.mouse.up()
  for (const key of modifiers) await page.keyboard.up(key)
  await page.evaluate(() => window.dazbee?.drawn())
}
export async function click(page: Page, x: number, y: number, modifiers: 'Shift'[] = []) {
  const at = await screenPoint(page, x, y)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.click(at.x, at.y)
  for (const key of modifiers) await page.keyboard.up(key)
  await page.evaluate(() => window.dazbee?.drawn())
}
/** Where a handle of the selection box is on screen now. */
export async function handle(page: Page, which: string) {
  const box = await page.locator(`.selection .handle[data-handle="${which}"]`).boundingBox()
  if (!box) throw new Error(`no ${which} handle`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
export const zoomOf = (page: Page) => page.evaluate(() => window.dazbee?.camera().zoom ?? 1)

/** Opens the top bar's scope menu, unless it is open: all sizes or only this one, and its own changes. */
export async function scopeMenu(page: Page) {
  const menu = page.getByTestId('scope-menu')
  if (!(await menu.isVisible())) await page.getByTestId('scope-chip').click()
  return menu
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
 * Opens what one of the top bar's items opens, `bar-<id>`, unless it is open, and gives it once it
 * shows: its pop-up, or the edit panel. An item in the bar's second row is reached through ⋯.
 */
export async function barMenu(page: Page, id: string) {
  const menu = page.getByTestId(`bar-${id}-menu`)
  if (await menu.isVisible()) return menu
  const item = page.getByTestId(`bar-${id}`)
  if (!(await item.isVisible()) && (await page.getByTestId('bar-overflow').isVisible())) await page.getByTestId('bar-overflow').click()
  await item.click()
  await expect(menu).toBeVisible()
  return menu
}

/** Opens an edit panel from the top bar, `bar-<id>`, unless it is open, and gives the part of it with `testId`. */
export const panelPart = async (page: Page, id: string, testId: string) => (await barMenu(page, id)).getByTestId(testId)

/**
 * Closes the open pop-up or panel of an item on the top bar with Esc, by the item's test id
 * (`bar-align`, `bar-more`, or `more-order` for the menu beside that row of the full menu), and
 * waits until it is gone.
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

/** The stroke list, in the Outline panel, opened. */
export const strokeList = async (page: Page) => (await barMenu(page, 'outline')).getByTestId('stroke-list')

/** The menus beside the full menu's rows, by their test ids. */
const SUBMENUS = ['line-up', 'order']

/**
 * Clicks an action of the full menu, or of the right-click menu when `menu` is it, by the start of
 * its name (the first row that starts so): in the menu, or in the menu beside a row (Line up ▸,
 * Order ▸). The action closes the menu, and this waits until it has.
 */
export async function moreAction(page: Page, name: string, menu?: Locator) {
  const root = menu ?? (await moreMenu(page))
  const named = (within: Locator) => within.getByRole('button', { name: new RegExp(`^${name}`) }).first()
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

/** Where each of the selection's cards is now: the top bar's pop-up or edit panel that holds it. */
const HOLDER: Record<string, string> = {
  'layout-card': 'position', 'flow-card': 'position', 'appearance-card': 'transparency', 'spacing-card': 'spacing', 'text-box-card': 'spacing',
  'frame-card': 'box', 'auto-layout-card': 'stack', 'combine-card': 'combine-op', 'mask-card': 'mask', 'adjust-card': 'edit', 'look-card': 'edit',
  'fit-card': 'edit', 'photos-card': 'edit', 'text-fit-card': 'spacing', 'outline-look': 'outline', 'outline-card': 'outline',
  'effect-tiles': 'effects', 'effects-card': 'effects', 'brand-colours': 'colour', 'design-colours': 'colour', 'auto-layout-advanced': 'stack',
}

/**
 * One of the selection's cards, by its test id, in the pop-up or edit panel of the top bar that
 * holds it, opened: the shape's card in Shape (or a photo's Corners), the fills in Colour (or a
 * photo's Edit image panel).
 */
export async function openCard(page: Page, testId: string) {
  const has = async (id: string) => (await page.getByTestId(`bar-${id}`).count()) > 0
  const holder = testId === 'fill-card' ? ((await has('colour')) ? 'colour' : 'edit')
    : testId === 'shape-card' ? ((await has('shape')) ? 'shape' : 'corners')
      : testId === 'frame-card' && !(await has('box')) ? 'corners'
        : HOLDER[testId]
  if (!holder) throw new Error(`no top bar item holds ${testId}`)
  return (await barMenu(page, holder)).getByTestId(testId)
}
