// The Brand kit page outside the editor: a brand's colour, font, logo and tone of voice set there
// are saved and shown again after a reload, and a design bound to the brand colour opens in the
// colour the page last gave it.
import type { DesignInput } from '@dazbee/schema'

import { tile } from '../../support/assets.ts'
import { editorPath, writeOutput } from '../../support/editor.ts'
import { choose } from '../../support/fields.ts'
import { getKit, newBrand, seed } from '../../support/seed.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })
test.use({ viewport: { width: 1440, height: 900 } })

const voice = 'Warm and plain, like a barista who knows your order.'

/** A design whose box follows the brand's first colour, stored in the colour it had then. */
const bound = (stored: string): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Kit page', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    box: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Box',
      bindings: { fill: 'brand:colour-1' },
      props: {
        x: 640,
        y: 140,
        width: 300,
        height: 300,
        shape: { kind: 'rect', cornerRadius: 24 },
        fills: [{ type: 'solid', color: stored }],
      },
    },
  },
  overrides: {},
})

/** The colour the export render draws in the middle of the box. */
const boxColor = (page: Page) =>
  page.evaluate(() => {
    const pixels = window.dazbee?.exportPixels()
    const at = (290 * 1080 + 790) * 4
    return pixels ? [pixels[at], pixels[at + 1], pixels[at + 2]] : null
  })

/** Types into a field of the kit and leaves it, which is when the kit takes what was typed. */
async function enter(page: Page, name: string, value: string) {
  const field = page.getByTestId('home-kit').getByRole('textbox', { name, exact: true })
  await field.fill(value)
  await field.press('Enter')
}

test('the colour, font, logo and voice set on the Brand kit page are kept after a reload, and a design bound to the colour follows it', async ({
  page,
}) => {
  const brandId = await newBrand('e2e kit page')
  await page.goto(`/brands/${brandId}/kit`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brand kit')
  const kit = page.getByTestId('home-kit')

  // A colour, named and given a value.
  await kit.getByRole('button', { name: 'Add colour' }).click()
  await enter(page, 'Name of colour 1', 'Harbour red')
  await enter(page, 'Hex value of Harbour red', 'e0262b')
  // A font, named and given a family.
  await kit.getByRole('button', { name: 'Add font' }).click()
  await enter(page, 'Name of font 1', 'Headline')
  await choose(kit.getByRole('combobox', { name: 'Family of Headline' }), 'Noto Naskh Arabic')
  // A logo, uploaded from the computer.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    kit.getByRole('button', { name: 'Upload a logo' }).click(),
  ])
  await chooser.setFiles({ name: 'Harbour logo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(tile) })
  await expect(kit.getByRole('combobox', { name: 'Logo', exact: true })).toHaveText('Harbour logo')
  // The tone of voice, taken as the field is left.
  await kit.getByRole('textbox', { name: 'Tone of voice' }).fill(voice)
  await kit.getByRole('textbox', { name: 'Tone of voice' }).blur()

  await expect
    .poll(() => getKit(brandId))
    .toMatchObject({
      colors: [{ token: 'colour-1', name: 'Harbour red', value: '#E0262BFF' }],
      fonts: [{ token: 'font-1', name: 'Headline', family: 'Noto Naskh Arabic' }],
      logoAssetId: expect.any(String),
      voice,
    })
  const saved = await getKit(brandId)
  writeOutput('kit-page-0-set.png', await page.screenshot({ fullPage: true, animations: 'disabled' }))

  // After a reload the page shows every part as it was set.
  await page.reload()
  await expect(kit.getByRole('textbox', { name: 'Name of colour 1', exact: true })).toHaveValue('Harbour red')
  await expect(kit.getByRole('textbox', { name: 'Hex value of Harbour red', exact: true })).toHaveValue('#E0262B')
  await expect(kit.getByRole('textbox', { name: 'Name of font 1', exact: true })).toHaveValue('Headline')
  await expect(kit.getByRole('combobox', { name: 'Family of Headline' })).toHaveAttribute(
    'data-value',
    'Noto Naskh Arabic',
  )
  await expect(kit.getByRole('combobox', { name: 'Logo', exact: true })).toHaveAttribute(
    'data-value',
    saved.logoAssetId ?? '',
  )
  await expect(kit.getByRole('combobox', { name: 'Logo', exact: true })).toHaveText('Harbour logo')
  const thumbnail = kit.locator(`img[src*="/assets/${saved.logoAssetId ?? ''}/thumbnail"]`)
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0)
  await expect(kit.getByRole('textbox', { name: 'Tone of voice' })).toHaveValue(voice)
  writeOutput('kit-page-1-reloaded.png', await page.screenshot({ fullPage: true, animations: 'disabled' }))

  // A design made while the colour was red, stored red; the page then makes the colour green.
  const designId = await seed(bound('#E0262BFF'), { brandId })
  await enter(page, 'Hex value of Harbour red', '#1F9D55')
  await expect.poll(async () => (await getKit(brandId)).colors[0]?.value).toBe('#1F9D55FF')
  await page.goto(editorPath(designId, { brandId }))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  await expect.poll(() => boxColor(page)).toEqual([31, 157, 85])
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('kit-page-2-design-follows.png', await page.screenshot({ animations: 'disabled' }))
})
