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

test('at 820×1180 a frame picked from its row ends clear of the panel its opened row makes taller', async ({
  browser,
}) => {
  // On a touch screen, where the rows are 44 px.
  const { page, errors } = await openSized(browser, { width: 820, height: 1180 }, { touch: true })
  // The three closed frame rows make a short panel; the frames sit below it.
  const short = await boxOf(page.getByTestId('flyout'))
  expect((await frameOnScreen(page, 'sq', 1080, 1080)).top).toBeGreaterThan(short.y + short.height)
  const zoom = await zoomOf(page)
  await frameRow(page, 'Sale square').click()
  await expect(frameRow(page, 'Sale square')).toHaveAttribute('aria-selected', 'true')
  // Its row opened, the panel reaches down over where the frame was: the frame ends clear of it.
  await expect.poll(async () => (await boxOf(page.getByTestId('flyout'))).height).toBeGreaterThan(short.height)
  const panel = await boxOf(page.getByTestId('flyout'))
  await expect
    .poll(async () => {
      const frame = await frameOnScreen(page, 'sq', 1080, 1080)
      return frame.left >= panel.x + panel.width || frame.top >= panel.y + panel.height
    })
    .toBe(true)
  expect(await zoomOf(page)).toBe(zoom)
  // Picked again, now clear of the panel, it stays put.
  const camera = await page.evaluate(() => window.dazbee?.camera())
  await frameRow(page, 'Sale square').click()
  await nextFrame(page)
  expect(await page.evaluate(() => window.dazbee?.camera())).toEqual(camera)
  expect(errors).toEqual([])
})

test('on a phone a frame under the panel picked from its closed row ends clear of the panel its opened row makes taller', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 390, height: 844 })
  const short = await boxOf(page.getByTestId('flyout'))
  // Sale square brought under the short panel.
  const now = await frameOnScreen(page, 'sq', 1080, 1080)
  await page.evaluate(
    (dy) => {
      const camera = window.dazbee?.camera()
      if (camera) window.dazbee?.setCamera({ ...camera, y: camera.y + dy })
    },
    short.y + 40 - now.top,
  )
  await nextFrame(page)
  const zoom = await zoomOf(page)
  await frameRow(page, 'Sale square').click()
  await expect.poll(async () => (await boxOf(page.getByTestId('flyout'))).height).toBeGreaterThan(short.height)
  const panel = await boxOf(page.getByTestId('flyout'))
  await expect.poll(async () => (await frameOnScreen(page, 'sq', 1080, 1080)).bottom).toBeLessThan(panel.y)
  expect(await zoomOf(page)).toBe(zoom)
  expect(errors).toEqual([])
})

test('on a phone a frame picked from its row above the panel stays put, its label under the chrome or not', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 390, height: 844 })
  // The deep group open, the panel stands as tall as it gets.
  await page.evaluate(() => window.dazbee?.select(['picture']))
  await expect(row(page, 'Picture')).toBeInViewport()
  const panel = await boxOf(page.getByTestId('flyout'))
  // Picked once, Sale square comes up out from under the panel.
  await frameRow(page, 'Sale square').click()
  await expect.poll(async () => (await frameOnScreen(page, 'sq', 1080, 1080)).bottom).toBeLessThan(panel.y)
  // A layer selected, then the frame picked again from its row: nothing moves.
  await row(page, 'Badge').getByTestId('layer-name').click()
  await expect(row(page, 'Badge')).toHaveAttribute('aria-selected', 'true')
  const camera = await page.evaluate(() => window.dazbee?.camera())
  await frameRow(page, 'Sale square').click()
  await expect(frameRow(page, 'Sale square')).toHaveAttribute('aria-selected', 'true')
  await nextFrame(page)
  expect(await page.evaluate(() => window.dazbee?.camera())).toEqual(camera)
  expect(errors).toEqual([])
})

test('on a phone a layer picked from its row just above the panel stays clear of it, its frame label under the bar', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 390, height: 844 })
  // The deep group open, the panel stands as tall as it gets.
  await page.evaluate(() => window.dazbee?.select(['picture']))
  await expect(row(page, 'Picture')).toBeInViewport()
  const panel = await boxOf(page.getByTestId('flyout'))
  // Badge's bottom 10 px above the panel, Sale square's top and label up under the bar.
  await page.evaluate((top) => {
    const editor = window.dazbee
    const camera = editor?.camera()
    if (!editor || !camera) return
    editor.setCamera({ zoom: 0.25, x: camera.x, y: top - 10 - 860 * 0.25 })
  }, panel.y)
  await nextFrame(page)
  const camera = await page.evaluate(() => window.dazbee?.camera())
  await row(page, 'Badge').getByTestId('layer-name').click()
  await expect(row(page, 'Badge')).toHaveAttribute('aria-selected', 'true')
  await nextFrame(page)
  await nextFrame(page)
  const badge = await page.evaluate(() => {
    const editor = window.dazbee
    const box = editor?.boxOf('badge')
    return box && editor?.screenPoint(box.x, box.y + box.height).y
  })
  expect(badge).toBeLessThan(panel.y)
  expect(await page.evaluate(() => window.dazbee?.camera())).toEqual(camera)
  expect(errors).toEqual([])
})

test('on a phone with the panel open a layer tapped under the bar comes clear of the bar and stays clear of the panel', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 390, height: 844 }, { touch: true })
  // Headline's top 84 px down the screen at 30%, where the bar's rows will show.
  await page.evaluate(() => {
    const editor = window.dazbee
    const box = editor?.boxOf('head')
    const camera = editor?.camera()
    if (!editor || !box || !camera) return
    const zoomed = { zoom: 0.3, x: camera.x, y: camera.y }
    editor.setCamera(zoomed)
    const top = editor.screenPoint(box.x, box.y).y
    editor.setCamera({ ...zoomed, y: zoomed.y + 84 - top })
  })
  await nextFrame(page)
  const head = await page.evaluate(() => {
    const box = window.dazbee?.boxOf('head')
    return box ? window.dazbee?.screenPoint(box.x + box.width / 2, box.y + box.height / 2) : undefined
  })
  await page.touchscreen.tap(head?.x ?? 0, head?.y ?? 0)
  await expect.poll(() => page.evaluate(() => window.dazbee?.selection())).toEqual(['head'])
  await page.waitForTimeout(500)
  const panel = await boxOf(page.getByTestId('flyout'))
  const on = await page.evaluate(() => {
    const edges = (el: Element | null) => {
      if (!el?.checkVisibility({ visibilityProperty: true })) return []
      const { top, bottom } = el.getBoundingClientRect()
      return [{ top, bottom }]
    }
    const box = window.dazbee?.boxOf('head')
    const editor = window.dazbee
    return {
      bar: ['top-bar-row', 'top-bar-overflow'].flatMap((row) =>
        edges(document.querySelector(`[data-testid="${row}"]`)),
      ),
      box:
        box && editor
          ? [{ top: editor.screenPoint(box.x, box.y).y, bottom: editor.screenPoint(box.x, box.y + box.height).y }]
          : [],
    }
  })
  const barBottom = Math.max(...on.bar.map((row) => row.bottom))
  // The layer comes clear of both rows; it and its size label stay above the panel, so where the
  // frame's label can't come clear too, it stays under the bar.
  for (const piece of on.box) expect(piece.top).toBeGreaterThanOrEqual(barBottom)
  const selected = await page.evaluate(() => window.dazbee?.selectionRect())
  expect((selected?.y ?? 0) + (selected?.height ?? Infinity)).toBeLessThan(panel.y)
  expect(errors).toEqual([])
})
