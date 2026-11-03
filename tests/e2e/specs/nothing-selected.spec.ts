// With nothing selected, the design's own panels and the page itself. Sizes opens from the header
// pill after the design's name ("Sizes · 2", the count alone on a phone); Pages from by the zoom
// pill ("Pages 1/1"). A click on the page's background picks it: a dashed outline round each of its
// sizes, its labels pink, and a top bar of Background and Sizes; Background paints the page in every
// size. No cards are left, nor the phones' properties button. Nothing overlaps at the three screen
// sizes, and the canvas never moves.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { designOf, writeOutput } from '../support/editor.ts'
import { layoutProblems } from '../support/layout.ts'
import { backgroundPanel, barMenu, click, drag, openStage, pagesPanel, pickPage, press, selection, sizesPanel } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

const solid = (color: string) => [{ type: 'solid' as const, color }]
const design = (): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Summer sale', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' }, st: { name: 'Story', width: 1080, height: 1920, order: 'a1' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: solid('#FFF8F0FF') } },
  nodes: {
    headline: { type: 'text', parentId: 'p1', index: 'a0', name: 'Headline', props: { x: 80, y: 60, width: 600, height: 90, boxMode: 'autoHeight', text: 'Summer sale', style: { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 800, color: '#C2106CFF' } } },
  },
  overrides: {},
})

const PIECES = {
  'header pill': '[data-testid="island-start"]',
  'end island': '[data-testid="island-end"]',
  'edit panel': '#edit-panel',
  'top bar': '[data-testid="top-bar-row"]',
  rail: '[data-testid="rail"]',
  dock: '[data-dock]',
  zoom: '[data-zoom]',
  pages: '[data-pages]',
}
const camera = (page: Page) => page.evaluate(() => window.dazbee?.camera())
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const fills = async (page: Page) => (JSON.parse(await designOf(page)) as { pages: Record<string, { fills: { type: string; color?: string }[] }> }).pages.p1?.fills
const pageBar = (page: Page) => page.locator('[data-testid="top-bar"][data-page]')

test('Sizes opens from the header pill and lists the sizes; Esc closes it and the focus goes back to the button', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const button = page.getByTestId('sizes-button')
  await expect(button).toHaveAccessibleName('Sizes · 2')
  await expect(button.locator('span:visible')).toHaveText('Sizes · 2')
  const panel = await sizesPanel(page)
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Sizes')
  await expect(panel.getByTestId('formats').locator('[data-format]')).toHaveCount(2)
  // No cards are left, and no top bar with nothing selected.
  await expect(page.getByTestId('cards')).toHaveCount(0)
  await expect(page.getByTestId('top-bar')).toHaveCount(0)
  // Every preset, from More sizes.
  await panel.getByRole('button', { name: 'Add format' }).click()
  await page.getByRole('dialog', { name: 'Add format' }).locator('[data-preset=pin]').click()
  await expect(button.locator('span:visible')).toHaveText('Sizes · 3')
  await expect(panel.getByTestId('formats').locator('[data-format]')).toHaveCount(3)
  // A common size at a tap, from Add a size.
  await panel.getByTestId('add-size').locator('[data-preset=link-image]').click()
  await expect(button.locator('span:visible')).toHaveText('Sizes · 4')
  // Each size's menu renames it.
  const story = panel.locator('[data-format="st"]')
  await story.getByRole('button', { name: 'More for Story' }).click()
  await page.getByRole('dialog', { name: 'More for Story' }).getByRole('button', { name: 'Rename' }).click()
  await story.getByRole('textbox', { name: 'Rename' }).fill('Reel')
  await story.getByRole('textbox', { name: 'Rename' }).press('Enter')
  await expect.poll(() => page.evaluate(() => window.dazbee?.design().formats.st?.name)).toBe('Reel')
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  // A second press of the button closes it too.
  await button.click()
  await expect(panel).toBeVisible()
  await button.click()
  await expect(panel).toBeHidden()
  expect(errors).toEqual([])
})

test('Pages opens from by the zoom pill: it counts the pages, adds one, shows one, and Esc gives the focus back', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const button = page.getByTestId('pages-button')
  await expect(button).toHaveAccessibleName('Pages: page 1 of 1')
  await expect(button.locator('span:visible')).toHaveText('Pages 1/1')
  const panel = await pagesPanel(page)
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Pages')
  const pages = panel.getByTestId('pages').getByRole('listitem')
  await expect(pages).toHaveCount(1)
  await expect(pages.first()).toContainText('1. Page 1')
  await expect(pages.first()).toContainText('2 sizes')
  // Add page adds the next and brings it into view.
  await panel.getByTestId('add-page').click()
  await expect(pages).toHaveCount(2)
  await expect(button.locator('span:visible')).toHaveText('Pages 2/2')
  await expect(pages.nth(1)).toHaveAttribute('aria-current', 'page')
  // Its menu deletes it, and the toast's Undo brings it back.
  await pages.nth(1).getByRole('button', { name: 'More for Page 2' }).click()
  await page.getByRole('dialog', { name: 'More for Page 2' }).getByRole('button', { name: 'Delete page' }).click()
  await expect(pages).toHaveCount(1)
  await expect(button.locator('span:visible')).toHaveText('Pages 1/1')
  await page.getByTestId('removed-toast').getByRole('button', { name: 'Undo' }).click()
  await expect(pages).toHaveCount(2)
  await pages.first().getByRole('button', { name: 'Show Page 1' }).click()
  await expect(button.locator('span:visible')).toHaveText('Pages 1/2')
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(button).toBeFocused()
  expect(errors).toEqual([])
})

