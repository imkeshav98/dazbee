// The infinite canvas (#36): a page of five frames, each where it is stored, with pan and zoom; a
// layer dragged past its frame's edge shows there as a faint ghost and stays in its frame; and
// pictures, in the dark and the light theme at each screen size, of one frame, linked frames, two
// pages, a page with no frames, the Pages card, a brief's frames, the layers panel and Export.
// Needs the API and the sync server: `docker compose up -d --wait`.
import { blankDesign, type DesignInput } from '@dazbee/schema'

import { CREAM, fiveFrames, FRAMES, open } from '../../support/canvas.ts'
import { designOf, editorPath, screenPoint, setCookies, writeOutput } from '../../support/editor.ts'
import { THEMES } from '../../support/glass.ts'
import { openLayers } from '../../support/layers-panel.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { liveDesign, seed } from '../../support/seed.ts'
import { drawn, fitSettled, nextFrame, openStage, selectLayers } from '../../support/stage.ts'
import { type Browser, expect, type Page, test } from '../../support/test.ts'
import { pagesPanel } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

const FRAME_IDS = Object.keys(FRAMES)

/** Drags with the real mouse; `keys` are held from the press to the release (Control turns snapping off). */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, keys: string[] = []) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (const key of keys) await page.keyboard.down(key)
  for (let i = 1; i <= 15; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 15, from.y + ((to.y - from.y) * i) / 15)
  await page.mouse.up()
  for (const key of keys) await page.keyboard.up(key)
}

test.describe('pan and zoom', () => {
  test('zooming keeps the point under the cursor still, panning follows the wheel and space, fit all shows every frame, and the zoom menu zooms to the selection and to 100%', async ({
    page,
  }) => {
    const { errors } = await open(page, fiveFrames(10))
    const camera = () =>
      page.evaluate(() => {
        const editor = window.dazbee
        if (!editor) throw new Error('no editor')
        return editor.camera()
      })
    const stage = await page.getByTestId('stage').boundingBox()
    if (!stage) throw new Error('no stage')
    const cursor = { x: stage.x + 420, y: stage.y + 260 }
    const worldUnder = (c: { x: number; y: number; zoom: number }) => ({
      x: (cursor.x - stage.x - c.x) / c.zoom,
      y: (cursor.y - stage.y - c.y) / c.zoom,
    })

    // Ctrl-wheel, as a mouse and as a trackpad pinch send it, zooms about the cursor.
    await page.mouse.move(cursor.x, cursor.y)
    const start = await camera()
    const zoomText = await page.getByTestId('zoom').textContent()
    await page.keyboard.down('Control')
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    await drawn(page)
    const zoomed = await camera()
    expect(zoomed.zoom).toBeGreaterThan(start.zoom * 2)
    expect(worldUnder(zoomed).x).toBeCloseTo(worldUnder(start).x, 3)
    expect(worldUnder(zoomed).y).toBeCloseTo(worldUnder(start).y, 3)
    await expect(page.getByTestId('zoom')).not.toHaveText(zoomText ?? '')

    // A plain wheel pans by its deltas.
    await page.mouse.wheel(120, 80)
    await drawn(page)
    const scrolled = await camera()
    expect({ x: scrolled.x, y: scrolled.y, zoom: scrolled.zoom }).toEqual({
      x: zoomed.x - 120,
      y: zoomed.y - 80,
      zoom: zoomed.zoom,
    })

    // Space-drag pans and moves no layer.
    const designBefore = await designOf(page)
    await page.keyboard.down('Space')
    await drag(page, cursor, { x: cursor.x - 200, y: cursor.y - 100 })
    await page.keyboard.up('Space')
    const panned = await camera()
    expect(panned.x).toBeCloseTo(scrolled.x - 200, 0)
    expect(panned.y).toBeCloseTo(scrolled.y - 100, 0)
    expect(await designOf(page)).toBe(designBefore)

    // Shift+1 fits every frame of the page inside the stage, each where it is stored.
    await page.keyboard.press('Shift+1')
    await drawn(page)
    const frames = await page.evaluate(() => window.dazbee?.frames() ?? [])
    expect(frames.map((frame) => frame.id)).toEqual(FRAME_IDS)
    const stored = await page.evaluate(() => window.dazbee?.design().frames ?? {})
    for (const frame of frames) {
      expect({ x: frame.x, y: frame.y, width: frame.width, height: frame.height }).toEqual({
        x: stored[frame.id]?.x,
        y: stored[frame.id]?.y,
        width: stored[frame.id]?.width,
        height: stored[frame.id]?.height,
      })
      const topLeft = await screenPoint(page, 0, 0, frame.id)
      const bottomRight = await screenPoint(page, frame.width, frame.height, frame.id)
      expect(topLeft.x).toBeGreaterThanOrEqual(stage.x)
      expect(topLeft.y).toBeGreaterThanOrEqual(stage.y)
      expect(bottomRight.x).toBeLessThanOrEqual(stage.x + stage.width)
      expect(bottomRight.y).toBeLessThanOrEqual(stage.y + stage.height)
      await expect(page.locator(`.frame-label[data-frame="${frame.id}"]`)).toBeVisible()
    }
    // Shift+0 is 100%; Zoom to fit in the zoom pill's menu fits everything again.
    await page.keyboard.press('Shift+0')
    await expect(page.getByTestId('zoom')).toHaveText('100%')
    await page.getByTestId('zoom').click()
    await page.getByTestId('zoom-menu').getByRole('button', { name: 'Zoom to fit' }).click()
    await drawn(page)
    const fitted = (await camera()).zoom
    expect(fitted).toBeLessThan(1)

    // The zoom menu zooms to the selection, and to 100%.
    await page.evaluate(() => window.dazbee?.select(['p1-headline']))
    await page.getByTestId('zoom').click()
    await page
      .getByTestId('zoom-menu')
      .getByRole('button', { name: /Zoom to selection/ })
      .click()
    await expect.poll(async () => (await camera()).zoom).not.toBe(fitted)
    await page.getByTestId('zoom').click()
    await page.getByTestId('zoom-menu').getByRole('button', { name: /100%/ }).click()
    await expect.poll(async () => (await camera()).zoom).toBe(1)
    expect(errors).toEqual([])
  })
})

