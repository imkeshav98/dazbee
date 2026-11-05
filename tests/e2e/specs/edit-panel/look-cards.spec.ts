// The visual-first property cards (as in the final mock) in Chromium: text's size and its colour
// from the brand kit, the effects as tiles with their numbers under them, and the header card that
// names the layer and holds its box. And the swatch rows of the Colour panel and the frame
// Background panel built on it: on a phone each swatch is a target a finger can hit, in a sheet that
// scrolls rather than cutting one off, while a desktop keeps their size; with pictures of both
// panels at the three screen sizes in both themes.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../../support/editor.ts'
import { openSized } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { frameDesign, newBrand, putKit } from '../../support/seed.ts'
import { nextFrame, openStage } from '../../support/stage.ts'
import {
  closest,
  PAINT_EDITOR_ROW,
  SWATCH_KIT,
  SWATCH_PANELS,
  SWATCH_ROWS,
  swatchBoxes,
  TOUCH_TARGET,
} from '../../support/swatches.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, openCard, PIECES, UNCUT } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput =>
  frameDesign({
    name: 'Look cards',
    fills: [{ type: 'solid', color: '#FF8A3DFF' }],
    nodes: {
      headline: {
        type: 'text',
        parentId: 'sq',
        index: 'a0',
        name: 'Headline',
        props: {
          x: 76,
          y: 162,
          width: 610,
          height: 204,
          text: 'Cold brew is back',
          style: { fontFamily: 'Noto Sans', fontSize: 96, fontWeight: 800, color: '#FFFFFFFF' },
        },
      },
      badge: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a1',
        name: 'Badge',
        props: {
          x: 80,
          y: 700,
          width: 280,
          height: 280,
          shape: { kind: 'ellipse' },
          fills: [{ type: 'solid', color: '#FFE14DFF' }],
        },
      },
    },
  })

type Node = { bindings?: Record<string, string>; props: Record<string, unknown> & { style?: Record<string, unknown> } }
const node = (page: Page, id: string) => page.evaluate((id) => window.dazbee?.design().nodes[id], id) as Promise<Node>

test('the look comes first: size and brand colour, effect tiles, and the header card', async ({ browser }) => {
  const brandId = await newBrand('e2e look-cards')
  await putKit(brandId, {
    colors: [
      { token: 'berry', name: 'Berry', value: '#FF3D6EFF' },
      { token: 'roast', name: 'Roast', value: '#2A140AFF' },
    ],
  })
  const { page, errors } = await openStage(browser, design(), { brandId })
  await page.evaluate(() => window.dazbee?.select(['headline']))

  // Text, in the bar: the size, and the brand's colours with the colour it has now leading them.
  const size = page.getByTestId('bar-size-field')
  await size.fill('64')
  await size.press('Enter')
  await expect.poll(async () => (await node(page, 'headline')).props.style?.fontSize).toBe(64)
  const colours = (await barMenu(page, 'colour')).getByRole('group', { name: 'Brand colours' })
  await expect(colours.getByRole('button')).toHaveCount(3)
  await expect(colours.getByRole('button', { name: 'Now #FFFFFF' })).toHaveAttribute('aria-pressed', 'true')
  await colours.getByRole('button', { name: 'Berry' }).click()
  await expect.poll(async () => (await node(page, 'headline')).bindings).toMatchObject({ textColor: 'brand:berry' })
  await expect(colours.getByRole('button', { name: 'Berry' })).toHaveAttribute('aria-pressed', 'true')

  // Effects as tiles, in the bar for text: None to start, Shadow and Outline on together, None takes both off.
  const effects = await barMenu(page, 'effects')
  await expect(effects.locator('[data-tile="none"]')).toHaveAttribute('aria-pressed', 'true')
  await effects.locator('[data-tile="dropShadow"]').click()
  await effects.locator('[data-tile="outline"]').click()
  await expect
    .poll(async () => {
      const props = (await node(page, 'headline')).props
      return [
        (props.effects as { type: string }[]).map((e) => e.type),
        (props.style?.outline as { width: number } | undefined)?.width,
      ]
    })
    .toEqual([['dropShadow'], 2])
  await expect(effects.locator('[data-tile="none"]')).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('look-cards-text.png', await page.screenshot())
  // The picked effect's numbers are under the tiles.
  await expect(effects.getByRole('spinbutton', { name: 'Drop shadow 1 Blur' })).toBeVisible()
  await effects.locator('[data-tile="none"]').click()
  await expect
    .poll(async () => {
      const props = (await node(page, 'headline')).props
      return [(props.effects as unknown[]).length, props.style?.outline]
    })
    .toEqual([0, undefined])

  // The Position panel names the layer and holds its box.
  const header = async () => await openCard(page, 'layout-card')
  await header()
  await expect(page.getByTestId('edit-panel-note')).toHaveText('Headline')
  await expect((await header()).getByRole('spinbutton', { name: 'X position' })).toHaveValue('76')

  // A shape: its fill from the same colours, and Blur in place of Outline; the header follows it.
  await page.evaluate(() => window.dazbee?.select(['badge']))
  await expect((await barMenu(page, 'effects')).locator('[data-tile="layerBlur"]')).toBeVisible()
  await (await barMenu(page, 'colour')).getByRole('button', { name: 'Roast' }).click()
  await expect.poll(async () => (await node(page, 'badge')).bindings).toMatchObject({ fill: 'brand:roast' })
  await header()
  await expect(page.getByTestId('edit-panel-note')).toHaveText('Badge')
  writeOutput('look-cards-shape.png', await page.screenshot())
  expect(errors).toEqual([])
})

