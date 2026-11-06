// With nothing selected, the design's own panel and the page itself. Pages opens from by the zoom
// pill ("Pages 1/1") and counts each page's frames. A page with no frames says how to add one. No
// cards are left, nor the phones' properties button. Nothing overlaps at the three screen sizes, and
// the canvas never moves.
import type { DesignInput } from '@dazbee/schema'

import { editorPath, screenPoint, setCookies, writeOutput } from '../../support/editor.ts'
import { EDITOR_CHROME, layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { frameDesign, linkedFrames, seed } from '../../support/seed.ts'
import { fitSettled, nextFrame, openStage, perform } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'
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
      const a = await screenPoint(page, 0, 0, f.id)
      const b = await screenPoint(page, f.width, f.height, f.id)
      return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }
    }),
  )
}
const camera = (page: Page) => page.evaluate(() => window.dazbee?.camera())
/** Deletes every frame of the shown page by command, one undo step each, so the page is empty. */
const emptyThePage = (page: Page) =>
  page.evaluate(() => {
    const editor = window.dazbee
    for (const frame of editor?.frames() ?? []) editor?.session.run('frame.delete', { frameId: frame.id })
  })
/** Page White, holding a square frame filled white, and a second page holding one square frame of its own. */
const twoPages = (name: string, fills: DesignInput['frames'][string]['fills']): DesignInput => {
  const first = frameDesign({ name: 'Tiles', fills: solid('#FFFFFFFF') })
  return {
    ...first,
    pages: { p1: { name: 'White', order: 'a0' }, p2: { name, order: 'a1' } },
    frames: {
      ...first.frames,
      'p2-sq': { pageId: 'p2', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, fills, order: 'a0' },
    },
  }
}
/**
 * The contrast of the page number on a page row's tile with what shows behind it there: every
 * background under the number's middle, laid one over another, as WCAG counts contrast.
 */
const numberContrast = (row: Locator, n: number) =>
  row.evaluate((el, n) => {
    const paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const rgba = (css: string) => {
      if (!paint) return [0, 0, 0, 0]
      paint.clearRect(0, 0, 1, 1)
      paint.fillStyle = css
      paint.fillRect(0, 0, 1, 1)
      const [r = 0, g = 0, b = 0, a = 0] = paint.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const holder = [...el.querySelectorAll('*')].find((one) =>
      [...one.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim() === String(n)),
    )
    if (!holder) return 0
    const box = holder.getBoundingClientRect()
    const under: number[][] = []
    for (const one of document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2)) {
      const colour = rgba(getComputedStyle(one).backgroundColor)
      under.push(colour)
      if (colour[3] === 1) break
    }
    const behind = under
      .reverse()
      .reduce(
        (below, [r = 0, g = 0, b = 0, a = 0]) => [r, g, b].map((c, i) => c * a + (below[i] ?? 0) * (1 - a)),
        [255, 255, 255],
      )
    const lum = (rgb: number[]) => {
      const [lr = 0, lg = 0, lb = 0] = rgb.map((c) => {
        const s = c / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
    }
    const ink = lum(rgba(getComputedStyle(holder).color).slice(0, 3))
    const back = lum(behind)
    return (Math.max(ink, back) + 0.05) / (Math.min(ink, back) + 0.05)
  }, n)

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
  await page.getByRole('menu', { name: 'More for Page 2' }).getByRole('menuitem', { name: 'Delete page' }).click()
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

test("a page's number on its tile, before its picture is drawn, reads over a white frame and a yellow one", async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, twoPages('Yellow', solid('#FFD23FFF')))
  // No picture is drawn, so each tile shows its first frame's colour and the page's number.
  await page.evaluate(() => {
    if (window.dazbee) window.dazbee.pageThumbnail = () => null
  })
  const panel = await pagesPanel(page)
  const pages = panel.getByTestId('pages').getByRole('listitem')
  await expect(pages).toHaveCount(2)
  for (const [i, colour] of ['rgb(255, 255, 255)', 'rgb(255, 210, 63)'].entries()) {
    const tile = pages.nth(i)
    await expect(tile.getByTestId('page-thumbnail')).toHaveCSS('background-color', colour)
    expect(await numberContrast(tile, i + 1)).toBeGreaterThanOrEqual(4.5)
  }
  writeOutput('pages-numbers-white-yellow.png', await page.screenshot({ animations: 'disabled' }))
  expect(errors).toEqual([])
})

test("in dark theme a page's tile shows its first frame's picture on white, as the canvas does, with its number over it", async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, twoPages('Bare', []))
  await setCookies(page, { theme: 'dark' })
  await page.reload()
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  const panel = await pagesPanel(page)
  const pages = panel.getByTestId('pages').getByRole('listitem')
  await expect(pages).toHaveCount(2)
  await expect(panel.getByTestId('page-thumbnail').locator('img')).toHaveCount(2)
  for (const i of [0, 1]) {
    const tile = pages.nth(i)
    await expect(tile.getByTestId('page-thumbnail')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(tile.getByTestId('page-number')).toHaveText(String(i + 1))
    expect(await numberContrast(tile, i + 1)).toBeGreaterThanOrEqual(4.5)
  }
  writeOutput('pages-tiles-dark.png', await page.screenshot({ animations: 'disabled' }))
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
    await expect(page.getByTestId('pages-button').locator('span:visible')).toHaveText('Pages 1/1')
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
    // On a phone the Pages card drops under its button, the dock still showing under it.
    if (width === 390) {
      await expect(page.locator('[data-dock]')).toBeVisible()
      const button = await page.getByTestId('pages-button').boundingBox()
      const card = await page.locator('#edit-panel').boundingBox()
      expect(card?.y ?? 0).toBeGreaterThan((button?.y ?? 0) + (button?.height ?? 0))
    }
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
  for (const field of ['[name="colour-hex"]', '[data-testid="colour-opacity"]'])
    expect(
      await page
        .locator(`[data-testid="bar-colour-menu"] ${field}`)
        .first()
        .evaluate((el) => getComputedStyle(el).direction),
    ).toBe('ltr')
  writeOutput('nothing-selected-rtl.png', await page.screenshot({ animations: 'disabled' }))
  expect(errors).toEqual([])
  await context.close()
})
