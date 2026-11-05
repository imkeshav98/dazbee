// A click picks what shows, with real pointer input: through a cut-out photo's clear corners,
// an ellipse's empty corners, the gaps between a star's points and the box after short text, the
// layer beneath is picked, and a hover outlines the same layer a click picks. A selected layer still
// drags from an empty part of its box, a double click anywhere in a selected text's box types into
// it, and a drag from a see-through part moves what shows there, as one undo step. Taps pick the same at the three screen sizes, and a click and a hover over 200
// see-through layers are timed. Layers drawn under 10% opaque (opacity 0, a clear fill, a black
// luminance mask, a photo at 5%) pass a click, a hover and a tap to the floor beneath at the three
// screen sizes, and one selected from the layers panel still counts all over its box.

import { upload } from '../../support/assets.ts'
import {
  CLEAR_FILL_STROKE,
  clickThroughDesign,
  cutOutPng,
  FAINT_SPOTS,
  faintDesign,
  SPOTS,
  STACKED,
  stackedDesign,
  THROUGH_ALL,
} from '../../support/click-through.ts'
import { editorPath, screenPoint, setCookies, writeOutput } from '../../support/editor.ts'
import { openLayers, row, tree } from '../../support/layers-panel.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { PERF, report, spread } from '../../support/perf.ts'
import { seed } from '../../support/seed.ts'
import {
  type Box,
  boxOf,
  click,
  drag,
  drawn,
  fitSettled,
  openStage,
  press,
  props,
  selection,
} from '../../support/stage.ts'
import { type Browser, expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

/** The overlay's hover outline on screen, or null while nothing is hovered. */
const hoverOutline = (page: Page) => page.locator('.stage-overlay > .hover').boundingBox()

/** A layer's box on screen, from its box in the frame. */
async function onScreen(page: Page, id: string): Promise<Box> {
  const box = await boxOf(page, id)
  const from = await screenPoint(page, box.x, box.y)
  const to = await screenPoint(page, box.x + box.width, box.y + box.height)
  return { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y }
}

/** Moves the mouse over a point of the frame, as a hand would, and waits for the overlay to show it. */
async function hover(page: Page, at: { x: number; y: number }) {
  const screen = await screenPoint(page, at.x, at.y)
  await page.mouse.move(screen.x - 6, screen.y - 6)
  await page.mouse.move(screen.x, screen.y, { steps: 3 })
  await drawn(page)
}

/** Whether the hover outline is where a layer's box is on screen, within a pixel or two. */
async function outlines(page: Page, id: string) {
  const want = await onScreen(page, id)
  const got = await hoverOutline(page)
  return !!got && Math.max(...(['x', 'y', 'width', 'height'] as const).map((k) => Math.abs(got[k] - want[k]))) < 2
}

/**
 * Opens a design alone in a tab at a screen size, dark unless `theme` says, on a touch screen when
 * `touch`, fitted and its images loaded.
 */
async function openSized(
  browser: Browser,
  viewport: { width: number; height: number },
  content: Parameters<typeof seed>[0],
  touch = false,
  theme: 'dark' | 'light' = 'dark',
) {
  const designId = await seed(content)
  const page = await (await browser.newContext({ viewport, hasTouch: touch, isMobile: touch })).newPage()
  await setCookies(page, { theme })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
  await page.evaluate(() => window.dazbee?.loaded())
  await fitSettled(page)
  return page
}

/** Opens the click-through frame at 1440 × 1000 with its cut-out photo loaded. */
async function openClickThrough(browser: Browser) {
  const asset = await upload(await cutOutPng())
  const { page, errors } = await openStage(browser, clickThroughDesign(asset.id))
  await page.evaluate(() => window.dazbee?.loaded())
  await drawn(page)
  return { page, errors, assetId: asset.id }
}

test('a click picks the layer that shows under the pointer, and the layer beneath through what is see-through', async ({
  browser,
}) => {
  const { page, errors } = await openClickThrough(browser)
  for (const spot of Object.values(SPOTS)) {
    await click(page, spot.at.x, spot.at.y)
    expect(await selection(page), spot.what).toEqual([spot.picks])
  }
  expect(errors).toEqual([])
})

test('a hover outlines the layer a click there picks', async ({ browser }) => {
  const { page, errors } = await openClickThrough(browser)
  for (const spot of Object.values(SPOTS)) {
    await hover(page, spot.at)
    const want = await onScreen(page, spot.picks)
    await expect
      .poll(async () => {
        const got = await hoverOutline(page)
        return got && Math.max(...(['x', 'y', 'width', 'height'] as const).map((k) => Math.abs(got[k] - want[k])))
      }, spot.what)
      .toBeLessThan(2)
  }
  expect(errors).toEqual([])
})

test('a selected layer drags from an empty part of its box, and a click there picks the layer beneath', async ({
  browser,
}) => {
  const { page, errors } = await openClickThrough(browser)
  const { ellipse, ellipseCorner } = SPOTS
  await click(page, ellipse.at.x, ellipse.at.y)
  expect(await selection(page)).toEqual(['ellipse'])
  // A click on the selected ellipse's empty corner picks what shows there.
  await click(page, ellipseCorner.at.x, ellipseCorner.at.y)
  expect(await selection(page)).toEqual(['backdrop'])
  await click(page, ellipse.at.x, ellipse.at.y)
  // A drag from the same corner moves the ellipse, not the backdrop, as one undo step.
  await drag(page, ellipseCorner.at, { x: ellipseCorner.at.x + 40, y: ellipseCorner.at.y + 40 })
  expect(await selection(page)).toEqual(['ellipse'])
  expect(await props(page, 'ellipse')).toMatchObject({ x: 620, y: 100 })
  expect(await props(page, 'backdrop')).toMatchObject({ x: 560, y: 40 })
  await press(page, 'undo')
  expect(await props(page, 'ellipse')).toMatchObject({ x: 580, y: 60 })
  await press(page, 'redo')
  expect(await props(page, 'ellipse')).toMatchObject({ x: 620, y: 100 })
  expect(errors).toEqual([])
})

test("a double click in a selected text's empty box types into it, and in an unselected one's picks what shows there", async ({
  browser,
}) => {
  const { page, errors } = await openClickThrough(browser)
  const { text, afterText, belowText } = SPOTS
  for (const spot of [afterText, belowText]) {
    await click(page, text.at.x, text.at.y)
    expect(await selection(page)).toEqual(['words'])
    const at = await screenPoint(page, spot.at.x, spot.at.y)
    await page.mouse.dblclick(at.x, at.y)
    await drawn(page)
    await expect(page.locator('.caret'), spot.what).toBeVisible()
    expect(await selection(page)).toEqual(['words'])
    // The caret goes to the nearest place in the text: after its one short line.
    await page.keyboard.type('!')
    await page.keyboard.press('Escape')
    await drawn(page)
    expect(await props(page, 'words'), spot.what).toMatchObject({ text: 'Sale!' })
    await press(page, 'undo')
    expect(await props(page, 'words')).toMatchObject({ text: 'Sale' })
  }
  // With the text not selected, the same double click picks the layer that shows there.
  await page.keyboard.press('Escape')
  await click(page, SPOTS.star.at.x, SPOTS.star.at.y)
  const at = await screenPoint(page, afterText.at.x, afterText.at.y)
  await page.mouse.dblclick(at.x, at.y)
  await drawn(page)
  expect(await selection(page)).toEqual([afterText.picks])
  await expect(page.locator('.caret')).toHaveCount(0)
  expect(errors).toEqual([])
})

test("a drag from a cut-out photo's clear corner moves the layer beneath, and undo and redo take it back and again", async ({
  browser,
}) => {
  const { page, errors } = await openClickThrough(browser)
  const { photoCorner } = SPOTS
  await drag(page, photoCorner.at, { x: photoCorner.at.x + 50, y: photoCorner.at.y + 30 })
  expect(await selection(page)).toEqual(['base'])
  expect(await props(page, 'base')).toMatchObject({ x: 90, y: 70 })
  expect(await props(page, 'cutout')).toMatchObject({ x: 60, y: 60 })
  await press(page, 'undo')
  expect(await props(page, 'base')).toMatchObject({ x: 40, y: 40 })
  await press(page, 'redo')
  expect(await props(page, 'base')).toMatchObject({ x: 90, y: 70 })
  expect(errors).toEqual([])
})

for (const [width, height] of SCREEN_SIZES) {
  test(`a tap picks what shows at ${width}×${height} on a touch screen`, async ({ browser }) => {
    const asset = await upload(await cutOutPng())
    const page = await openSized(browser, { width, height }, clickThroughDesign(asset.id), true)
    for (const spot of [SPOTS.ellipseCorner, SPOTS.ellipse, SPOTS.photoCorner, SPOTS.afterText]) {
      const at = await screenPoint(page, spot.at.x, spot.at.y)
      await page.touchscreen.tap(at.x, at.y)
      await drawn(page)
      expect(await selection(page), spot.what).toEqual([spot.picks])
    }
  })
}

for (const [width, height] of SCREEN_SIZES) {
  test(`a click and a hover pass through layers drawn under 10% opaque at ${width}×${height}`, async ({ browser }) => {
    const asset = await upload(await cutOutPng())
    const page = await openSized(browser, { width, height }, faintDesign(asset.id))
    for (const spot of Object.values(FAINT_SPOTS)) {
      await hover(page, spot.at)
      await expect.poll(() => outlines(page, spot.picks), spot.what).toBe(true)
    }
    for (const spot of [...Object.values(FAINT_SPOTS), CLEAR_FILL_STROKE]) {
      await page.keyboard.press('Escape')
      await click(page, spot.at.x, spot.at.y)
      expect(await selection(page), spot.what).toEqual([spot.picks])
    }
  })

  test(`a tap passes through layers drawn under 10% opaque at ${width}×${height} on a touch screen`, async ({
    browser,
  }) => {
    const asset = await upload(await cutOutPng())
    const page = await openSized(browser, { width, height }, faintDesign(asset.id), true)
    for (const spot of [...Object.values(FAINT_SPOTS), CLEAR_FILL_STROKE]) {
      const at = await screenPoint(page, spot.at.x, spot.at.y)
      await page.touchscreen.tap(at.x, at.y)
      await drawn(page)
      expect(await selection(page), spot.what).toEqual([spot.picks])
    }
  })
}

test('a layer at opacity 0 picked in the layers panel counts all over its box: a click keeps it, a drag moves it', async ({
  browser,
}) => {
  const asset = await upload(await cutOutPng())
  const { page, errors } = await openStage(browser, faintDesign(asset.id))
  await page.evaluate(() => window.dazbee?.loaded())
  await openLayers(page)
  await row(page, 'Gone').click()
  expect(await selection(page)).toEqual(['zero'])
  // Closed again, the panel leaves the stage's points clear.
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  await expect(tree(page)).toBeHidden()
  const { zero } = FAINT_SPOTS
  // Hovered, it is what the pointer is on: being selected, it has no hover outline, and the floor isn't outlined.
  await hover(page, zero.at)
  await expect(page.locator('.stage-overlay > .hover')).toHaveCount(0)
  await click(page, zero.at.x, zero.at.y)
  expect(await selection(page)).toEqual(['zero'])
  await drag(page, zero.at, { x: zero.at.x + 40, y: zero.at.y + 20 })
  expect(await selection(page)).toEqual(['zero'])
  expect(await props(page, 'zero')).toMatchObject({ x: 120, y: 100 })
  expect(await props(page, 'floor')).toMatchObject({ x: 0, y: 0 })
  await press(page, 'undo')
  expect(await props(page, 'zero')).toMatchObject({ x: 80, y: 80 })
  await press(page, 'redo')
  expect(await props(page, 'zero')).toMatchObject({ x: 120, y: 100 })
  // Once it is let go, a click there passes through it again.
  await page.keyboard.press('Escape')
  await click(page, zero.at.x + 40, zero.at.y + 20)
  expect(await selection(page)).toEqual(['floor'])
  expect(errors).toEqual([])
})

/** Marks where a pointer is: a headless screenshot has no cursor. */
async function markPointer(page: Page, screen: { x: number; y: number }) {
  await page.evaluate(({ x, y }) => {
    document.getElementById('pointer-mark')?.remove()
    const mark = document.createElement('div')
    mark.id = 'pointer-mark'
    Object.assign(mark.style, {
      position: 'fixed',
      left: `${x - 9}px`,
      top: `${y - 9}px`,
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      border: '2px solid #ffffff',
      boxShadow: '0 0 0 2px #111111',
      pointerEvents: 'none',
      zIndex: '2147483647',
    })
    document.body.append(mark)
  }, screen)
}

for (const [width, height] of SCREEN_SIZES) {
  for (const theme of ['dark', 'light'] as const) {
    test(
      `evidence: a hover passing through each faint layer to the floor, ${width}×${height} ${theme}`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const asset = await upload(await cutOutPng())
        const page = await openSized(browser, { width, height }, faintDesign(asset.id), false, theme)
        for (const [name, spot] of Object.entries(FAINT_SPOTS)) {
          await hover(page, spot.at)
          await expect.poll(() => outlines(page, spot.picks), spot.what).toBe(true)
          await markPointer(page, await screenPoint(page, spot.at.x, spot.at.y))
          writeOutput(
            `faint-hover-${name}-${width}x${height}-${theme}.png`,
            await page.screenshot({ animations: 'disabled' }),
          )
        }
      },
    )
  }
}

