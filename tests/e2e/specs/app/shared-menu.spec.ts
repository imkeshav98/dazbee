// The one menu every menu of the app is built on, in Chromium, through the full menu (the small
// menu's ⋯), which has every piece of it: a menu with its rows as menu items, the arrows round from
// the ends, Home, End and typing to jump; the focus as it opens and closes; Esc closing the top-most
// first; a greyed row that stays in the arrow order and says why beside itself, never over another
// row, and runs nothing; a menu beside its row on tablet and desktop, and on a phone in the menu's
// place under a back row; and all of it mirrored in Arabic.
import { setCookies } from '../../support/editor.ts'
import { boxOf } from '../../support/layout.ts'
import { open } from '../../support/linked-menu.ts'
import { besideRows, fullMenuRows, rowName, rowsUnderTooltip } from '../../support/menu-rows.ts'
import { fitSettled, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { entered } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

const PHONE = { width: 390, height: 844 }

/** The words of the row that has the focus, without its key. */
const focusedRow = (page: Page) => page.evaluate(() => document.activeElement?.firstChild?.textContent?.trim() ?? '')
/** The test id of the element that has the focus. */
const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')

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

/** Opens the full menu from ⋯ by the keyboard, for the layer given, and gives it. */
async function fullMenuByKeys(page: Page, id: string) {
  await selectLayers(page, [id])
  await page.getByTestId('bar-more').focus()
  await page.keyboard.press('Enter')
  const menu = page.getByTestId('bar-more-menu')
  await expect(menu).toBeVisible()
  await entered(menu)
  await expect(menu.locator('[role^="menuitem"]').first()).toBeFocused()
  return menu
}

test('is a menu of menu items: the arrows go round from the ends, Home and End jump, and typing jumps to the next row starting so', async ({
  browser,
}) => {
  const { page, errors } = await openAt(browser)
  const menu = await fullMenuByKeys(page, 'headline')
  await expect(menu).toHaveAttribute('role', 'menu')
  await expect(menu.locator('[role^="menuitem"]')).toHaveCount(fullMenuRows().length)
  await expect(menu.getByTestId('more-copy')).toBeFocused()
  const rows = fullMenuRows()
  for (const [key, row] of [
    ['ArrowUp', rows.at(-1)],
    ['ArrowDown', rows[0]],
    ['End', rows.at(-1)],
    ['Home', rows[0]],
    // Typing jumps to the next row whose words start with what was typed, a second apart.
    ['h', 'Hide in all frames'],
    ['p', 'Paste'],
    ['p', 'Put in a box'],
  ] as const) {
    if (key.length === 1) await page.waitForTimeout(1100)
    await page.keyboard.press(key)
    await expect.poll(() => focusedRow(page), key).toBe(row)
  }
  expect(errors).toEqual([])
})

test('a greyed row stays in the arrow order, says why beside itself over no other row, and runs nothing', async ({
  browser,
}) => {
  const { page, errors } = await openAt(browser)
  // A frame linked to no other: Copy to other frames has nothing to do.
  const menu = await fullMenuByKeys(page, 'fresh-title')
  // Down past Paste and Duplicate onto it, a key at a time as Radix moves the focus after each.
  for (const row of ['Paste', 'Duplicate', 'Copy to other frames']) {
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focusedRow(page)).toBe(row)
  }
  const greyed = menu.getByTestId('more-copy-to-frames')
  await expect(greyed).toBeFocused()
  await expect(greyed).toHaveAttribute('aria-disabled', 'true')
  const why = 'No other frame on this page is linked to this one'
  const tip = page.getByRole('tooltip').filter({ hasText: why })
  await expect(tip).toBeVisible()
  expect(await rowsUnderTooltip(page)).toEqual([])
  // Beside the row: level with it, past its menu's end edge.
  const [row, said, box] = [await boxOf(greyed), await boxOf(tip), await boxOf(menu)]
  expect(said.left).toBeGreaterThanOrEqual(box.right)
  expect(said.bottom).toBeGreaterThan(row.top)
  expect(said.top).toBeLessThan(row.bottom)
  // Enter runs nothing and the menu stays, the focus on the row.
  await page.keyboard.press('Enter')
  await expect(menu).toBeVisible()
  await expect(greyed).toBeFocused()
  await expect(page.getByTestId('more-copy-to-frames-menu')).toHaveCount(0)
  // Esc closes the tooltip first, then the menu.
  await page.keyboard.press('Escape')
  await expect(tip).toBeHidden()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(page.getByTestId('bar-more')).toBeFocused()
  expect(errors).toEqual([])
})

