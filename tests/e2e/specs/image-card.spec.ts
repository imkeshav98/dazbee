// The Image card (#154) in Chromium, with real input: a filter picked from tiles of the picture
// itself, how the image fits the layer, and under them its opacity and adjustments.
import type { DesignInput } from '@dazbee/schema'

import { photo, upload } from '../support/assets.ts'
import { writeOutput } from '../support/editor.ts'
import { openStage } from '../support/stage.ts'
import { expect, type Locator, type Page, test } from '../support/test.ts'
import { barMenu, openCard } from '../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const design = (assetId: string): DesignInput => ({
  meta: {
    schemaVersion: 5,
    designId: 'replaced-by-the-api',
    name: 'Image card',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    photo: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Photo',
      props: {
        x: 140,
        y: 140,
        width: 800,
        height: 800,
        shape: { kind: 'rect', cornerRadius: 24 },
        fills: [{ type: 'image', assetId, fit: 'fill' }],
      },
    },
    box: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a1',
      name: 'Box',
      props: {
        x: 40,
        y: 40,
        width: 80,
        height: 80,
        shape: { kind: 'rect' },
        fills: [{ type: 'solid', color: '#14213DFF' }],
      },
    },
  },
  overrides: {},
})

const imageOf = async (page: Page) =>
  ((await page.evaluate(() => window.dazbee?.design().nodes.photo?.props)) as { fills: Record<string, unknown>[] })
    .fills[0]
const enter = async (field: Locator, value: string) => {
  await field.fill(value)
  await field.press('Enter')
}

test("the bar's Look sets the filter; the header card the fit; the Adjust card the opacity and the adjustments", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))

  // A plain shape has no Edit image panel.
  await page.evaluate(() => window.dazbee?.select(['box']))
  await expect(page.getByTestId('bar-colour')).toBeVisible()
  await expect(page.getByTestId('bar-edit')).toHaveCount(0)

  await page.evaluate(() => window.dazbee?.select(['photo']))
  // A photo's fills are in its Edit image panel and its strokes in Outline; its bar has no Colour.
  await expect((await barMenu(page, 'outline')).getByTestId('stroke-list')).toBeVisible()
  await expect((await openCard(page, 'fill-card')).getByTestId('fill-list')).toBeVisible()
  await expect(page.getByTestId('bar-colour')).toHaveCount(0)
  const card = async () => await openCard(page, 'adjust-card')
  const look = async () => (await openCard(page, 'look-card')).getByRole('radiogroup', { name: 'Filter' })
  const filters = await look()
  await expect(filters.getByRole('radio')).toHaveCount(7)
  await expect(filters.getByRole('radio', { name: 'Original' })).toHaveAttribute('aria-checked', 'true')
  // Each tile shows the picture itself.
  await expect(filters.locator('img').first()).toHaveJSProperty('complete', true)

  await filters.getByRole('radio', { name: 'Warm' }).click()
  await (
    await openCard(page, 'fill-card')
  )
    .getByRole('radiogroup', { name: 'Fit' })
    .getByRole('radio', { name: 'Fit inside' })
    .click()
  await expect.poll(() => imageOf(page)).toMatchObject({ filter: 'warm', fit: 'fit' })

  await enter((await card()).getByRole('spinbutton', { name: 'Image opacity' }), '80')
  await enter((await card()).getByRole('spinbutton', { name: 'Contrast' }), '30')
  await enter((await card()).getByRole('spinbutton', { name: 'Saturation' }), '-250')
  await (await card()).getByRole('spinbutton', { name: 'Light' }).press('Shift+ArrowUp')
  await expect
    .poll(() => imageOf(page))
    .toMatchObject({ opacity: 0.8, adjust: { exposure: 10, contrast: 30, saturation: -100, temperature: 0, tint: 0 } })
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('image-card.png', await page.screenshot())

  // Original takes the filter off again.
  await (await look()).getByRole('radio', { name: 'Original' }).click()
  await expect.poll(async () => (await imageOf(page))?.filter).toBeUndefined()
  expect(errors).toEqual([])
})