test.describe('dragging out of a frame', () => {
  /** A square frame holding a red shape near its end, and a second frame 200 px past it. */
  const sideBySide = (): DesignInput => {
    const base = liveDesign()
    return {
      ...base,
      meta: { ...base.meta, name: 'Side by side' },
      frames: {
        ...base.frames,
        other: { pageId: 'p1', name: 'Other', width: 1080, height: 1080, x: 1280, y: 0, fills: CREAM, order: 'a1' },
      },
      nodes: {
        shape: {
          type: 'graphic',
          parentId: 'sq',
          link: 'shape',
          index: 'a9',
          name: 'Shape',
          props: {
            x: 700,
            y: 400,
            width: 300,
            height: 200,
            shape: { kind: 'rect' },
            fills: [{ type: 'solid', color: '#E0262BFF' }],
          },
        },
      },
    }
  }
  /** The colour on screen at a design pixel of the square frame. */
  async function colourAt(page: Page, x: number, y: number) {
    const at = await screenPoint(page, x, y)
    const png = (
      await page.screenshot({
        clip: { x: Math.round(at.x), y: Math.round(at.y), width: 1, height: 1 },
        animations: 'disabled',
      })
    ).toString('base64')
    return page.evaluate(async (png) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
      const canvas = new OffscreenCanvas(1, 1)
      const context = canvas.getContext('2d')
      context?.drawImage(bitmap, 0, 0)
      return [...(context?.getImageData(0, 0, 1, 1).data ?? [])].slice(0, 3)
    }, png)
  }

  test('a layer dragged past its frame shows there as a faint ghost, its frame label lit, and stays in its frame', async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, sideBySide())
    await page.evaluate(() => window.dazbee?.setSnapping(false))
    // The gap between the frames, beside where the shape goes, and where it goes.
    const gap = await colourAt(page, 1190, 900)
    const from = await screenPoint(page, 850, 500)
    const to = await screenPoint(page, 1250, 500)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y)
    await drawn(page)

    // Mid-drag: the part outside the square is drawn faintly over the gap and the other frame.
    const ghost = await colourAt(page, 1190, 500)
    expect(ghost, 'a ghost over the gap').not.toEqual(gap)
    expect(ghost[0] ?? 0, 'red, but faint').toBeGreaterThan(ghost[1] ?? 0)
    await expect(page.locator('.frame-label[data-frame="sq"]')).toHaveAttribute('data-active', '')
    await expect(page.locator('.frame-label[data-frame="other"]')).not.toHaveAttribute('data-active')
    writeOutput('drag-ghost.png', await page.screenshot({ animations: 'disabled' }))

    // Dropped: the shape stays in the square, clipped there, selected.
    await page.mouse.up()
    await drawn(page)
    const stored = JSON.parse(await designOf(page)) as {
      nodes: Record<string, { parentId: string; props: { x: number } }>
    }
    expect(stored.nodes.shape).toMatchObject({ parentId: 'sq', props: { x: 1100 } })
    expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['shape'])
    await expect(page.locator('.selection')).toBeVisible()
    expect(await colourAt(page, 1190, 500), 'no ghost once dropped').toEqual(gap)
    expect(errors).toEqual([])
  })
})

