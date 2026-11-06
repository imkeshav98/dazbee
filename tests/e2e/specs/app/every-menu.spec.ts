// Every menu of the app on the shared menu, in Chromium, each read from its list in
// support/menu-rows.ts: the full menu, a picked frame's ⋯, Share, the shape menu, the zoom menu,
// a page card's ⋯ and a library tile's ⋯. By the keyboard each opens from its button with the focus
// on its first row (the shape menu on the picked shape), lists its rows in order as menu items,
// moves through them by the arrows, Home, End and typing, and Esc closes it onto its button; it
// takes the page's direction in Arabic; on a phone its rows are a finger's height with no keys. The
// actions that change the design (Duplicate in the full menu and a frame's ⋯, Move down on a page
// card, Show hidden layers on empty canvas) undo and redo in one step, and a page card's greyed rows
// say why.
import { photo, upload } from '../../support/assets.ts'
import { setCookies } from '../../support/editor.ts'
import { clickLabel, FRAME_MENU, openSized } from '../../support/frames-on-canvas.ts'
import { open, redo, undo } from '../../support/linked-menu.ts'
import { linkedMenuDesign } from '../../support/linked-menu-design.ts'
import {
  CANVAS_MENU,
  fullMenuRows,
  PAGE_MENU,
  PAGE_MENU_WHY,
  SHAPE_MENU,
  SHARE_MENU,
  TILE_MENU,
  ZOOM_MENU,
} from '../../support/menu-rows.ts'
import { DEV_BRAND } from '../../support/seed.ts'
import { fitSettled, selectLayers } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'
import { entered, pagesPanel } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 150_000 })

const PHONE = { width: 390, height: 844 }

/** A menu of the editor: how to bring up its button, its button, its rows' words with keys, a letter and the row it jumps to. */
interface EditorMenu {
  name: string
  ready: (page: Page) => Promise<void>
  button: (page: Page) => Locator
  rows: () => string[]
  jump: [string, string]
  /** The row the focus opens on, when it is not the first. */
  first?: string
}

const MENUS: EditorMenu[] = [
  {
    name: 'the full menu',
    ready: (page) => selectLayers(page, ['headline']),
    button: (page) => page.getByTestId('bar-more'),
    rows: () => fullMenuRows(),
    jump: ['h', 'Hide in all frames'],
  },
  {
    name: "a picked frame's ⋯",
    ready: (page) => clickLabel(page, 'sq'),
    button: (page) => page.getByTestId('bar-frame-more'),
    rows: () => FRAME_MENU.map((row) => row.name),
    jump: ['r', 'Rename'],
  },
  {
    name: 'Share',
    ready: async () => {},
    button: (page) => page.getByTestId('share-open'),
    rows: () => SHARE_MENU.map((row) => row.name),
    jump: ['s', 'Save as template'],
  },
  {
    name: 'the shape menu',
    ready: async () => {},
    button: (page) => page.getByTestId('shape-menu'),
    rows: () => SHAPE_MENU.map((row) => row.name),
    jump: ['s', 'Star'],
    first: 'Rectangle',
  },
  {
    name: 'the zoom menu',
    ready: async () => {},
    button: (page) => page.getByTestId('zoom'),
    rows: () => ZOOM_MENU.map((row) => row.name),
    jump: ['r', 'Rulers'],
  },
  {
    name: "a page card's ⋯",
    ready: async (page) => {
      await pagesPanel(page)
    },
    button: (page) =>
      page
        .getByTestId('pages')
        .locator('[data-page]')
        .first()
        .getByRole('button', { name: /^More for / }),
    rows: () => PAGE_MENU.map((row) => row.name),
    jump: ['d', 'Duplicate page'],
  },
]

/** The menu open now. */
const openMenu = (page: Page) => page.getByRole('menu').last()
/** The words of a menu's rows, without their keys, in order. */
const words = (menu: Locator) =>
  menu
    .locator('[role^="menuitem"]')
    .evaluateAll((rows) =>
      rows.map((row) => [...row.childNodes].find((n) => n.textContent?.trim())?.textContent?.trim() ?? ''),
    )
/** The words of the row that has the focus, without its key. */
const focusedRow = (page: Page) =>
  page.evaluate(() => {
    const row = document.activeElement
    return row ? ([...row.childNodes].find((n) => n.textContent?.trim())?.textContent?.trim() ?? '') : ''
  })

