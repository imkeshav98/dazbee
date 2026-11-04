import { photo, upload } from '../../support/assets.ts'
import { editorPath, setCookies, writeOutput } from '../../support/editor.ts'
import { layoutProblems } from '../../support/layout.ts'
import { seed } from '../../support/seed.ts'
import { nextFrame, openStage, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { barMenu, PIECES, UNCUT } from '../../support/top-bar.ts'
import { design } from '../../support/top-bar-design.ts'

test.describe.configure({ timeout: 240_000 })

test('on a phone a panel is a sheet that hides the tab bar and dock, and it and a rail flyout close each other', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
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
  const designId = await seed(design(asset.id))
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
  const { page, errors } = await openStage(browser, design(asset.id))
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
