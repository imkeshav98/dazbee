// The layers panel's rows as they look, in Chromium: a frame's size read width × height in Arabic
// too, every layer row's hide and lock in one column with its label in the frames' size column, a
// frame's swatch showing its background as it looks, see-through too, a shape's picture bare beside
// a text's outlined tile, no pink ring on a picked frame's or selected layer's picture, and a frame
// picked from its row brought out from under the panel at the same zoom.
import { screenPoint, writeOutput } from '../../support/editor.ts'
import { layerRow, openDesign, openSized } from '../../support/layers-frames.ts'
import { frameRow, rect, row } from '../../support/layers-panel.ts'
import { frameDesign } from '../../support/seed.ts'
import { nextFrame } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

/** A frame of half see-through red holding one shape. */
const halfRed = () =>
  frameDesign({
    name: 'Half red',
    frameName: 'Half red',
    fills: [{ type: 'solid', color: '#FF000080' }],
    nodes: {
      dot: { type: 'graphic', parentId: 'sq', index: 'a0', name: 'Dot', props: rect(40, 40, 200, 200, '#1A1420FF') },
    },
  })

/** Where an element is on screen. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('not on screen')
  return box
}
/** The colour drawn at the middle of an element, read from a screenshot of it. */
async function middleColour(page: Page, locator: Locator) {
  const png = (await locator.screenshot({ animations: 'disabled' })).toString('base64')
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const paint = document.createElement('canvas')
    paint.width = img.width
    paint.height = img.height
    const g = paint.getContext('2d')
    if (!g) return null
    g.drawImage(img, 0, 0)
    return [...g.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data.slice(0, 3)]
  }, png)
}
/** A frame's place on screen, from its top start corner to its bottom end one. */
async function frameOnScreen(page: Page, frameId: string, width: number, height: number) {
  const start = await screenPoint(page, 0, 0, frameId)
  const end = await screenPoint(page, width, height, frameId)
  return { left: start.x, top: start.y, right: end.x, bottom: end.y }
}
const zoomOf = (page: Page) => page.evaluate(() => window.dazbee?.camera().zoom ?? 1)

test('in Arabic a frame row’s size reads width × height, as its label on the canvas does', async ({ browser }) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 }, { locale: 'ar' })
  const size = frameRow(page, 'Sale story').getByTestId('frame-size')
  await expect(size).toHaveText('1080×1920')
  // The width is the digits before ×: they come first from the left, as the canvas label reads.
  const widthFirst = await size.evaluate((el) => {
    const text = el.firstChild
    if (!(text instanceof Text)) return null
    const range = document.createRange()
    const leftOf = (from: number, to: number) => {
      range.setStart(text, from)
      range.setEnd(text, to)
      return range.getBoundingClientRect().left
    }
    const cut = text.data.indexOf('×')
    return leftOf(0, cut) < leftOf(cut + 1, text.data.length)
  })
  expect(widthFirst).toBe(true)
  await frameRow(page, 'Sale square').click()
  await expect(layerRow(page, 'badge').getByTestId('layer-picture').locator('img')).toHaveCount(1)
  writeOutput('layers-frames-ar.png', await page.screenshot({ animations: 'disabled' }))
  expect(errors).toEqual([])
})

test('every layer row’s hide and lock sit in one column, labelled or not, and the labels in the frames’ size column', async ({
  browser,
}) => {
  const {
    tabs: [page],
    errors,
  } = await openDesign(browser)
  if (!page) throw new Error('no tab')
  await frameRow(page, 'Sale square').click()
  await expect(row(page, 'Photo')).toBeVisible()
  // Badge says "only here", Button is locked, Logo hidden; Headline and Photo have neither.
  const ids = ['badge', 'button', 'logo', 'head', 'photo']
  for (const toggle of ['layer-hide', 'layer-lock']) {
    const xs = await Promise.all(
      ids.map(async (id) => Math.round((await boxOf(layerRow(page, id).getByTestId(toggle))).x)),
    )
    expect(new Set(xs).size, `${toggle} at ${xs.join(', ')}`).toBe(1)
  }
  // Where the label's words end: where a frame's size ends.
  const wordsEnd = (locator: Locator) =>
    locator.evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return Math.round(range.getBoundingClientRect().right)
    })
  expect(await wordsEnd(layerRow(page, 'badge').getByTestId('layer-only-here'))).toBe(
    await wordsEnd(frameRow(page, 'Sale square').getByTestId('frame-size')),
  )
  expect(errors).toEqual([])
})