/** Opens the linked menu design, in Arabic when asked, at a size, its page fitted. */
async function openAt(browser: Parameters<typeof open>[0], size = { width: 1280, height: 760 }, arabic = false) {
  const opened = await open(browser)
  if (arabic) {
    await setCookies(opened.page, { locale: 'ar' })
    await opened.page.reload()
    await expect(opened.page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  }
  await opened.page.setViewportSize(size)
  await fitSettled(opened.page)
  return opened
}

/** Opens a menu from its button by the keyboard and gives it once its focus is on a row. */
async function openByKeys(page: Page, menu: EditorMenu) {
  await menu.ready(page)
  await menu.button(page).focus()
  await page.keyboard.press('Enter')
  const opened = openMenu(page)
  await expect(opened).toBeVisible()
  await entered(opened)
  await expect.poll(() => focusedRow(page)).not.toBe('')
  return opened
}

for (const menu of MENUS)
  test(`${menu.name} lists its rows, moves through them by the keyboard and closes onto its button`, async ({
    browser,
  }) => {
    const { page, errors } = await openAt(browser)
    const opened = await openByKeys(page, menu)
    const rows = menu.rows()
    expect(await words(opened)).toEqual(rows)
    await expect.poll(() => focusedRow(page)).toBe(menu.first ?? rows[0])
    for (const [key, row] of [
      ['End', rows.at(-1)],
      ['ArrowDown', rows[0]],
      ['ArrowUp', rows.at(-1)],
      ['Home', rows[0]],
      ['ArrowDown', rows[1]],
    ] as const) {
      await page.keyboard.press(key)
      await expect.poll(() => focusedRow(page), key).toBe(row)
    }
    await page.waitForTimeout(1100)
    await page.keyboard.press(menu.jump[0])
    await expect.poll(() => focusedRow(page), menu.jump[0]).toBe(menu.jump[1])
    await page.keyboard.press('Escape')
    await expect(opened).toBeHidden()
    await expect(menu.button(page)).toBeFocused()
    expect(errors).toEqual([])
  })

test('every menu takes the page’s direction in Arabic, the down arrow still moving down', async ({ browser }) => {
  const { page, errors } = await openAt(browser, undefined, true)
  for (const menu of MENUS) {
    const opened = await openByKeys(page, menu)
    await expect(opened, menu.name).toHaveAttribute('dir', 'rtl')
    const first = await focusedRow(page)
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focusedRow(page), menu.name).not.toBe(first)
    await page.keyboard.press('Escape')
    await expect(opened).toBeHidden()
    await expect(menu.button(page)).toBeFocused()
  }
  expect(errors).toEqual([])
})

test('on a phone every menu opens by a tap with its rows a finger’s height and no keys', async ({ browser }) => {
  const asset = await upload(photo)
  const { page: tab, errors } = await openSized(browser, PHONE, {
    input: linkedMenuDesign(asset.id),
    touch: true,
    mobile: true,
  })
  for (const menu of MENUS) {
    await menu.ready(tab)
    await menu.button(tab).tap()
    const opened = openMenu(tab)
    await expect(opened, menu.name).toBeVisible()
    await entered(opened)
    const heights = await opened
      .locator('[role^="menuitem"]')
      .evaluateAll((rows) =>
        rows.filter((row) => row.checkVisibility()).map((row) => row.getBoundingClientRect().height),
      )
    for (const height of heights) expect(height, menu.name).toBeGreaterThanOrEqual(44)
    const keys = await opened.locator('kbd').evaluateAll((all) => all.filter((key) => key.checkVisibility()).length)
    expect(keys, menu.name).toBe(0)
    await tab.keyboard.press('Escape')
    await expect(opened).toBeHidden()
  }
  expect(errors).toEqual([])
})

