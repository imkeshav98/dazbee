// The layers panel (#59) in Chromium, with the real mouse: the tree in step with the stage's
// selection both ways, a layer dragged into a group (the stage redraws it there, one undo step,
// which redo brings back), rename, lock and hide, all there after a reload; the page the panel
// lists, with a frame that has no layers or no frames at all; and the rows' pictures reading in
// both themes.
import type { DesignInput } from '@dazbee/schema'

import { reloads, setCookies, writeOutput } from '../../support/editor.ts'
import {
  colourAt,
  layersDesign,
  listed,
  node,
  openLayers,
  rect,
  ROW,
  row,
  SQUARE,
  tree,
} from '../../support/layers-panel.ts'
import { click, openStage, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { pagesPanel } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

test('the panel and the stage select together; drag into a group, rename, lock and hide', async ({ browser }) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  expect(await listed(page)).toEqual([SQUARE, '  Dot', '  Box', '  Card', '  Backdrop'])
  await expect(row(page, 'Card')).toHaveAttribute('aria-expanded', 'false')

  // Select in the panel: the stage selects. Select on the stage: the panel follows.
  await row(page, 'Dot').click()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['dot'])
  await expect(row(page, 'Dot')).toHaveAttribute('aria-selected', 'true')
  await click(page, 480, 380)
  await expect(row(page, 'Box')).toHaveAttribute('aria-selected', 'true')
  await expect(row(page, 'Dot')).toHaveAttribute('aria-selected', 'false')
  // A layer inside a group selected on the stage opens its group in the panel.
  await page.evaluate(() => window.dazbee?.select(['c2']))
  await expect(row(page, 'Card')).toHaveAttribute('aria-expanded', 'true')
  await expect(row(page, 'Card stripe')).toHaveAttribute('aria-selected', 'true')
  await expect
    .poll(() => listed(page))
    .toEqual([SQUARE, '  Dot', '  Box', '  Card', '    Card stripe', '    Card back', '  Backdrop'])
  writeOutput('layers-0-tree.png', await page.screenshot())

  // Drag Dot onto the middle of Card: it goes inside, on top, and the group grows to hold it.
  const before = await page.evaluate(() => window.dazbee?.boxOf('card'))
  const target = await row(page, 'Card').boundingBox()
  await row(page, 'Dot').dragTo(row(page, 'Card'), { targetPosition: { x: 60, y: (target?.height ?? ROW) / 2 } })
  await expect.poll(async () => (await node(page, 'dot')).parentId).toBe('card')
  await expect
    .poll(() => listed(page))
    .toEqual([SQUARE, '  Box', '  Card', '    Dot', '    Card stripe', '    Card back', '  Backdrop'])
  const after = await page.evaluate(() => window.dazbee?.boxOf('card'))
  expect(after).toEqual({ x: 120, y: 620, width: 780, height: 300 })
  expect(before).toEqual({ x: 120, y: 620, width: 520, height: 300 })
  // The stage redraws the group with the dot in it: selecting the group, its box takes in the dot.
  await row(page, 'Card').click()
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('layers-1-dragged-into-group.png', await page.screenshot())
  // Dot drawn where it was: moving it in changed only where it sits in the tree.
  expect(await colourAt(page, 800, 780)).toEqual([31, 157, 85])
  // One undo puts it back; redo puts it in again, and the panel follows both.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await node(page, 'dot')).parentId).toBe('sq')
  expect(await page.evaluate(() => window.dazbee?.boxOf('card'))).toEqual(before)
  await page.evaluate(() => window.dazbee?.perform('redo'))
  await expect.soft.poll(async () => (await node(page, 'dot')).parentId).toBe('card')
  await expect.soft
    .poll(() => listed(page))
    .toEqual([SQUARE, '  Box', '  Card', '    Dot', '    Card stripe', '    Card back', '  Backdrop'])
  expect.soft(await page.evaluate(() => window.dazbee?.boxOf('card'))).toEqual(after)
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await node(page, 'dot')).parentId).toBe('sq')

  // Drag Backdrop above Box: reordered among its siblings.
  const box = await row(page, 'Box').boundingBox()
  await row(page, 'Backdrop').dragTo(row(page, 'Box'), { targetPosition: { x: 60, y: 3 } })
  await expect
    .poll(() => listed(page))
    .toEqual([SQUARE, '  Dot', '  Backdrop', '  Box', '  Card', '    Card stripe', '    Card back'])
  expect(box).not.toBeNull()
  // The backdrop now covers the box: the stage draws it on top.
  expect(await colourAt(page, 300, 200)).toEqual([244, 237, 228])
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect
    .poll(() => listed(page))
    .toEqual([SQUARE, '  Dot', '  Box', '  Card', '    Card stripe', '    Card back', '  Backdrop'])
  // Redo puts the backdrop above the box again.
  await page.evaluate(() => window.dazbee?.perform('redo'))
  await expect.soft
    .poll(() => listed(page))
    .toEqual([SQUARE, '  Dot', '  Backdrop', '  Box', '  Card', '    Card stripe', '    Card back'])
  expect.soft(await colourAt(page, 300, 200)).toEqual([244, 237, 228])
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect
    .poll(() => listed(page))
    .toEqual([SQUARE, '  Dot', '  Box', '  Card', '    Card stripe', '    Card back', '  Backdrop'])

  // Rename with a double-click.
  await row(page, 'Box').dblclick()
  const field = tree(page).getByRole('textbox', { name: 'Name of Box' })
  await expect(field).toBeFocused()
  await field.fill('Hero panel')
  writeOutput('layers-2-rename.png', await page.screenshot())
  await field.press('Enter')
  await expect.poll(async () => (await node(page, 'box')).name).toBe('Hero panel')
  await expect(row(page, 'Hero panel')).toBeFocused()

  // Lock: every flag, shown on the row; dragging the box on the stage leaves it where it was.
  await row(page, 'Hero panel').hover()
  await row(page, 'Hero panel').getByRole('button', { name: 'Lock Hero panel' }).click()
  await expect
    .poll(async () => (await node(page, 'box')).lock)
    .toEqual({ move: true, resize: true, content: true, style: true, delete: true })
  await expect(row(page, 'Hero panel').getByRole('button', { name: 'Unlock Hero panel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Hide: the stage no longer draws it; Show brings it back.
  expect(await colourAt(page, 300, 200)).toEqual([224, 38, 43])
  await row(page, 'Hero panel').getByRole('button', { name: 'Hide Hero panel' }).click()
  await expect.poll(() => colourAt(page, 300, 200)).toEqual([244, 237, 228])
  await page.mouse.move(900, 900)
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('layers-3-locked-hidden.png', await page.screenshot())
  await row(page, 'Hero panel').getByRole('button', { name: 'Show Hero panel' }).click()
  await expect.poll(() => colourAt(page, 300, 200)).toEqual([224, 38, 43])

  // After a reload the design is as it was left, and the panel shows the box renamed and locked.
  await reloads(page)
  await openLayers(page)
  await row(page, 'Hero panel').hover()
  await expect(row(page, 'Hero panel').getByRole('button', { name: 'Unlock Hero panel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(errors).toEqual([])
})

test('the panel lists the page in view: its one frame open, an empty frame with how to add layers, or how to add a frame', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  const note = page.getByTestId('flyout-note')
  await selectLayers(page, ['box'])
  await selectLayers(page, [])
  await expect(note).toHaveText('Page 1')
  await expect.poll(() => listed(page)).toEqual([SQUARE, '  Dot', '  Box', '  Card', '  Backdrop'])
  // Add page brings the new page into view: the panel lists its one frame, which has no layers.
  const pages = await pagesPanel(page)
  await pages.getByTestId('add-page').click()
  await expect(note).toHaveText('Page 2')
  await expect.poll(() => listed(page)).toEqual(['Feed square 1080×1080'])
  await expect(page.getByTestId('layers')).toContainText(
    'No layers on this page yet. Draw a shape or add text to start.',
  )
  // With that frame deleted the page has none, and the panel says how to add one.
  await page.evaluate(() => {
    const editor = window.dazbee
    for (const frame of editor?.frames() ?? []) editor?.session.run('frame.delete', { frameId: frame.id })
  })
  await expect(page.getByTestId('layers')).toHaveText('Pick the Frame tool to add a frame')
  await expect(note).toHaveText('Page 2')
  await pages.getByRole('button', { name: 'Show Page 1' }).click()
  await expect(note).toHaveText('Page 1')
  await expect(row(page, 'Box')).toBeVisible()
  expect(errors).toEqual([])
})

test.describe('row pictures in dark and light theme', () => {
  const text = (link: string, index: string, name: string, y: number, color: string) => ({
    type: 'text' as const,
    parentId: 'sq',
    link,
    index,
    name,
    props: {
      x: 80,
      y,
      width: 600,
      height: 90,
      text: name,
      style: { fontFamily: 'Noto Sans', fontSize: 64, color },
    },
  })
  const design = (): DesignInput => ({
    ...layersDesign(),
    nodes: {
      ...layersDesign().nodes,
      ink: text('ink', 'b0', 'Ink', 60, '#111111FF'),
      chalk: text('chalk', 'b1', 'Chalk', 160, '#FFFFFFFF'),
    },
  })
  /** How a row's picture tile looks: what it holds, its fill and its ink. */
  const tile = (page: Page, name: string) =>
    row(page, name)
      .getByTestId('layer-picture')
      .evaluate((el) => ({
        holds: el.querySelector('img') ? 'picture' : el.querySelector('svg') ? 'icon' : 'nothing',
        fill: getComputedStyle(el).backgroundColor,
        ink: getComputedStyle(el).color,
      }))

  for (const theme of ['dark', 'light'] as const) {
    test(`in ${theme} theme every text row shows the same text icon, whatever its text's colour`, async ({
      browser,
    }) => {
      const { page, errors } = await openStage(browser, design())
      await setCookies(page, { theme })
      await page.reload()
      await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
      await openLayers(page)
      // The other rows' pictures are drawn first, so a text row's tile is what it will stay.
      await expect(row(page, 'Box').getByTestId('layer-picture').locator('img')).toHaveCount(1)
      const ink = await tile(page, 'Ink')
      expect(ink.holds).toBe('icon')
      expect(await tile(page, 'Chalk')).toEqual(ink)
      writeOutput(`layers-text-rows-${theme}.png`, await page.screenshot({ animations: 'disabled' }))
      expect(errors).toEqual([])
    })
  }

  /** A shape as dark as the dark theme's panel, and one as white as the light theme's. */
  const shapes = (): DesignInput => ({
    ...layersDesign(),
    nodes: {
      ...layersDesign().nodes,
      night: {
        type: 'graphic',
        parentId: 'sq',
        link: 'night',
        index: 'b0',
        name: 'Night box',
        props: rect(80, 60, 300, 300, '#1A1420FF'),
      },
      snow: {
        type: 'graphic',
        parentId: 'sq',
        link: 'snow',
        index: 'b1',
        name: 'Snow dot',
        props: { ...rect(600, 60, 300, 200, '#FFFFFFFF'), shape: { kind: 'ellipse' as const } },
      },
    },
  })
  /**
   * The contrast of a row's picture, its colour the mean of its drawn pixels, with what its tile
   * shows round it, and whether the tile shows round it at all.
   */
  const swatch = async (page: Page, name: string) => {
    const tile = row(page, name).getByTestId('layer-picture')
    await expect(tile.locator('img')).toHaveCount(1)
    return tile.evaluate(async (el) => {
      const img = el.querySelector('img') as HTMLImageElement
      await img.decode()
      const paint = document.createElement('canvas')
      paint.width = img.naturalWidth
      paint.height = img.naturalHeight
      const g = paint.getContext('2d', { willReadFrequently: true })
      if (!g) return null
      g.drawImage(img, 0, 0)
      const data = g.getImageData(0, 0, paint.width, paint.height).data
      const sum = [0, 0, 0, 0]
      for (let i = 0; i < data.length; i += 4) {
        const a = (data[i + 3] ?? 0) / 255
        for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (data[i + c] ?? 0) * a
        sum[3] = (sum[3] ?? 0) + a
      }
      const picture = sum.slice(0, 3).map((c) => c / (sum[3] || 1))
      paint.width = paint.height = 1
      g.fillStyle = getComputedStyle(el).backgroundColor
      g.fillRect(0, 0, 1, 1)
      const back = [...g.getImageData(0, 0, 1, 1).data].slice(0, 3)
      const lum = (rgb: number[]) => {
        const [r = 0, gr = 0, b = 0] = rgb.map((c) => {
          const s = c / 255
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r + 0.7152 * gr + 0.0722 * b
      }
      const [hi, lo] = [lum(picture), lum(back)].sort((x, y) => y - x)
      const drawn = img.getBoundingClientRect()
      const inner = el.getBoundingClientRect()
      return {
        contrast: ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05),
        // The tile shows round the picture: the picture is smaller than the tile inside its border.
        round: drawn.width <= inner.width - 4 && drawn.height <= inner.height - 4,
      }
    })
  }

  for (const [theme, name] of [
    ['dark', 'Night box'],
    ['light', 'Snow dot'],
  ] as const) {
    test(`in ${theme} theme a shape the colour of the panel shows on a tile that sets it off`, async ({ browser }) => {
      const { page, errors } = await openStage(browser, shapes())
      await setCookies(page, { theme })
      await page.reload()
      await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
      await openLayers(page)
      await expect.poll(async () => (await swatch(page, name))?.round).toBe(true)
      expect((await swatch(page, name))?.contrast).toBeGreaterThanOrEqual(3)
      writeOutput(`layers-shape-rows-${theme}.png`, await page.screenshot({ animations: 'disabled' }))
      expect(errors).toEqual([])
    })
  }
})
