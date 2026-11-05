// The layers panel's rows as they look, in Chromium: a frame picked from its row brought out from
// under the panel at the same zoom.
import { screenPoint } from '../../support/editor.ts'
import { openDesign } from '../../support/layers-frames.ts'
import { frameRow } from '../../support/layers-panel.ts'
import { nextFrame } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

/** Where an element is on screen. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('not on screen')
  return box
}
/** A frame's place on screen, from its top start corner to its bottom end one. */
async function frameOnScreen(page: Page, frameId: string, width: number, height: number) {
  const start = await screenPoint(page, 0, 0, frameId)
  const end = await screenPoint(page, width, height, frameId)
  return { left: start.x, top: start.y, right: end.x, bottom: end.y }
}
const zoomOf = (page: Page) => page.evaluate(() => window.dazbee?.camera().zoom ?? 1)

test('a frame picked from its row under the panel is brought out from under it at the same zoom; one in the clear stays put', async ({
  browser,
}) => {
  const {
    tabs: [page],
    errors,
  } = await openDesign(browser)
  if (!page) throw new Error('no tab')
  const panel = await boxOf(page.getByTestId('flyout'))
  const zoom = await zoomOf(page)
  // Fitted before the panel opened, Sale story shows whole beside it: picking it moves nothing.
  const camera = await page.evaluate(() => window.dazbee?.camera())
  await frameRow(page, 'Sale story').click()
  await expect(frameRow(page, 'Sale story')).toHaveAttribute('aria-selected', 'true')
  await nextFrame(page)
  expect(await page.evaluate(() => window.dazbee?.camera())).toEqual(camera)
  // Sale square sits partly under the panel: picking it brings it out, the zoom as it was.
  expect((await frameOnScreen(page, 'sq', 1080, 1080)).left).toBeLessThan(panel.x + panel.width)
  await frameRow(page, 'Sale square').click()
  await expect
    .poll(async () => (await frameOnScreen(page, 'sq', 1080, 1080)).left)
    .toBeGreaterThan(panel.x + panel.width)
  expect(await zoomOf(page)).toBe(zoom)
  expect(errors).toEqual([])
})