test.describe('the actions a menu runs undo and redo in one step', () => {
  /** How many layers, frames and pages the tab's design holds, and the pages' order and hidden layers. */
  const counts = (page: Page) =>
    page.evaluate(() => {
      const design = window.dazbee?.design()
      if (!design) return null
      const order = Object.entries(design.pages)
        .sort(([, a], [, b]) => (a.order < b.order ? -1 : 1))
        .map(([id]) => id)
      const hidden = Object.values(design.nodes).filter((n) => n.props.visible === false).length
      return { nodes: Object.keys(design.nodes).length, frames: Object.keys(design.frames).length, order, hidden }
    })

  /** Runs `act`, then checks undo takes the design back as it was and redo brings the change back. */
  async function undoesAndRedoes(page: Page, act: () => Promise<void>) {
    const before = await counts(page)
    await act()
    await expect.poll(() => counts(page)).not.toEqual(before)
    const after = await counts(page)
    await undo(page)
    await expect.poll(() => counts(page)).toEqual(before)
    await redo(page)
    await expect.poll(() => counts(page)).toEqual(after)
  }

  test('Duplicate in the full menu and a frame’s ⋯, Move down on a page card, Show hidden layers on empty canvas', async ({
    browser,
  }) => {
    const { page, errors } = await openAt(browser)
    await undoesAndRedoes(page, async () => {
      await selectLayers(page, ['badge'])
      await page.getByTestId('bar-more').click()
      await openMenu(page)
        .getByRole('menuitem', { name: /^Duplicate/ })
        .click()
    })
    await undoesAndRedoes(page, async () => {
      await clickLabel(page, 'fresh')
      await page.getByTestId('bar-frame-more').click()
      await openMenu(page)
        .getByRole('menuitem', { name: /^Duplicate/ })
        .click()
    })
    await selectLayers(page, [])
    await undoesAndRedoes(page, async () => {
      const pages = await pagesPanel(page)
      await pages
        .locator('[data-page]')
        .first()
        .getByRole('button', { name: /^More for / })
        .click()
      await openMenu(page).getByRole('menuitem', { name: 'Move down' }).click()
    })
    await page.keyboard.press('Escape')
    await selectLayers(page, ['logo'])
    await page.keyboard.press('Control+Shift+H')
    await selectLayers(page, [])
    await undoesAndRedoes(page, async () => {
      const at = await page.evaluate(() => window.dazbee?.screenPoint(560, 980, 'sq'))
      await page.mouse.click(at?.x ?? 0, at?.y ?? 0, { button: 'right' })
      const menu = page.getByTestId('stage-menu')
      expect(await words(menu)).toEqual(CANVAS_MENU.map((row) => row.name))
      await menu.getByRole('menuitem', { name: CANVAS_MENU[0]?.name ?? '' }).click()
    })
    expect(errors).toEqual([])
  })
})

test('a page card’s ⋯ greys the moves it has nothing to do for and says why beside the row', async ({ browser }) => {
  const { page, errors } = await openAt(browser)
  const pages = await pagesPanel(page)
  await pages
    .locator('[data-page]')
    .first()
    .getByRole('button', { name: /^More for / })
    .focus()
  await page.keyboard.press('Enter')
  const menu = openMenu(page)
  await expect(menu).toBeVisible()
  await expect.poll(() => focusedRow(page)).toBe('Rename')
  for (const row of ['Duplicate page', 'Move up']) {
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focusedRow(page)).toBe(row)
  }
  const up = menu.getByRole('menuitem', { name: 'Move up' })
  await expect(up).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByRole('tooltip').filter({ hasText: PAGE_MENU_WHY.moveUp })).toBeVisible()
  const order = await page.evaluate(() => JSON.stringify(window.dazbee?.design().pages))
  await page.keyboard.press('Enter')
  await expect(menu).toBeVisible()
  expect(await page.evaluate(() => JSON.stringify(window.dazbee?.design().pages))).toBe(order)
  expect(errors).toEqual([])
})

test('a library tile’s ⋯ lists its rows, moves by the keyboard and closes onto its button', async ({ browser }) => {
  const { page, errors } = await open(browser)
  await page.goto(`/brands/${DEV_BRAND}/designs`)
  const tile = page.locator('[data-design]').first()
  await tile.hover()
  const button = tile.getByRole('button', { name: /^More for / })
  await button.focus()
  await page.keyboard.press('Enter')
  const menu = openMenu(page)
  await expect(menu).toBeVisible()
  expect(await words(menu)).toEqual(TILE_MENU.map((row) => row.name))
  await expect.poll(() => focusedRow(page)).toBe('Rename')
  await page.keyboard.press('End')
  await expect.poll(() => focusedRow(page)).toBe('Delete')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(button).toBeFocused()
  expect(errors).toEqual([])
})
