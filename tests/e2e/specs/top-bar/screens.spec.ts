// The top bar (#287) on a phone, right to left and at tablet size: the phone's sheet, the edit
// panel and the bar mirrored in Arabic, and the second row and its pop-ups with a flyout open at
// tablet size.
import { photo, upload } from '../../support/assets.ts'
import { editorPath, screenPoint, setCookies, writeOutput } from '../../support/editor.ts'
import { layoutProblems } from '../../support/layout.ts'
import { seed } from '../../support/seed.ts'
import { fitSettled, nextFrame, openStage, selectLayers } from '../../support/stage.ts'
import { expect, type Locator, test } from '../../support/test.ts'
import { barMenu, moreMenu, PIECES, UNCUT, zoomMenu } from '../../support/top-bar.ts'
import { topBarDesign } from '../../support/top-bar-design.ts'

test.describe.configure({ timeout: 240_000 })

test('on a phone a panel is a sheet that hides the tab bar and dock, and it and a rail flyout close each other', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await page.setViewportSize({ width: 390, height: 844 })
  await selectLayers(page, ['box'])
  await expect(page.locator('[data-zoom]')).toBeHidden()
  await barMenu(page, 'effects')
  const sheet = page.locator('#edit-panel')
  const box = await sheet.boundingBox()
  // 8 px from the stage's edges, the same on both sides.
  expect(box && box.x <= 8 && Math.abs(box.x - (390 - box.x - box.width)) <= 1).toBe(true)
  await expect(page.getByTestId('rail')).toBeHidden()
  await expect(page.locator('[data-dock]')).toBeHidden()
  await page.getByTestId('edit-panel-close').click()
  await expect(page.getByTestId('rail')).toBeVisible()
  await page.locator('[data-panel="layers"]').click()
  await expect(page.getByTestId('flyout')).toBeVisible()
  await barMenu(page, 'effects')
  await expect(page.getByTestId('flyout')).toHaveCount(0)
  await page.getByTestId('edit-panel-close').click()
  await page.locator('[data-panel="layers"]').click()
  await expect(page.getByTestId('flyout')).toBeVisible()
  await selectLayers(page, [])
  await expect(page.locator('[data-zoom]')).toBeVisible()
  expect(errors).toEqual([])
})

test('in Arabic the edit panel opens at the start of the screen, which is its end side, and the top bar mirrors', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const designId = await seed(topBarDesign(asset.id))
  const context = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  const page = await context.newPage()
  await setCookies(page, { locale: 'ar' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await selectLayers(page, ['box'])
  await barMenu(page, 'effects')
  const panel = await page.locator('#edit-panel').boundingBox()
  expect(panel && panel.x <= 16).toBe(true)
  const items = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="top-bar"] [data-item] > *')].map(
      (el) => el.getBoundingClientRect().x,
    ),
  )
  // The first item is the furthest right.
  expect(items[0]).toBeGreaterThan(items.at(-1) ?? Infinity)
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  writeOutput('top-bar-rtl.png', await page.screenshot({ animations: 'disabled' }))
  expect(errors).toEqual([])
})

test("at tablet size with a flyout open, the bar's second row and its pop-ups and panels never scroll the stage, and nothing meets", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.locator('[data-panel="layers"]').click()
  await selectLayers(page, ['headline'])
  const scrolled = () =>
    page.evaluate(() => [document.querySelector('main')?.scrollLeft, document.querySelector('main')?.scrollTop])
  for (const id of ['transparency', 'position', 'font', 'effects']) {
    await barMenu(page, id)
    await nextFrame(page)
    expect(await scrolled()).toEqual([0, 0])
    await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
    await page.keyboard.press('Escape')
  }
  expect(errors).toEqual([])
})