test(
  'evidence: the hover outline on the layer that shows through, 1280×760 dark',
  { tag: '@evidence' },
  async ({ browser }) => {
    const asset = await upload(await cutOutPng())
    const page = await openSized(browser, { width: 1280, height: 760 }, clickThroughDesign(asset.id))
    const shots = {
      photoCorner: 'under-cut-out-corner',
      ellipseCorner: 'through-ellipse-corner',
      afterText: 'beside-short-text',
    }
    for (const [key, name] of Object.entries(shots) as [keyof typeof shots, string][]) {
      const { at, picks } = SPOTS[key]
      // Close enough to see the outline: the layer it lands on in the middle of the window at 110%.
      const box = await boxOf(page, picks)
      const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      await page.evaluate(
        ({ x, y }) => window.dazbee?.setCamera({ x: 640 - x * 1.1, y: 380 - y * 1.1, zoom: 1.1 }),
        middle,
      )
      await hover(page, at)
      await expect(page.locator('.stage-overlay > .hover')).toBeVisible()
      // A headless screenshot has no cursor: a ring marks where the pointer is.
      const screen = await screenPoint(page, at.x, at.y)
      await page.evaluate(({ x, y }) => {
        document.getElementById('pointer-mark')?.remove()
        const mark = document.createElement('div')
        mark.id = 'pointer-mark'
        Object.assign(mark.style, {
          position: 'fixed',
          left: `${x - 9}px`,
          top: `${y - 9}px`,
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          border: '2px solid #ffffff',
          boxShadow: '0 0 0 2px #111111',
          pointerEvents: 'none',
          zIndex: '2147483647',
        })
        document.body.append(mark)
      }, screen)
      writeOutput(`click-through-hover-${name}.png`, await page.screenshot({ animations: 'disabled' }))
    }
  },
)