test('a click on the page picks it: a dashed outline, pink labels, and a bar of Background and Sizes; Background paints it in every size', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const still = await camera(page)
  await pickPage(page, 900, 900)
  // Each of its sizes outlined, dashed, and their labels lit.
  await expect(page.locator('.stage-overlay .page-picked')).toHaveCount(2)
  expect(await page.locator('.stage-overlay .page-picked').first().evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('dashed')
  await expect(page.locator('.stage-overlay .frame-label[data-active]')).toHaveCount(2)
  // No layer is selected, and there is no small menu.
  expect(await selection(page)).toEqual([])
  await expect(page.getByTestId('small-menu')).toHaveCount(0)
  // Its bar: Background with the page's colour, and Sizes.
  const bar = pageBar(page)
  await expect(bar.locator('[data-item]')).toHaveCount(2)
  await expect(page.getByTestId('bar-background')).toHaveAccessibleName('Background colour')
  await expect(page.getByTestId('bar-sizes')).toHaveText('Sizes · 2')
  writeOutput('page-picked.png', await page.screenshot({ animations: 'disabled' }))

  // Background: the Colour panel's choices, titled for the page, its layers under Advanced.
  const panel = await barMenu(page, 'background')
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Background colour')
  await expect(panel.getByTestId('edit-panel-note')).toHaveText('Page 1')
  await expect(panel.getByTestId('page-fills').locator('[data-row]')).toHaveCount(1)
  await panel.getByTestId('colour-pick').click()
  const hex = panel.getByTestId('colour-picker').getByRole('textbox', { name: 'Colour hex' })
  await hex.fill('3d6bff')
  await hex.press('Enter')
  await expect.poll(() => fills(page)).toEqual(solid('#3D6BFFFF'))
  // The page's fills are the page's, the same in every size: both frames draw it.
  // The export's pixel at (1000, 1000), as RGB, in one size.
  const pixel = (formatId: string) => page.evaluate((formatId) => {
    const pixels = window.dazbee?.exportPixels('p1', formatId)
    const i = (1000 * 1080 + 1000) * 4
    return pixels ? [pixels[i], pixels[i + 1], pixels[i + 2]] : null
  }, formatId)
  for (const formatId of ['sq', 'st']) await expect.poll(() => pixel(formatId)).toEqual([61, 107, 255])
  writeOutput('page-background.png', await page.screenshot({ animations: 'disabled' }))
  // Esc in the field closes the panel; one undo step takes the colour back.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await press(page, 'undo')
  await expect.poll(() => fills(page)).toEqual(solid('#FFF8F0FF'))

  // The layers' keys do nothing to the page.
  const before = await designOf(page)
  for (const key of ['Delete', 'Control+d', 'Control+c', 'ArrowRight']) await page.keyboard.press(key)
  expect(await designOf(page)).toBe(before)
  await expect(bar).toBeVisible()
  // Esc lets the page go.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('top-bar')).toHaveCount(0)
  await expect(page.locator('.stage-overlay .page-picked')).toHaveCount(0)
  await expect(page.locator('.stage-overlay .frame-label[data-active]')).toHaveCount(0)

  // A click off every page lets it go too.
  await pickPage(page, 900, 900)
  await click(page, -200, 500)
  await expect(page.getByTestId('top-bar')).toHaveCount(0)
  // A click on a layer selects it and the page goes.
  await pickPage(page, 900, 900)
  await click(page, 300, 100)
  expect(await selection(page)).toEqual(['headline'])
  await expect(page.locator('.stage-overlay .page-picked')).toHaveCount(0)
  // A drag that starts on the page draws a marquee and selects the layers it touches; no page is picked.
  await press(page, 'deselect')
  await drag(page, { x: 40, y: 20 }, { x: 400, y: 200 })
  expect(await selection(page)).toEqual(['headline'])
  await expect(page.locator('.stage-overlay .page-picked')).toHaveCount(0)
  // Picking never moved the canvas.
  expect(await camera(page)).toEqual(still)
  expect(errors).toEqual([])
})

test('Sizes on the page\'s bar opens the Sizes panel, and the focus goes back to it on Esc', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await pickPage(page, 900, 900)
  await page.getByTestId('bar-sizes').click()
  const panel = page.getByTestId('bar-sizes-menu')
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page.getByTestId('bar-sizes')).toBeFocused()
  expect(errors).toEqual([])
})

for (const [width, height] of [[1280, 760], [820, 1180], [390, 844]] as const) {
  test(`at ${width}×${height} Sizes, Pages and the page's Background sit clear of everything, and the canvas stays`, async ({ browser }) => {
    const { page, errors } = await openStage(browser, design())
    await page.setViewportSize({ width, height })
    await settle(page)
    await page.evaluate(() => window.dazbee?.fitAll())
    await settle(page)
    const still = await camera(page)
    // No properties button on the phones' tab bar.
    await expect(page.locator('[data-panel="properties"]')).toHaveCount(0)
    if (width === 390) {
      await expect(page.getByTestId('sizes-button').locator('span:visible')).toHaveText('2')
      await expect(page.getByTestId('pages-button').locator('span:visible')).toHaveText('1/1')
    }
    const check = async (name: string) => {
      await settle(page)
      expect(await layoutProblems(page, { pieces: PIECES, uncut: 'h1, [data-testid="edit-panel-note"]' }), name).toEqual([])
      expect(await camera(page), name).toEqual(still)
      writeOutput(`${name}-${width}.png`, await page.screenshot({ animations: 'disabled' }))
    }
    await check('nothing-selected')
    await sizesPanel(page)
    await check('sizes')
    await pagesPanel(page)
    await check('pages')
    await page.keyboard.press('Escape')
    await backgroundPanel(page, 900, 900)
    await check('background')
    expect(errors).toEqual([])
  })
}
