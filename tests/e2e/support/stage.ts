// Driving the editor stage with real pointer and keyboard input, for the selection and group
// checks (#40, #41): drags with modifiers pressed as a hand would, shortcut presses from the one
// table, editor actions and selections through the page's editor, and reading layers and boxes
// back from the document.
import { type Browser, expect, type Page } from '@playwright/test'

import { pressFor, type ShortcutAction } from '@dazbee/editor/shortcuts'
import type { Design as Stored, DesignInput, Layer } from '@dazbee/schema'

import { designOf, openTabs, placed, screenPoint } from './editor.ts'
import { DEV_BRAND, type InBrand, seed } from './seed.ts'
import { openCard } from './top-bar.ts'

/**
 * A design as the editor stores it, each layer with what every layer has and its props loose, so a
 * test reads any layer's props without narrowing by its type.
 */
export interface Design extends Pick<Stored, 'meta' | 'pages' | 'frames'> {
  nodes: Record<
    string,
    Pick<Layer, 'type' | 'parentId' | 'link' | 'index' | 'name' | 'lock'> & {
      bindings?: Record<string, string>
      props: Record<string, unknown>
    }
  >
}

/** A layer's box in design pixels. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** What `selectLayers` does once the layers are selected. */
export interface SelectLayers {
  /** Waits until the top bar shows the selection, or until there is no top bar when it is empty. */
  bar?: boolean
  /** Opens the card with this test id, in the top bar's pop-up or panel that holds it. */
  card?: string
}

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

/** Waits until what the screen shows is up to date: after the pending redraw, if there is one. */
export const drawn = (page: Page) => page.evaluate(() => window.dazbee?.drawn())
/** Waits two animation frames, so what the page laid out after a change has been drawn. */
export const nextFrame = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
/**
 * Fits the shown page's frames once the editor has the chrome's insets for the page's size. After a resize
 * they reach the editor a frame or more later, and a fit made before then keeps clear of the old
 * size's chrome; once two fits two frames apart agree, the editor has them. The editor does not
 * expose its insets, so this relies on each step of their update landing within two frames.
 */
export async function fitSettled(page: Page) {
  const fit = () =>
    page.evaluate(() => {
      window.dazbee?.fitAll()
      return JSON.stringify(window.dazbee?.camera())
    })
  await expect
    .poll(async () => {
      const first = await fit()
      await nextFrame(page)
      return (await fit()) === first
    })
    .toBe(true)
}
export const read = async (page: Page) => JSON.parse(await designOf(page)) as Design
export const props = async (page: Page, id: string) =>
  placed(await read(page), id) as {
    x: number
    y: number
    width: number
    height: number
    rotation?: number
    visible?: boolean
  }
/** A layer's box as drawn in its frame, auto layout solved. */
export const boxOf = (page: Page, id: string) => page.evaluate((id) => window.dazbee?.boxOf(id), id) as Promise<Box>
export const selection = (page: Page) => page.evaluate(() => window.dazbee?.selection() ?? [])
/** Presses an action's shortcut and waits for the redraw, so the handles stand where the box now is. */
export const press = async (page: Page, action: ShortcutAction) => {
  await page.keyboard.press(pressFor(action))
  await drawn(page)
}
/** Does what an action's shortcut does through the page's editor, without a key, and waits for the redraw. */
export const perform = async (page: Page, action: ShortcutAction) => {
  await page.evaluate((action) => window.dazbee?.perform(action), action)
  await drawn(page)
}
/** The layers at the top of a frame, the square `sq` by default, back to front. */
export const order = async (page: Page, frameId = 'sq') =>
  Object.entries((await read(page)).nodes)
    .filter(([, n]) => n.parentId === frameId)
    .sort(([a, x], [b, y]) => (x.index < y.index ? -1 : x.index > y.index ? 1 : a < b ? -1 : 1))
    .map(([id]) => id)

/** Selects layers through the page's editor, in the frame of the first, then waits as the options say. */
export async function selectLayers(page: Page, ids: string[], { bar = false, card }: SelectLayers = {}) {
  await page.evaluate((ids) => window.dazbee?.select(ids), ids)
  if (bar && ids.length > 0) await expect(page.getByTestId('top-bar')).toHaveAttribute('data-selection', ids.join(' '))
  else if (bar) await expect(page.getByTestId('top-bar')).toHaveCount(0)
  if (card) await expect(await openCard(page, card)).toBeVisible()
}

/**
 * Drags with the mouse between two design pixels of the shown page's first frame, in a few steps
 * like a hand would.
 * Modifier keys go down once the drag has started, as a designer presses Shift mid-drag; with
 * `before` they are held from the press, as for a Shift marquee that adds to the selection.
 */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  modifiers: ('Shift' | 'Alt')[] = [],
  before = false,
) {
  const a = await screenPoint(page, from.x, from.y)
  const b = await screenPoint(page, to.x, to.y)
  await dragScreen(page, a, b, modifiers, before)
}
export async function dragScreen(
  page: Page,
  a: { x: number; y: number },
  b: { x: number; y: number },
  modifiers: ('Shift' | 'Alt')[] = [],
  before = false,
) {
  await page.mouse.move(a.x, a.y)
  if (before) for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2)
  if (!before) for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.mouse.up()
  for (const key of modifiers) await page.keyboard.up(key)
  await drawn(page)
}
export async function click(page: Page, x: number, y: number, modifiers: 'Shift'[] = []) {
  const at = await screenPoint(page, x, y)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.click(at.x, at.y)
  for (const key of modifiers) await page.keyboard.up(key)
  await drawn(page)
}
/** Where a handle of the selection box is on screen now. */
export async function handle(page: Page, which: string) {
  const box = await page.locator(`.selection .handle[data-handle="${which}"]`).boundingBox()
  if (!box) throw new Error(`no ${which} handle`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
export const zoomOf = (page: Page) => page.evaluate(() => window.dazbee?.camera().zoom ?? 1)

/**
 * Picks the shown page's first frame by a click on its empty area at a design pixel of it (`x`,
 * `y`, on no layer), and waits until the editor has it picked.
 */
export async function pickFrame(page: Page, x = 4, y = 4) {
  await click(page, x, y)
  await expect.poll(() => page.evaluate(() => window.dazbee?.pickedFrame() ?? null)).not.toBeNull()
}