test.describe('pages of frames', () => {
  /**
   * Page 1 holds the five linked frames, page 2 one frame of its own and page 3 none, so the
   * pictures show linked frames, two pages listed and shown, and a page with no frames.
   */
  const pages = (): DesignInput => {
    const linked = fiveFrames(10)
    return {
      ...linked,
      pages: { ...linked.pages, p2: { name: 'Page 2', order: 'a1' }, p3: { name: 'Page 3', order: 'a2' } },
      frames: {
        ...linked.frames,
        'p2-sq': {
          pageId: 'p2',
          name: 'Feed square',
          width: 1080,
          height: 1080,
          x: 0,
          y: 0,
          fills: CREAM,
          order: 'a0',
        },
      },
      nodes: {
        ...linked.nodes,
        'p2-headline': {
          type: 'text',
          parentId: 'p2-sq',
          link: 'p2-headline',
          index: 'a0',
          name: 'Headline',
          props: {
            x: 80,
            y: 480,
            width: 920,
            height: 120,
            text: 'Page two',
            style: { fontFamily: 'Noto Sans', fontSize: 80, fontWeight: 800, color: '#111111FF' },
          },
        },
      },
    }
  }

  /** What a brief picking three sizes makes: one page of three empty frames in a row, each named after its size. */
  const brief = (): DesignInput =>
    blankDesign({ designId: 'replaced-by-the-api', name: 'Autumn roast' }, [
      { name: 'Feed square', width: 1080, height: 1080 },
      { name: 'Story and Reel', width: 1080, height: 1920 },
      { name: 'Link image', width: 1200, height: 628 },
    ])
  /** Opens a design in a tab of its own, in a theme and at a screen size, fitted once the editor is ready. */
  async function openThemed(
    browser: Browser,
    content: DesignInput,
    theme: (typeof THEMES)[number],
    viewport: { width: number; height: number },
  ) {
    const designId = await seed(content)
    const page = await (await browser.newContext({ viewport })).newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await setCookies(page, { theme })
    await page.goto(editorPath(designId))
    await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
    await page.evaluate(() => window.dazbee?.loaded())
    await fitSettled(page)
    return { page, errors }
  }

  for (const [width, height] of SCREEN_SIZES) {
    for (const theme of THEMES) {
      test(
        `screenshots at ${width}×${height}, ${theme}: one frame, linked frames, two pages, an empty page, the Pages card, a brief's frames, the layers panel and Export`,
        { tag: '@evidence' },
        async ({ browser }) => {
          test.setTimeout(300_000)
          const viewport = { width, height }
          const shot = async (page: Page, name: string) => {
            await nextFrame(page)
            writeOutput(`frames-${width}-${theme}-${name}.png`, await page.screenshot({ animations: 'disabled' }))
          }
          const one = await openThemed(browser, liveDesign(), theme, viewport)
          await shot(one.page, '1-one-frame')
          expect(one.errors).toEqual([])
          await one.page.context().close()

          const { page, errors } = await openThemed(browser, pages(), theme, viewport)
          const shown = () => page.evaluate(() => window.dazbee?.frames().map((frame) => frame.id))
          expect(await shown()).toEqual(['sq', 'story', 'land', 'mpu', 'leader'])
          await shot(page, '2-linked-frames')
          // A layer selected in one frame; its copies stay as they are.
          await selectLayers(page, ['p1-headline'], { bar: true })
          await shot(page, '3-linked-frames-selected')
          await selectLayers(page, [])
          const panel = await pagesPanel(page)
          await expect(panel.getByTestId('pages').locator('li')).toHaveCount(3)
          // Each page with a frame shows a picture of its first frame once the stage settles, the empty page
          // none; every page shows its number.
          await expect(panel.getByTestId('page-thumbnail').locator('img')).toHaveCount(2)
          await expect(panel.getByTestId('page-thumbnail').nth(2).locator('img')).toHaveCount(0)
          await expect(panel.getByTestId('page-number')).toHaveText(['1', '2', '3'])
          await shot(page, '4-pages')
          await page.keyboard.press('Escape')
          await expect(panel).toBeHidden()
          // The layers panel lists the frame's layers.
          await openLayers(page)
          await shot(page, '5-layers-panel')
          await page.getByRole('button', { name: 'Layers', exact: true }).click()
          await expect(page.getByTestId('layers')).toBeHidden()
          // Export lists what it exports.
          await page.getByTestId('share-open').click()
          await page.getByTestId('export-open').click()
          await expect(page.getByTestId('export')).toBeVisible()
          await shot(page, '6-export')
          await page.keyboard.press('Escape')
          await expect(page.getByTestId('export')).toBeHidden()
          await page.evaluate(() => window.dazbee?.showPage('p2'))
          await fitSettled(page)
          expect(await shown()).toEqual(['p2-sq'])
          await shot(page, '7-second-page')
          await page.evaluate(() => window.dazbee?.showPage('p3'))
          await fitSettled(page)
          await expect(page.getByTestId('empty-page')).toBeVisible()
          await shot(page, '8-empty-page')
          expect(errors).toEqual([])
          await page.context().close()

          const drafts = await openThemed(browser, brief(), theme, viewport)
          await expect(drafts.page.locator('.frame-label[data-frame]')).toHaveCount(3)
          await shot(drafts.page, '9-brief-frames')
          expect(drafts.errors).toEqual([])
        },
      )
    }
  }
})
