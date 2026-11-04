// The visual-first property cards (as in the final mock) in Chromium: text's size and its colour
// from the brand kit, the effects as tiles with their numbers under them, and the header card that
// names the layer and holds its box.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../../support/editor.ts'
import { newBrand, putKit } from '../../support/seed.ts'
import { openStage } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, openCard } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput => ({
  meta: {
    designId: 'replaced-by-the-api',
    name: 'Look cards',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FF8A3DFF' }] } },
  nodes: {
    headline: {
      type: 'text',
      parentId: 'p1',
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
      parentId: 'p1',
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
  overrides: {},
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
