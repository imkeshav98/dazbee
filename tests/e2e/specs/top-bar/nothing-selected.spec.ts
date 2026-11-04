// With nothing selected, the design's own panel and the page itself. Pages opens from by the zoom
// pill ("Pages 1/1") and counts each page's frames. A click on the page's background picks it: a
// dashed outline round each of its frames, their labels pink, and no top bar. A page with no frames
// says how to add one. No cards are left, nor the phones' properties button. Nothing overlaps at the
// three screen sizes, and the canvas never moves.
import type { DesignInput } from '@dazbee/schema'

import { designOf, editorPath, screenPoint, setCookies, writeOutput } from '../../support/editor.ts'
import { EDITOR_CHROME, layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { frameDesign, linkedFrames, seed } from '../../support/seed.ts'
import {
  click,
  drag,
  fitSettled,
  nextFrame,
  openStage,
  perform,
  pickPage,
  press,
  selection,
} from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, pagesPanel } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const PIECES = {
  ...EDITOR_CHROME,
  'edit panel': '#edit-panel',
  'top bar': '[data-testid="top-bar-row"]',
  'empty-page hint': '[data-testid="empty-page"]',
}

const solid = (color: string) => [{ type: 'solid' as const, color }]
/** A square frame with a headline, and a Story frame holding its linked copy. */
const design = (): DesignInput =>
  linkedFrames(
    frameDesign({
      name: 'Summer sale',
      fills: solid('#FFF8F0FF'),
      nodes: {
        headline: {
          type: 'text',
          parentId: 'sq',
          index: 'a0',
          name: 'Headline',
          props: {
            x: 80,
            y: 60,
            width: 600,
            height: 90,
            boxMode: 'autoHeight',
            text: 'Summer sale',
            style: { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 800, color: '#C2106CFF' },
          },
        },
      },
    }),
    [{ id: 'st', name: 'Story', width: 1080, height: 1920 }],
  )

/** Where each frame of the shown page is on screen: the ads, which the chrome keeps clear of at a fit. */
const ads = async (page: Page) => {
  const frames = await page.evaluate(() => window.dazbee?.frames() ?? [])
  return Promise.all(
    frames.map(async (f) => {
      const a = await screenPoint(page, 0, 0, f.key)
      const b = await screenPoint(page, f.width, f.height, f.key)
      return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }
    }),
  )
}
const camera = (page: Page) => page.evaluate(() => window.dazbee?.camera())
/** Deletes every frame of the shown page by command, one undo step each, so the page is empty. */
const emptyThePage = (page: Page) =>
  page.evaluate(() => {
    const editor = window.dazbee
    for (const frame of editor?.frames() ?? []) editor?.session.run('frame.delete', { frameId: frame.key })
  })