test(
  `a click and a hover over ${STACKED} layers that each show nothing there: what the pointer takes`,
  PERF,
  async ({ browser }) => {
    const asset = await upload(await cutOutPng())
    const { page } = await openStage(browser, stackedDesign(asset.id))
    await page.evaluate(() => window.dazbee?.loaded())
    await drawn(page)
    // Time every pointer move and press from its capture to the end of its handling.
    await page.evaluate(() => {
      const times = { pointermove: [] as number[], pointerdown: [] as number[] }
      for (const type of ['pointermove', 'pointerdown'] as const) {
        let started = 0
        window.addEventListener(type, () => (started = performance.now()), { capture: true })
        window.addEventListener(type, () => times[type].push(performance.now() - started))
      }
      ;(window as unknown as { times: typeof times }).times = times
    })
    const at = await screenPoint(page, THROUGH_ALL.x, THROUGH_ALL.y)
    for (let i = 0; i < 60; i++) await page.mouse.move(at.x + (i % 3), at.y + ((i >> 1) % 3))
    await page.mouse.move(at.x, at.y)
    for (let i = 0; i < 30; i++) {
      await page.mouse.down()
      await page.mouse.up()
    }
    await drawn(page)
    expect(await selection(page)).toEqual(['floor'])
    const times = await page.evaluate(
      () => (window as unknown as { times: { pointermove: number[]; pointerdown: number[] } }).times,
    )
    // What a click picks there, alone: the hit test and the selection it keeps.
    const picks = await page.evaluate((client) => {
      const ms: number[] = []
      for (let i = 0; i < 200; i++) {
        const started = performance.now()
        window.dazbee?.selectAt(client)
        ms.push(performance.now() - started)
      }
      return ms
    }, at)
    report(`Click through, ${STACKED} see-through layers`, {
      'hover (pointer move)': spread(times.pointermove),
      'click (pointer down)': spread(times.pointerdown),
      'what a click picks (selectAt)': spread(picks),
    })
  },
)