test.describe('on a phone, 390×844', () => {
  /** A scrolling area's state: whether it scrolls, its fade, and whether its overlay bar shows. */
  const scrolling = (area: Locator) =>
    area.evaluate((el) => {
      const bar = el.querySelector('.os-scrollbar-vertical')
      return {
        scrolls: el.scrollHeight > el.clientHeight + 1,
        fade: getComputedStyle(el).maskImage,
        bar: Boolean(
          bar?.classList.contains('os-scrollbar-visible') && !bar.classList.contains('os-scrollbar-auto-hide-hidden'),
        ),
      }
    })
  /** The heights of the rows a menu holds, by a selector inside it. */
  const rowHeights = (menu: Locator, rows: string) =>
    menu.locator(rows).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))

  test('the top bar scrolls sideways with no classic scrollbar', async ({ browser }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, topBarDesign(asset.id))
    await page.setViewportSize({ width: 390, height: 844 })
    await selectLayers(page, ['box'], { bar: true })
    const row = page.getByTestId('top-bar-row')
    expect(await row.evaluate((el) => [el.scrollWidth > el.clientWidth, getComputedStyle(el).scrollbarWidth])).toEqual([
      true,
      'none',
    ])
    expect(errors).toEqual([])
  })

  test('the full menu shows that it scrolls, with a fade at its cut edge and its bar, and every row can be reached', async ({
    browser,
  }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, topBarDesign(asset.id))
    await page.setViewportSize({ width: 390, height: 844 })
    await selectLayers(page, ['box'], { bar: true })
    const menu = await moreMenu(page)
    // Away from the menu, past the time an overlay bar takes to hide.
    await page.mouse.move(4, 400)
    await page.waitForTimeout(1_200)
    const top = await scrolling(menu)
    expect(top).toMatchObject({ scrolls: true, bar: true })
    expect(top.fade).toContain('gradient')
    await menu.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await expect.poll(async () => (await scrolling(menu)).fade).not.toBe(top.fade)
    const box = await menu.boundingBox()
    const last = await menu.locator(':scope > button').last().boundingBox()
    expect(box && last && last.y >= box.y && last.y + last.height <= box.y + box.height).toBe(true)
    expect(errors).toEqual([])
  })

  test('every menu row is at least 44 px tall: the full, right-click, shape and zoom menus', async ({ browser }) => {
    const asset = await upload(photo)
    const { page, errors } = await openStage(browser, topBarDesign(asset.id))
    await page.setViewportSize({ width: 390, height: 844 })
    await fitSettled(page)
    await selectLayers(page, ['box'], { bar: true })
    const full = await moreMenu(page)
    for (const height of await rowHeights(full, ':scope > button')) expect(height).toBeGreaterThanOrEqual(44)
    await page.keyboard.press('Escape')

    await selectLayers(page, [])
    const at = await screenPoint(page, 160, 280)
    await page.mouse.click(at.x, at.y, { button: 'right' })
    const right = page.getByTestId('stage-menu')
    await expect(right).toBeVisible()
    for (const height of await rowHeights(right, ':scope > button')) expect(height).toBeGreaterThanOrEqual(44)
    await page.keyboard.press('Escape')
    await expect(right).toBeHidden()

    await selectLayers(page, [])
    await page.getByTestId('shape-menu').click()
    const shapes = page.getByRole('menu')
    await expect(shapes).toBeVisible()
    for (const height of await rowHeights(shapes, '[data-shape]')) expect(height).toBeGreaterThanOrEqual(44)
    await page.keyboard.press('Escape')

    const zoom = await zoomMenu(page)
    for (const height of await rowHeights(zoom, 'button')) expect(height).toBeGreaterThanOrEqual(44)
    await page.keyboard.press('Escape')
    expect(errors).toEqual([])
  })

  test(
    'screenshots: the top bar, the full menu at its top and end, and the shape and zoom menus',
    { tag: '@evidence' },
    async ({ browser }) => {
      const asset = await upload(photo)
      const { page, errors } = await openStage(browser, topBarDesign(asset.id))
      await page.setViewportSize({ width: 390, height: 844 })
      await fitSettled(page)
      await selectLayers(page, ['box'], { bar: true })
      await nextFrame(page)
      writeOutput('phone-top-bar.png', await page.screenshot({ animations: 'disabled' }))
      const menu = await moreMenu(page)
      await page.mouse.move(4, 400)
      await nextFrame(page)
      writeOutput('phone-full-menu-top.png', await page.screenshot({ animations: 'disabled' }))
      await menu.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
      await nextFrame(page)
      writeOutput('phone-full-menu-end.png', await page.screenshot({ animations: 'disabled' }))
      await page.keyboard.press('Escape')
      await selectLayers(page, [])
      await page.getByTestId('shape-menu').click()
      await expect(page.getByRole('menu')).toBeVisible()
      writeOutput('phone-shape-menu.png', await page.screenshot({ animations: 'disabled' }))
      await page.keyboard.press('Escape')
      await zoomMenu(page)
      writeOutput('phone-zoom-menu.png', await page.screenshot({ animations: 'disabled' }))
      expect(errors).toEqual([])
    },
  )
})
