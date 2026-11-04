// The infinite canvas (#36): every page in every format, per-format drags, shared text, pan and
// zoom. Needs the API and the sync server: `docker compose up -d --wait`.
import { formatScope } from '@dazbee/schema'

import { fiveFormats, FORMATS, open } from '../../support/canvas.ts'
import { designOf, placed, screenPoint, settle, stageShot, writeOutput } from '../../support/editor.ts'
import { drawn } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

const FORMAT_IDS = Object.keys(FORMATS)

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

test.describe('per-format drags', () => {
  /** The box, in screenshot pixels, around every pixel that differs between two PNGs; decoded in the page. */
  const differenceBox = (page: Page, a: Buffer, b: Buffer) =>
    page.evaluate(
      async ([a, b]) => {
        const pixels = async (base64: string) => {
          const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
          const canvas = new OffscreenCanvas(image.width, image.height)
          const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
          ctx.drawImage(image, 0, 0)
          return ctx.getImageData(0, 0, image.width, image.height)
        }
        const [x, y] = [await pixels(a), await pixels(b)]
        let box = { left: Infinity, top: Infinity, right: -1, bottom: -1, count: 0 }
        for (let i = 0; i < x.data.length; i += 4) {
          if (
            x.data[i] === y.data[i] &&
            x.data[i + 1] === y.data[i + 1] &&
            x.data[i + 2] === y.data[i + 2] &&
            x.data[i + 3] === y.data[i + 3]
          )
            continue
          const px = (i / 4) % x.width
          const py = Math.floor(i / 4 / x.width)
          box = {
            left: Math.min(box.left, px),
            top: Math.min(box.top, py),
            right: Math.max(box.right, px),
            bottom: Math.max(box.bottom, py),
            count: box.count + 1,
          }
        }
        return box
      },
      [a.toString('base64'), b.toString('base64')] as const,
    )

  test('a drag in the second format moves the layer there only; undo and override.reset put it back', async ({
    page,
  }) => {
    const { errors } = await open(page, fiveFormats(10))
    await page.keyboard.press('Escape')
    const before = await stageShot(page)
    writeOutput('canvas-0-fit-all.png', await page.screenshot())

    // Drag the box in Story from its centre by 100 × 50 design pixels, with the real mouse and
    // Control held, so it lands where the pointer puts it rather than snapping.
    const story = { pageId: 'p1', formatId: 'story' }
    await drag(page, await screenPoint(page, 200, 180, story), await screenPoint(page, 300, 230, story), ['Control'])
    await expect(page.locator('.selection[data-layer="p1-box"][data-frame="p1/story"]')).toBeVisible()
    await settle([page])
    const zoom = await page.evaluate(() => window.dazbee?.camera().zoom ?? 1)
    let design = JSON.parse(await designOf(page))
    const moved = placed(design, 'p1-box', 'story') as { x: number; y: number }
    // One screen pixel is 1/zoom design pixels; the mouse lands on whole screen pixels.
    expect(Math.abs(moved.x - 200)).toBeLessThanOrEqual(Math.ceil(1 / zoom))
    expect(Math.abs(moved.y - 150)).toBeLessThanOrEqual(Math.ceil(1 / zoom))
    expect(design.nodes['p1-box'].props).toMatchObject({ x: 100, y: 100 })
    for (const formatId of FORMAT_IDS.filter((f) => f !== 'story'))
      expect(design.overrides[formatScope(formatId)]?.['p1-box']).toBeUndefined()
    writeOutput('canvas-1-dragged-in-story.png', await page.screenshot())

    // Undo takes the whole drag back in one step.
    await page.keyboard.press('Control+z')
    await settle([page])
    design = JSON.parse(await designOf(page))
    expect(design.overrides['format:story']?.['p1-box']).toBeUndefined()

    // Drag again, then reset the override: the layer is back on the base, pixel for pixel.
    await drag(page, await screenPoint(page, 200, 180, story), await screenPoint(page, 300, 230, story))
    await settle([page])
    expect(JSON.parse(await designOf(page)).overrides['format:story']?.['p1-box']).toMatchObject({
      x: expect.any(Number),
    })
    await page.evaluate(() => window.dazbee?.session.run('override.reset', { ids: ['p1-box'], scope: 'format:story' }))
    await settle([page])
    expect(JSON.parse(await designOf(page)).overrides['format:story']?.['p1-box']).toBeUndefined()
    await page.keyboard.press('Escape')
    // Off the stage, so no hover outline is drawn over the layer.
    await page.mouse.move(0, 0)
    await expect
      .poll(async () => (await stageShot(page)).equals(before), { timeout: 10_000 })
      .toBe(true)
      .catch(async (error: unknown) => {
        // Both pictures go beside the run's other output, and the box where they differ to the log.
        const after = await stageShot(page)
        writeOutput('canvas-reset-before.png', before)
        writeOutput('canvas-reset-after.png', after)
        console.log('the stage differs within', await differenceBox(page, before, after))
        throw error
      })
    expect(errors).toEqual([])
  })
})

