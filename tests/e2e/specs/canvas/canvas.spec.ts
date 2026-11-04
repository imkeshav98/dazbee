// The infinite canvas (#36): a page of five frames, each where it is stored, with pan and zoom.
// Needs the API and the sync server: `docker compose up -d --wait`.
import { fiveFrames, FRAMES, open } from '../../support/canvas.ts'
import { designOf, screenPoint } from '../../support/editor.ts'
import { drawn } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

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
    expect(frames.map((frame) => frame.key)).toEqual(FRAME_IDS)
    const stored = await page.evaluate(() => window.dazbee?.design().frames ?? {})
    for (const frame of frames) {
      expect({ x: frame.x, y: frame.y, width: frame.width, height: frame.height }).toEqual({
        x: stored[frame.key]?.x,
        y: stored[frame.key]?.y,
        width: stored[frame.key]?.width,
        height: stored[frame.key]?.height,
      })
      const topLeft = await screenPoint(page, 0, 0, frame.key)
      const bottomRight = await screenPoint(page, frame.width, frame.height, frame.key)
      expect(topLeft.x).toBeGreaterThanOrEqual(stage.x)
      expect(topLeft.y).toBeGreaterThanOrEqual(stage.y)
      expect(bottomRight.x).toBeLessThanOrEqual(stage.x + stage.width)
      expect(bottomRight.y).toBeLessThanOrEqual(stage.y + stage.height)
      await expect(page.locator(`.frame-label[data-frame="${frame.key}"]`)).toBeVisible()
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
