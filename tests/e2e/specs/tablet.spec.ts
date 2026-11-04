// The app on a tablet, 820 × 1180: the brand's home, and the editor as it opens and with a layer
// selected, show every piece whole and inside the window, nothing drawn over anything else.
import { editorPath, screenPoint, writeOutput } from '../support/editor.ts'
import { EDITOR_CHROME, layoutProblems } from '../support/layout.ts'
import { liveDesign, seed } from '../support/seed.ts'
import { click } from '../support/stage.ts'
import { expect, type Page, test } from '../support/test.ts'

test.use({ viewport: { width: 820, height: 1180 } })

/** The design's name in the start island, which the next test checks on its own. */
const NAME = '[data-testid="island-start"] h1'

/** The layers selected in turn, by a click on their middle: a shape, then a text layer, whose bar has the most in it. */
const LAYERS = [
  ['box', 230, 180],
  ['headline', 540, 540],
] as const

/** The chrome with the bar by the selection and the selected layer's box on the stage. */
const selected = (id: string) => ({
  ...EDITOR_CHROME,
  'top bar': '[data-testid="top-bar-row"]',
  'small menu': '[data-testid="small-menu"]',
  'selected layer': `.stage-overlay .selection[data-layer="${id}"]`,
})

async function openEditor(page: Page) {
  const designId = await seed(liveDesign())
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  await page.evaluate(() => window.dazbee?.drawn())
}

async function select(page: Page, [id, x, y]: (typeof LAYERS)[number]) {
  await click(page, x, y)
  await expect.poll(() => page.evaluate(() => window.dazbee?.selection())).toEqual([id])
  await expect(page.getByTestId('top-bar')).toBeVisible()
}

test('on a tablet the home and the editor, with a layer selected, show everything inside the window and nothing over anything else', async ({
  page,
}) => {
  // The home, then the editor opening, which alone may take its 30 s on a busy runner.
  test.setTimeout(90_000)
  await page.goto('/brands/dev-brand-coffee')
  await expect(page.getByRole('button', { name: 'Make drafts' })).toBeVisible()
  // A vertical capsule at the start edge, as on a computer.
  const capsule = await page.getByTestId('library-capsule').boundingBox()
  expect(capsule && capsule.height > capsule.width).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(820)
  await expect
    .poll(() =>
      layoutProblems(page, {
        scrolls: true,
        pieces: {
          capsule: '[data-testid="library-capsule"]',
          'top bar': 'body header',
          brief: 'section[aria-labelledby="brief-title"]',
          'blank sizes': 'section[aria-labelledby="start-blank"]',
        },
      }),
    )
    .toEqual([])
  writeOutput('tablet-0-home.png', await page.screenshot({ animations: 'disabled' }))

  await openEditor(page)
  // The ad fits between the chrome as the editor opens.
  const corner = await screenPoint(page, 0, 0)
  const far = await screenPoint(page, 1080, 1080)
  const ad = { x: corner.x, y: corner.y, width: far.x - corner.x, height: far.y - corner.y }
  expect(ad.width).toBeGreaterThan(200)
  await expect.poll(() => layoutProblems(page, { pieces: { ...EDITOR_CHROME, ad }, uncut: NAME })).toEqual([])
  writeOutput('tablet-1-editor.png', await page.screenshot({ animations: 'disabled' }))

  // The bar by the selection and the selection's cards come, and the layer stays in sight.
  for (const layer of LAYERS) {
    await select(page, layer)
    await expect.poll(() => layoutProblems(page, { pieces: selected(layer[0]), uncut: NAME })).toEqual([])
    writeOutput(`tablet-2-${layer[0]}-selected.png`, await page.screenshot({ animations: 'disabled' }))
  }
})

test("on a tablet the design's name in the editor shows whole, neither cut off nor cut short", async ({ page }) => {
  test.setTimeout(90_000)
  await openEditor(page)
  await expect(page.locator(NAME)).toHaveText('Live editing')
  await expect.poll(() => layoutProblems(page)).toEqual([])
})