test('a frame’s swatch shows its background as it looks, see-through too, and keeps its neutral edge when picked', async ({
  browser,
}) => {
  for (const theme of ['light', 'dark']) {
    const { page, errors } = await openSized(browser, { width: 1280, height: 760 }, { theme, content: halfRed() })
    const swatch = frameRow(page, 'Half red').getByTestId('frame-swatch')
    const [r = 0, g = 0, b = 0] = (await middleColour(page, swatch)) ?? []
    // Half red over the panel: pink on light, a dark red on dark; never solid red.
    if (theme === 'light')
      expect([r > 200, g > 60 && g < 200, b > 60 && b < 200], `${r},${g},${b}`).toEqual([true, true, true])
    else expect(r, `${r},${g},${b}`).toBeLessThan(200)
    const edge = () => swatch.evaluate((el) => getComputedStyle(el).borderTopColor)
    const before = await edge()
    await frameRow(page, 'Half red').click()
    await expect(frameRow(page, 'Half red')).toHaveAttribute('aria-selected', 'true')
    expect(await edge()).toBe(before)
    expect(errors).toEqual([])
    await page.context().close()
  }
})

test('a shape’s picture is bare, a text’s icon on an outlined tile, and a selected layer’s picture has no ring', async ({
  browser,
}) => {
  const {
    tabs: [page],
    errors,
  } = await openDesign(browser)
  if (!page) throw new Error('no tab')
  await frameRow(page, 'Sale square').click()
  const badge = layerRow(page, 'badge').getByTestId('layer-picture')
  await expect(badge.locator('img')).toHaveCount(1)
  const look = (locator: Locator) =>
    locator.evaluate((el) => {
      const style = getComputedStyle(el)
      return { border: style.borderTopWidth, fill: style.backgroundColor, ring: style.boxShadow }
    })
  expect(await look(badge)).toEqual({ border: '0px', fill: 'rgba(0, 0, 0, 0)', ring: 'none' })
  expect((await boxOf(badge.locator('img'))).width).toBe(20)
  expect((await look(layerRow(page, 'head').getByTestId('layer-picture'))).border).toBe('1px')
  // Selected, Badge's row is tinted and its picture stays bare.
  await row(page, 'Badge').click()
  await expect(row(page, 'Badge')).toHaveAttribute('aria-selected', 'true')
  await nextFrame(page)
  expect(await look(badge)).toEqual({ border: '0px', fill: 'rgba(0, 0, 0, 0)', ring: 'none' })
  expect(errors).toEqual([])
})

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

test('at 820×1180 a frame picked from its row below the panel stays put', async ({ browser }) => {
  const { page, errors } = await openSized(browser, { width: 820, height: 1180 })
  const panel = await boxOf(page.getByTestId('flyout'))
  // The three closed frame rows make a short panel; the frames sit below it.
  expect((await frameOnScreen(page, 'sq', 1080, 1080)).top).toBeGreaterThan(panel.y + panel.height)
  const camera = await page.evaluate(() => window.dazbee?.camera())
  await frameRow(page, 'Sale square').click()
  await expect(frameRow(page, 'Sale square')).toHaveAttribute('aria-selected', 'true')
  await nextFrame(page)
  expect(await page.evaluate(() => window.dazbee?.camera())).toEqual(camera)
  expect(errors).toEqual([])
})