test('Pages opens from by the zoom pill: it counts the pages and their frames, adds one, shows one, and Esc gives the focus back', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  const button = page.getByTestId('pages-button')
  await expect(button).toHaveAccessibleName('Pages: page 1 of 1')
  await expect(button.locator('span:visible')).toHaveText('Pages 1/1')
  const panel = await pagesPanel(page)
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Pages')
  const pages = panel.getByTestId('pages').getByRole('listitem')
  await expect(pages).toHaveCount(1)
  await expect(pages.first()).toContainText('1. Page 1')
  await expect(pages.first()).toContainText('2 frames')
  // Add page adds the next, holding one frame, and brings it into view.
  await panel.getByTestId('add-page').click()
  await expect(pages).toHaveCount(2)
  await expect(button.locator('span:visible')).toHaveText('Pages 2/2')
  await expect(pages.nth(1)).toHaveAttribute('aria-current', 'page')
  await expect(pages.nth(1)).toContainText('1 frame')
  await expect.poll(() => page.evaluate(() => window.dazbee?.frames().length)).toBe(1)
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

test('a page with no frames says how to pick the Frame tool to add one, and Pages counts none; undo brings the frames back', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await expect(page.getByTestId('empty-page')).toHaveCount(0)
  await emptyThePage(page)
  const hint = page.getByTestId('empty-page')
  await expect(hint).toHaveText('Pick the Frame tool to add a frame')
  await expect(hint).toHaveAttribute('role', 'status')
  // The hint never takes a click: a press there reaches the stage under it.
  expect(await hint.evaluate((el) => getComputedStyle(el.parentElement ?? el).pointerEvents)).toBe('none')
  const pages = (await pagesPanel(page)).getByTestId('pages').getByRole('listitem')
  await expect(pages.first()).toContainText('No frames')
  await page.keyboard.press('Escape')
  await nextFrame(page)
  writeOutput('empty-page.png', await page.screenshot({ animations: 'disabled' }))
  // Two undo steps bring both frames back, and the hint goes.
  await perform(page, 'undo')
  await perform(page, 'undo')
  await expect.poll(() => page.evaluate(() => window.dazbee?.frames().length)).toBe(2)
  await expect(hint).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a click on the page picks it: a dashed outline round each frame, pink labels and no top bar; the layers keys leave it be', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  const still = await camera(page)
  await pickPage(page, 900, 900)
  // Each of its frames outlined, dashed, and their labels lit.
  await expect(page.locator('.stage-overlay .page-picked')).toHaveCount(2)
  expect(
    await page
      .locator('.stage-overlay .page-picked')
      .first()
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe('dashed')
  await expect(page.locator('.stage-overlay .frame-label[data-active]')).toHaveCount(2)
  // No layer is selected, and there is no small menu nor top bar.
  expect(await selection(page)).toEqual([])
  await expect(page.getByTestId('small-menu')).toHaveCount(0)
  await expect(page.getByTestId('top-bar')).toHaveCount(0)
  writeOutput('page-picked.png', await page.screenshot({ animations: 'disabled' }))

  // The layers' keys do nothing to the page.
  const before = await designOf(page)
  for (const key of ['Delete', 'Control+d', 'Control+c', 'ArrowRight']) await page.keyboard.press(key)
  expect(await designOf(page)).toBe(before)
  await expect(page.locator('.stage-overlay .page-picked')).toHaveCount(2)
  // Esc lets the page go.
  await page.keyboard.press('Escape')
  await expect(page.locator('.stage-overlay .page-picked')).toHaveCount(0)
  await expect(page.locator('.stage-overlay .frame-label[data-active]')).toHaveCount(0)

  // A click off every page lets it go too.
  await pickPage(page, 900, 900)
  // Under the square, where no frame is.
  await click(page, 500, 1100)
  await expect(page.locator('.stage-overlay .page-picked')).toHaveCount(0)
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
  // With a layer selected, a click on the page away from it picks the page and lets the layer go.
  await pickPage(page, 900, 900)
  expect(await selection(page)).toEqual([])
  // Picking never moved the canvas.
  expect(await camera(page)).toEqual(still)
  expect(errors).toEqual([])
})

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} Pages and the empty-page hint sit clear of everything, and the canvas stays`, async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, design())
    await page.setViewportSize({ width, height })
    await fitSettled(page)
    await nextFrame(page)
    const still = await camera(page)
    // No properties button on the phones' tab bar.
    await expect(page.locator('[data-panel="properties"]')).toHaveCount(0)
    if (width === 390) await expect(page.getByTestId('pages-button').locator('span:visible')).toHaveText('1/1')
    const check = async (name: string) => {
      await nextFrame(page)
      expect(
        await layoutProblems(page, { pieces: PIECES, uncut: 'h1, [data-testid="edit-panel-note"]' }),
        name,
      ).toEqual([])
      expect(await camera(page), name).toEqual(still)
      writeOutput(`${name}-${width}.png`, await page.screenshot({ animations: 'disabled' }))
    }
    // Fitted, the ads sit clear of the chrome: Pages and the zoom pill too.
    const [square, story] = await ads(page)
    if (!square || !story) throw new Error('no ads')
    expect(await layoutProblems(page, { pieces: { ...PIECES, square, story } })).toEqual([])
    await check('nothing-selected')
    await pagesPanel(page)
    await check('pages')
    await page.keyboard.press('Escape')
    // With the page's frames deleted, the hint over the stage keeps clear of the chrome too.
    await emptyThePage(page)
    await expect(page.getByTestId('empty-page')).toBeVisible()
    await check('empty-page')
    expect(errors).toEqual([])
  })
}

test('in Arabic Pages mirrors and sits clear of everything, and a colour hex reads left to right', async ({
  browser,
}) => {
  const designId = await seed(design())
  const context = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  const page = await context.newPage()
  await setCookies(page, { locale: 'ar' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  // Pages sits beside the zoom pill at the screen's left, the end side in Arabic.
  const pages = await page.getByTestId('pages-button').boundingBox()
  const zoom = await page.locator('[data-zoom]').boundingBox()
  expect(pages && zoom && pages.x > zoom.x + zoom.width).toBe(true)
  await pagesPanel(page)
  expect(await layoutProblems(page, { pieces: PIECES, uncut: 'h1, [data-testid="edit-panel-note"]' })).toEqual([])
  await page.keyboard.press('Escape')
  // A hex and its opacity read left to right in Arabic too, the # first: the headline's colour.
  await page.evaluate(() => window.dazbee?.select(['headline']))
  await (await barMenu(page, 'colour')).getByTestId('colour-pick').click()
  for (const name of ['colour-hex', 'colour-opacity'])
    expect(
      await page
        .locator(`[data-testid="bar-colour-menu"] [name="${name}"]`)
        .first()
        .evaluate((el) => getComputedStyle(el).direction),
    ).toBe('ltr')
  writeOutput('nothing-selected-rtl.png', await page.screenshot({ animations: 'disabled' }))
  expect(errors).toEqual([])
  await context.close()
})
