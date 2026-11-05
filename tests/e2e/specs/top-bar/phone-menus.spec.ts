// The layer menus on a phone in Chromium: a menu beside a row of the full menu or the right-click
// menu opens in its menu's place, under a back row naming its row, with nothing of the menu showing;
// the back row, the arrow back and Esc go back to the row, and a second Esc closes the menu, in
// English and in Arabic. No row shows a shortcut key, and every row stays a finger's height. A tap
// on a greyed row says why in a tooltip just above its menu, covering no row and clear of the finger,
// which Esc closes first. The full menu and the right-click menu are the sheet Arrange is, and a
// group's fits whole. The rest of Arrange's sheet is checked in top-bar-more-screens.
import { setCookies } from '../../support/editor.ts'
import { boxOf, layoutProblems } from '../../support/layout.ts'
import { open, rowsOf } from '../../support/linked-menu.ts'
import {
  besideRows,
  fullMenuRows,
  rowIn,
  rowName,
  rowsUnderTooltip,
  shownKeys,
  shownRows,
} from '../../support/menu-rows.ts'
import { fitSettled, selectLayers } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'
import { arrangeMenu, entered, moreMenu, PIECES, UNCUT } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

const PHONE = { width: 390, height: 844 }

/** The heights of the rows that show in a menu. */
const shownHeights = (menu: Locator) =>
  menu
    .locator('button')
    .evaluateAll((rows) => rows.filter((row) => row.checkVisibility()).map((row) => row.getBoundingClientRect().height))
/** The test id of the element that has the focus. */
const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')

/** Opens the linked menu design on a phone, its page fitted. */
async function openOnPhone(browser: Parameters<typeof open>[0]) {
  const opened = await open(browser)
  await opened.page.setViewportSize(PHONE)
  await fitSettled(opened.page)
  return opened
}

/** Right-clicks a layer in the square frame, at its middle, and gives the right-click menu once it shows. */
async function rightClick(page: Page, id: string) {
  const at = await page.evaluate((one) => {
    const box = window.dazbee?.boxOf(one)
    return window.dazbee?.screenPoint(
      (box?.x ?? 0) + (box?.width ?? 0) / 2,
      (box?.y ?? 0) + (box?.height ?? 0) / 2,
      'sq',
    )
  }, id)
  await page.mouse.click(at?.x ?? 0, at?.y ?? 0, { button: 'right' })
  const menu = page.getByTestId('stage-menu')
  await expect(menu).toBeVisible()
  return menu
}

test('a menu beside a row of the full menu opens in its place under a back row naming the row, with nothing of the full menu showing, and the back row goes back to its row', async ({
  browser,
}) => {
  const { page, errors } = await openOnPhone(browser)
  await selectLayers(page, ['headline'])
  const menu = await moreMenu(page)
  await entered(menu)
  expect(await shownKeys(menu)).toBe(0)
  for (const height of await shownHeights(menu)) expect(height).toBeGreaterThanOrEqual(44)

  await menu.getByTestId('more-copy-to-frames').click()
  const sub = menu.getByTestId('more-copy-to-frames-menu')
  await expect(sub).toBeVisible()
  // The back row, then the menu's own rows under its heading; no row of the full menu, and no card of its own.
  expect(await shownRows(menu)).toEqual([
    rowName('more-copy-to-frames'),
    ...besideRows('copy-to-frames', { text: true }),
  ])
  await expect(sub.getByText('To the 2 linked frames')).toBeVisible()
  await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1)
  const [outer, back, rows] = [
    await boxOf(menu),
    await boxOf(menu.getByTestId('more-copy-to-frames-back')),
    await boxOf(sub),
  ]
  expect(back.top - outer.top).toBeLessThanOrEqual(8)
  expect(outer.bottom - rows.bottom).toBeLessThanOrEqual(8)
  expect(await shownKeys(menu)).toBe(0)
  for (const height of await shownHeights(menu)) expect(height).toBeGreaterThanOrEqual(44)

  await menu.getByTestId('more-copy-to-frames-back').click()
  await expect(sub).toHaveCount(0)
  expect(await shownRows(menu)).toEqual(fullMenuRows())
  await expect.poll(() => focused(page)).toBe('more-copy-to-frames')
  expect(errors).toEqual([])
})

test('a menu beside a row of the right-click menu opens in its place, Esc goes back to its row, and a second Esc closes the menu', async ({
  browser,
}) => {
  const { page, errors } = await openOnPhone(browser)
  const menu = await rightClick(page, 'headline')
  await menu.getByTestId('more-paste').click()
  const sub = menu.getByTestId('more-paste-menu')
  await expect(sub).toBeVisible()
  expect(await shownRows(menu)).toEqual([rowName('more-paste'), ...besideRows('paste')])
  await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1)
  expect(await shownKeys(menu)).toBe(0)
  for (const height of await shownHeights(menu)) expect(height).toBeGreaterThanOrEqual(44)
  await page.keyboard.press('Escape')
  await expect(sub).toHaveCount(0)
  await expect(menu).toBeVisible()
  expect(await shownRows(menu)).toEqual(fullMenuRows())
  await expect.poll(() => focused(page)).toBe('more-paste')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  expect(errors).toEqual([])
})