test.describe('found by review', () => {
  test('on a phone every swatch of the Colour and Background panels is a 44 px target 8 px from the next, in a sheet that cuts none off', async ({
    browser,
  }) => {
    const brandId = await newBrand('e2e phone swatches')
    await putKit(brandId, SWATCH_KIT)
    const { page, errors } = await openSized(browser, { width: 390, height: 844 }, { brandId })
    for (const { name, open } of SWATCH_PANELS) {
      const panel = await open(page)
      const sheet = await panel.boundingBox()
      if (!sheet) throw new Error(`${name} has no box`)
      for (const row of SWATCH_ROWS) {
        const boxes = await swatchBoxes(panel, row)
        for (const box of boxes) {
          expect(Math.min(box.width, box.height), `${name}, ${row.row}: a swatch's target`).toBeGreaterThanOrEqual(
            TOUCH_TARGET.size,
          )
          expect(box.x, `${name}, ${row.row}: a swatch starts in the sheet`).toBeGreaterThanOrEqual(sheet.x)
          expect(box.x + box.width, `${name}, ${row.row}: a swatch ends in the sheet`).toBeLessThanOrEqual(
            sheet.x + sheet.width,
          )
        }
        expect(closest(boxes), `${name}, ${row.row}: the space between swatches`).toBeGreaterThanOrEqual(
          TOUCH_TARGET.gap,
        )
      }
      // The sheet scrolls to what is under its fold, and cuts nothing short across it.
      expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
      await page.keyboard.press('Escape')
      await expect(page.locator('#edit-panel')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })

  test('at 1280×760 the swatches keep their size and the space between them', async ({ browser }) => {
    const brandId = await newBrand('e2e desktop swatches')
    await putKit(brandId, SWATCH_KIT)
    const { page, errors } = await openSized(browser, { width: 1280, height: 760 }, { brandId })
    for (const { name, open } of SWATCH_PANELS) {
      const panel = await open(page)
      for (const row of SWATCH_ROWS) {
        const boxes = await swatchBoxes(panel, row)
        for (const box of boxes) {
          expect(box.width, `${name}, ${row.row}: a swatch's width`).toBeCloseTo(row.size, 1)
          expect(box.height, `${name}, ${row.row}: a swatch's height`).toBeCloseTo(row.size, 1)
        }
        expect(closest(boxes), `${name}, ${row.row}: the space between swatches`).toBeCloseTo(row.gap, 1)
      }
      await page.keyboard.press('Escape')
      await expect(page.locator('#edit-panel')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })
})

for (const [width, height] of SCREEN_SIZES) {
  for (const theme of THEMES) {
    test(
      `screenshots at ${width}×${height}, ${theme}: a shape's Colour panel and a frame's Background panel with + open`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const brandId = await newBrand('e2e swatch shots')
        await putKit(brandId, SWATCH_KIT)
        const { page, errors } = await openSized(browser, { width, height }, { theme, brandId })
        for (const [i, { open }] of SWATCH_PANELS.entries()) {
          const panel = await open(page)
          await nextFrame(page)
          writeOutput(`swatches-${width}-${theme}-${i + 1}.png`, await page.screenshot({ animations: 'disabled' }))
          if (width < 640) {
            // On a phone the paint editor's row is under the sheet's fold until scrolled to.
            await panel.locator(PAINT_EDITOR_ROW.selector).first().scrollIntoViewIfNeeded()
            await nextFrame(page)
            writeOutput(
              `swatches-${width}-${theme}-${i + 1}-scrolled.png`,
              await page.screenshot({ animations: 'disabled' }),
            )
          }
          await page.keyboard.press('Escape')
          await expect(page.locator('#edit-panel')).toHaveCount(0)
        }
        expect(errors).toEqual([])
      },
    )
  }
}