test.describe('shared text', () => {
  const hashOf = (page: Page, formatId: string) =>
    page.evaluate(async (formatId) => {
      const pixels = window.dazbee?.exportPixels(undefined, formatId)
      if (!pixels) throw new Error('no editor')
      const digest = await crypto.subtle.digest('SHA-256', pixels.slice())
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    }, formatId)

  test('typing into the headline in one format changes it in every format', async ({ page }) => {
    const { errors } = await open(page, fiveFormats(10))
    const hashes = await Promise.all(FORMAT_IDS.map((f) => hashOf(page, f)))
    await page.evaluate(() => window.dazbee?.fitFrame('p1', 'land'))
    await drawn(page)

    // Past the end of the headline in Landscape, where it sits at 360, 260 and is 800 wide.
    const land = { pageId: 'p1', formatId: 'land' }
    const end = await screenPoint(page, 1150, 300, land)
    await page.mouse.dblclick(end.x, end.y)
    await expect(page.locator('.caret')).toBeVisible()
    await page.keyboard.type(' now')
    await page.keyboard.press('Escape')
    await settle([page])
    const design = JSON.parse(await designOf(page))
    expect(design.nodes['p1-headline'].props.text).toBe('Summer sale now')
    for (const [i, formatId] of FORMAT_IDS.entries()) {
      expect(placed(design, 'p1-headline', formatId).text).toBe('Summer sale now')
      expect(await hashOf(page, formatId)).not.toBe(hashes[i])
    }
    await page.keyboard.press('Shift+1')
    await drawn(page)
    writeOutput('canvas-2-typed-in-landscape.png', await page.screenshot())
    expect(errors).toEqual([])
  })
})

test.describe('pan and zoom', () => {
  test('zooming keeps the point under the cursor still, panning follows the wheel and space, fit all shows every frame, and the zoom menu zooms to the selection and to 100%', async ({
    page,
  }) => {
    const { errors } = await open(page, fiveFormats(10))
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

    // Shift+1 fits every frame inside the stage.
    await page.keyboard.press('Shift+1')
    await drawn(page)
    for (const formatId of FORMAT_IDS) {
      const frame = await page.evaluate((f) => window.dazbee?.frames().find((x) => x.formatId === f), formatId)
      if (!frame) throw new Error(`no frame for ${formatId}`)
      const topLeft = await screenPoint(page, 0, 0, { pageId: 'p1', formatId })
      const bottomRight = await screenPoint(page, frame.width, frame.height, { pageId: 'p1', formatId })
      expect(topLeft.x).toBeGreaterThanOrEqual(stage.x)
      expect(topLeft.y).toBeGreaterThanOrEqual(stage.y)
      expect(bottomRight.x).toBeLessThanOrEqual(stage.x + stage.width)
      expect(bottomRight.y).toBeLessThanOrEqual(stage.y + stage.height)
      await expect(page.locator(`.frame-label[data-frame="p1/${formatId}"]`)).toBeVisible()
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