for (const [locale, toward, back] of [
  ['en', 'ArrowRight', 'ArrowLeft'],
  ['ar', 'ArrowLeft', 'ArrowRight'],
] as const) {
  test(`in ${locale}, ${toward} opens a row's menu in place at its back row, ${back} and Esc go back to the row, and a second Esc closes the menu`, async ({
    browser,
  }) => {
    const { page, errors } = await openOnPhone(browser)
    if (locale === 'ar') {
      await setCookies(page, { locale })
      await page.reload()
      await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
      await fitSettled(page)
    }
    await selectLayers(page, ['headline'])
    await page.getByTestId('bar-more').focus()
    await page.keyboard.press('Enter')
    const menu = page.getByTestId('bar-more-menu')
    await expect(menu.getByTestId('more-copy')).toBeFocused()
    await page.keyboard.press(toward)
    const sub = menu.getByTestId('more-copy-menu')
    await expect(sub).toBeVisible()
    await expect(menu.getByTestId('more-copy-back')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(sub.getByRole('button').first()).toBeFocused()
    await page.keyboard.press(back)
    await expect(sub).toHaveCount(0)
    await expect(menu.getByTestId('more-copy')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(sub).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sub).toHaveCount(0)
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('more-copy')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(page.getByTestId('bar-more')).toBeFocused()
    expect(errors).toEqual([])
  })
}

test('a tap on a greyed row says why in a tooltip just above its menu, covering no row, back row or finger, for the first, a middle and the last row, and Esc closes the tooltip first', async ({
  browser,
}) => {
  const { page, errors } = await openOnPhone(browser)
  await page.evaluate(() => {
    localStorage.removeItem('dazbee.copiedLayers')
    localStorage.removeItem('dazbee.copiedStyle')
  })
  /** Taps a greyed row, checks its tooltip lies just above its menu and covers no row, and gives the tooltip. */
  const tapGreyed = async (menu: Locator, greyed: Locator, why: string, label: string) => {
    // Playwright holds back a click on a row marked disabled until it isn't; the tap is the point here.
    await greyed.click({ force: true })
    const tip = page.getByRole('tooltip').filter({ hasText: why })
    await expect(tip, label).toBeVisible()
    const shown = tip.locator('xpath=..')
    await entered(shown)
    expect(await rowsUnderTooltip(page), label).toEqual([])
    const [box, around] = [await boxOf(shown), await boxOf(menu)]
    expect(box.bottom, label).toBeLessThanOrEqual(around.top + 0.5)
    expect(box.left >= 0 && box.right <= PHONE.width && box.top >= 0, label).toBe(true)
    return tip
  }
  // The first and the last row of a menu in the full menu's place, under its back row, and a middle one.
  for (const [id, sub, row, why] of [
    ['photo', 'paste', 'paste', 'Copy layers first'],
    ['photo', 'paste', 'pasteStyle', 'Copy a style first'],
    ['headline', 'copy-to-frames', 'textToLinked', 'Every linked copy has this text already'],
  ] as const) {
    await selectLayers(page, [id])
    const menu = await moreMenu(page)
    await menu.getByTestId(`more-${sub}`).click()
    const greyed = rowIn(page.getByTestId(`more-${sub}-menu`), row)
    const tip = await tapGreyed(menu, greyed, why, row)
    // Esc closes the top-most first: the tooltip, then the menu in the full menu's place, then the full menu.
    await page.keyboard.press('Escape')
    await expect(tip).toBeHidden()
    await expect(greyed).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(greyed).toBeHidden()
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  }
  // The full menu's own rows: a middle one for a frame linked to none, and the last for a layer locked against deleting.
  await page.evaluate(() => window.dazbee?.setLocked(['badge'], true))
  for (const [id, row, why] of [
    ['fresh-title', 'more-copy-to-frames', 'No other frame on this page is linked to this one'],
    ['badge', 'deleteLinked', 'The selection is locked against deleting'],
  ] as const) {
    await selectLayers(page, [id])
    const menu = await moreMenu(page)
    const tip = await tapGreyed(menu, rowIn(menu, row), why, row)
    await page.keyboard.press('Escape')
    await expect(tip).toBeHidden()
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  }
  expect(errors).toEqual([])
})

test('the full menu and the right-click menu open as the sheet at the bottom of the screen Arrange opens as, hiding the dock, the tab bar and the small menu, and a group’s, the longest, fits whole on a 390×844 and a 390×600 screen', async ({
  browser,
}) => {
  const { page, errors } = await openOnPhone(browser)
  for (const height of [PHONE.height, 600]) {
    await page.setViewportSize({ width: PHONE.width, height })
    await fitSettled(page)
    await selectLayers(page, ['logo'], { bar: true })
    // Arrange's sheet, which the full menu's lies as.
    const arrange = await arrangeMenu(page)
    const sheet = await boxOf(arrange)
    await page.keyboard.press('Escape')
    await expect(arrange).toBeHidden()
    for (const show of [() => moreMenu(page), () => rightClick(page, 'logo')]) {
      const menu = await show()
      await entered(menu)
      const label = `${height} ${await menu.getAttribute('data-testid')}`
      await expect(menu, label).toHaveAttribute('data-sheet', 'true')
      const box = await boxOf(menu)
      expect([box.left, box.right, box.bottom].map(Math.round), label).toEqual(
        [sheet.left, sheet.right, sheet.bottom].map(Math.round),
      )
      expect(await rowsOf(menu), label).toEqual(fullMenuRows({ group: true }))
      // Whole: every row on the screen, with nothing to scroll to.
      expect(box.top, label).toBeGreaterThanOrEqual(0)
      expect(await menu.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), label).toBe(true)
      await expect(page.getByTestId('rail')).toBeHidden()
      await expect(page.locator('[data-dock]')).toBeHidden()
      await expect(page.getByTestId('small-menu')).toBeHidden()
      expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT }), label).toEqual([])
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(page.locator('[data-dock]')).toBeVisible()
    }
  }
  expect(errors).toEqual([])
})
