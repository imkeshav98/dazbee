// The stage without cards: the canvas runs full width and the stage fits the ads between the
// capsule and its end edge. A selection shows the top bar, and nothing selected leaves no bar.
import { designOf, editorPath, screenPoint, setCookies, shoot } from '../../support/editor.ts'
import { liveDesign, seed } from '../../support/seed.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, moreSubmenu, openCard } from '../../support/top-bar.ts'

test.use({ viewport: { width: 1440, height: 900 } })

const box = async (page: Page, testId: string) => {
  const found = await page.getByTestId(testId).boundingBox()
  if (!found) throw new Error(`no ${testId}`)
  return found
}

async function open(page: Page) {
  const designId = await seed(liveDesign())
  await setCookies(page, { theme: 'dark' })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
}

test('the canvas runs full width and the ads fit between the capsule and the stage end', async ({ page }) => {
  await open(page)
  const stage = await box(page, 'stage')
  const rail = await box(page, 'rail')
  expect(stage.width).toBeGreaterThan(1430)
  // No cards: with nothing selected the design's sizes and pages are behind their buttons.
  await expect(page.getByTestId('cards')).toHaveCount(0)
  await expect(page.getByTestId('top-bar')).toHaveCount(0)
  // The square, fitted, sits wholly between the capsule and the stage's end, centred in that gap:
  // as it opens (the editor is ready only once it is), and again from Zoom to fit.
  const between = async () => {
    await page.evaluate(() => window.dazbee?.drawn())
    const left = (await screenPoint(page, 0, 0)).x
    const right = (await screenPoint(page, 1080, 1080)).x
    expect(left).toBeGreaterThan(rail.x + rail.width)
    expect(right).toBeLessThan(stage.x + stage.width)
    expect(Math.abs((left + right) / 2 - (rail.x + rail.width + stage.x + stage.width) / 2)).toBeLessThan(12)
  }
  await between()
  await page.evaluate(() => window.dazbee?.setCamera({ x: 0, y: 0, zoom: 1 }))
  await page.getByTestId('zoom').click()
  await page.getByTestId('zoom-menu').getByRole('button', { name: 'Zoom to fit' }).click()
  await between()
  await shoot(page, 'cards-design')
})

test('a selection shows the top bar; several layers line up and spread out from it and group from the small menu', async ({
  page,
}) => {
  await open(page)
  const at = await screenPoint(page, 200, 180)
  await page.mouse.click(at.x, at.y)
  const arrange = page.getByTestId('arrange')
  await expect(await openCard(page, 'layout-card')).toBeVisible()
  // One layer lines up with its format from the full menu.
  await expect(arrange).toHaveCount(0)
  await expect(page.getByTestId('bar-line-up')).toHaveCount(0)
  await expect((await moreSubmenu(page, 'line-up')).getByRole('button', { name: 'Align left' })).toBeEnabled()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // Several layers: Line up with the spread outs on the top bar, Group in the small menu.
  await page.keyboard.press('Control+a')
  await expect(arrange).toHaveCount(0)
  const lineUp = await barMenu(page, 'line-up')
  await expect(lineUp.getByRole('button', { name: 'Align left' })).toBeEnabled()
  await expect(lineUp.getByRole('button', { name: /^Distribute horizontally/ })).toBeEnabled()
  await shoot(page, 'cards-arrange')
  await page.keyboard.press('Escape')
  const before = Object.keys(JSON.parse(await designOf(page)).nodes).length
  await page.getByTestId('small-group').click()
  await expect
    .poll(
      async () =>
        Object.values(JSON.parse(await designOf(page)).nodes as Record<string, { type: string }>).filter(
          (n) => n.type === 'group',
        ).length,
    )
    .toBe(1)
  expect(Object.keys(JSON.parse(await designOf(page)).nodes).length).toBe(before + 1)

  // Escape clears the selection and the bar goes.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('top-bar')).toHaveCount(0)
})
