// With nothing selected, the design's own panels: Sizes opens from the header pill after the
// design's name, "Sizes · 2" on desktop and tablet and the count alone on a phone, and holds what the
// Sizes card did. Nothing overlaps at the three screen sizes, and the canvas never moves.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { writeOutput } from '../support/editor.ts'
import { layoutProblems } from '../support/layout.ts'
import { openStage, sizesPanel } from '../support/stage.ts'

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
  rail: '[data-testid="rail"]',
  dock: '[data-dock]',
  zoom: '[data-zoom]',
  cards: '#editor-cards > *',
}
const camera = (page: Page) => page.evaluate(() => window.dazbee?.camera())
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

test('Sizes opens from the header pill and lists the sizes; Esc closes it and the focus goes back to the button', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const button = page.getByTestId('sizes-button')
  await expect(button).toHaveAccessibleName('Sizes · 2')
  await expect(button.locator('span:visible')).toHaveText('Sizes · 2')
  const panel = await sizesPanel(page)
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Sizes')
  await expect(panel.getByTestId('formats').locator('[data-format]')).toHaveCount(2)
  // The Sizes card is gone from the cards.
  await expect(page.locator('#editor-cards [data-testid="formats"]')).toHaveCount(0)
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

for (const [width, height] of [[1280, 760], [820, 1180], [390, 844]] as const) {
  test(`at ${width}×${height} the Sizes button and panel sit clear of everything, and the canvas stays`, async ({ browser }) => {
    const { page, errors } = await openStage(browser, design())
    await page.setViewportSize({ width, height })
    await settle(page)
    await page.evaluate(() => window.dazbee?.fitAll())
    await settle(page)
    const still = await camera(page)
    if (width === 390) await expect(page.getByTestId('sizes-button').locator('span:visible')).toHaveText('2')
    await sizesPanel(page)
    await settle(page)
    expect(await layoutProblems(page, { pieces: PIECES, uncut: 'h1, [data-testid="edit-panel-note"]' })).toEqual([])
    expect(await camera(page)).toEqual(still)
    writeOutput(`sizes-${width}.png`, await page.screenshot({ animations: 'disabled' }))
    expect(errors).toEqual([])
  })
}
