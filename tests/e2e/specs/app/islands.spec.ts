// Floating islands (#110): the editor has no top bar. The design's name and save state float at
// the start, its actions at the end, below the rulers and over the canvas, and the ads fit below
// them.
import { editorPath, screenPoint, setCookies, writeOutput } from '../../support/editor.ts'
import { liveDesign, seed } from '../../support/seed.ts'
import { expect, type Page, test } from '../../support/test.ts'

const box = async (page: Page, testId: string) => {
  const found = await page.getByTestId(testId).boundingBox()
  if (!found) throw new Error(`no ${testId}`)
  return found
}

async function open(page: Page) {
  await setCookies(page, { theme: 'dark' })
  const designId = await seed(liveDesign())
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
}

test.use({ viewport: { width: 1440, height: 900 } })

test('the editor has no top bar: two islands float over the canvas and the ads fit below them', async ({ page }) => {
  await open(page)
  const stage = await box(page, 'stage')
  const start = await box(page, 'island-start')
  const end = await box(page, 'island-end')
  // The canvas starts at the window's top edge; the islands float over it, clear of the 20 px
  // rulers when they are on. The rulers are off as the editor opens, as in the final mock.
  await expect(page.locator('.stage-overlay .ruler')).toHaveCount(0)
  expect(stage.y).toBe(0)
  expect(stage.height).toBe(900)
  for (const island of [start, end]) {
    expect(island.y).toBeGreaterThanOrEqual(20)
    expect(island.y + island.height).toBeLessThan(80)
  }
  expect(start.x).toBeLessThan(48)
  expect(1440 - (end.x + end.width)).toBeLessThan(16)
  // The start island sits on a small frosted pill, so the design's name reads over an ad under it;
  // the end island has no surface of its own.
  expect(await page.getByTestId('island-start').evaluate((el) => getComputedStyle(el).backdropFilter)).toContain(
    'blur(18px)',
  )
  expect(start.height).toBeLessThan(48)
  expect(await page.getByTestId('island-end').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  )
  await expect(page.getByTestId('island-start').getByRole('heading', { level: 1 })).toBeVisible()
  // The end island is the mock's: a pink Share button and the account avatar, nothing else.
  const end_ = page.getByTestId('island-end')
  await expect(end_.getByRole('button')).toHaveCount(2)
  await expect(end_.getByTestId('share-open')).toHaveText('Share')
  await end_.getByTestId('share-open').click()
  // Each item has its name and, under it, what it does.
  await expect(page.getByRole('menuitem')).toHaveText([/^Export/, /^Save as template/])
  await page.keyboard.press('Escape')
  // Language and theme live behind the avatar.
  await end_.getByTestId('account-open').click()
  const account = page.getByTestId('account')
  await expect(account.getByRole('radiogroup', { name: 'Language' })).toBeVisible()
  await expect(account.getByRole('radiogroup', { name: 'Theme' })).toBeVisible()
  await expect(account.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  await writeOutput(
    'islands-account.png',
    await page.screenshot({ clip: { x: 1440 - 320, y: 0, width: 320, height: 320 } }),
  )
  await page.keyboard.press('Escape')

  // Saved is a small muted cloud: no pill, no green words. The words stay for screen readers.
  const status = page.getByTestId('status')
  await expect(status).toHaveAttribute('data-status', 'Saved')
  await expect(status).toHaveText('Saved')
  expect((await status.boundingBox())?.width).toBeLessThan(24)
  expect(await status.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px')

  // The ads fit below the islands and above the dock: as the editor opens, and from Zoom to fit.
  const below = async () => {
    await page.evaluate(() => window.dazbee?.drawn())
    expect((await screenPoint(page, 0, 0)).y).toBeGreaterThan(Math.max(start.y + start.height, end.y + end.height))
    expect((await screenPoint(page, 1080, 1080)).y).toBeLessThan((await box(page, 'stage')).height - 60)
  }
  await below()
  await page.evaluate(() => window.dazbee?.setCamera({ x: 0, y: 0, zoom: 1 }))
  await page.getByTestId('zoom').click()
  await page.getByTestId('zoom-menu').getByRole('button', { name: 'Zoom to fit' }).click()
  await below()
  await writeOutput('islands-editor-dark.png', await page.screenshot())

  // A flyout starts below the start island.
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  expect((await box(page, 'flyout')).y).toBeGreaterThan(start.y + start.height)
})