for (const arabic of [false, true])
  test(`a menu beside a row opens by the arrow towards it, lines up beside its row, and Esc closes it alone${arabic ? ', mirrored in Arabic' : ''}`, async ({
    browser,
  }) => {
    const { page, errors } = await openAt(browser, undefined, arabic)
    const [toward, back] = arabic ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']
    const menu = await fullMenuByKeys(page, 'headline')
    const row = menu.getByTestId('more-copy')
    await expect(row).toHaveAttribute('aria-haspopup', 'menu')
    await page.keyboard.press(toward)
    const sub = page.getByTestId('more-copy-menu')
    await expect(sub).toBeVisible()
    await expect(sub).toHaveAttribute('role', 'menu')
    await entered(sub)
    await expect(sub.getByRole('menuitem').first()).toBeFocused()
    // Beside its row, towards the page's end where the window has room for it, its top level with the row's.
    const [at, beside] = [await boxOf(row), await boxOf(sub)]
    const room = arabic ? at.left : (page.viewportSize()?.width ?? 0) - at.right
    const towardEnd = arabic ? beside.right <= at.left : beside.left >= at.right
    const towardStart = arabic ? beside.left >= at.right : beside.right <= at.left
    expect(towardEnd || towardStart).toBe(true)
    if (room >= beside.right - beside.left + 8) expect(towardEnd).toBe(true)
    expect(Math.abs(beside.top - at.top)).toBeLessThanOrEqual(8)
    // The arrow back closes it, onto its row; the arrow towards it opens it again.
    await page.keyboard.press(back)
    await expect(sub).toBeHidden()
    await expect(row).toBeFocused()
    await page.keyboard.press(toward)
    await expect(sub).toBeVisible()
    // Esc closes it alone, the focus back on its row; a second Esc closes the menu, onto ⋯.
    await page.keyboard.press('Escape')
    await expect(sub).toBeHidden()
    await expect(menu).toBeVisible()
    await expect(row).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(page.getByTestId('bar-more')).toBeFocused()
    expect(errors).toEqual([])
  })

for (const arabic of [false, true])
  test(`on a phone a menu beside a row opens in its menu's place under a back row, and the back row, the arrow back and Esc go back${arabic ? ', mirrored in Arabic' : ''}`, async ({
    browser,
  }) => {
    const { page, errors } = await openAt(browser, PHONE, arabic)
    const [toward, back] = arabic ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']
    const menu = await fullMenuByKeys(page, 'headline')
    // A sheet along the screen's bottom edge.
    const sheet = await boxOf(menu)
    expect(sheet.left).toBeLessThanOrEqual(8)
    expect(sheet.right).toBeGreaterThanOrEqual(PHONE.width - 8)
    expect(sheet.bottom).toBeGreaterThanOrEqual(PHONE.height - 8)

    const backRow = menu.getByTestId('more-copy-back')
    const shownWords = () =>
      menu.locator('[role^="menuitem"]').evaluateAll((rows) =>
        rows.filter((row) => row.checkVisibility()).map((row) => row.firstChild?.textContent?.trim() ?? ''),
      )
    for (const how of ['back row', 'arrow', 'Esc'] as const) {
      await menu.getByTestId('more-copy').focus()
      await page.keyboard.press(toward)
      await expect(backRow).toBeFocused()
      // The back row, which shows its row's words, then the menu's own rows.
      await expect.poll(shownWords).toHaveLength(1 + besideRows('copy').length)
      if (!arabic) expect(await shownWords()).toEqual(['', ...besideRows('copy')])
      await expect(backRow).toHaveAccessibleName(arabic ? /^رجوع من/ : `Back from ${rowName('more-copy')}`)
      if (how === 'back row') await page.keyboard.press('Enter')
      else await page.keyboard.press(how === 'arrow' ? back : 'Escape')
      await expect(menu.getByTestId('more-copy')).toBeFocused()
      await expect.poll(shownWords).toHaveLength(fullMenuRows().length)
    }
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect.poll(() => focused(page)).toBe('bar-more')
    expect(errors).toEqual([])
  })
