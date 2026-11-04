// The brief's toolbar (#136) in Chromium: + adds a reference ad or images uploaded to the brand's
// assets as thumbnails above the brief, and Brand kit opens the whole kit to pick from. Each choice
// is a form field.
import { AssetSummary } from '@dazbee/schema'

import { photo } from '../../support/assets.ts'
import { writeOutput } from '../../support/editor.ts'
import { API_URL, DEV_BRAND, liveDesign, newBrand, putKit, seed } from '../../support/seed.ts'
import { expect, test } from '../../support/test.ts'

test.use({ viewport: { width: 1440, height: 900 } })

test('+ adds a reference ad and uploaded images above the brief, each taken off again by its ✕', async ({ page }) => {
  test.setTimeout(60_000)
  const run = crypto.randomUUID().slice(0, 6)
  const name = `Reference ${run}`
  const designId = await seed(liveDesign(), { name })
  await page.goto(`/brands/${DEV_BRAND}`)
  const add = page.getByRole('button', { name: 'Add a reference or images' })

  // A reference ad: one of the brand's designs.
  await add.click()
  await page.getByRole('button', { name: /^Reference ad/ }).click()
  await page.getByTestId('brief-references').getByRole('button', { name }).click()
  const reference = page.getByTestId('brief-reference')
  await expect(reference).toBeVisible()
  await expect(page.locator('input[name="reference"]')).toHaveValue(designId)
  writeOutput('composer-1-reference.png', await page.screenshot())
  await reference.getByRole('button', { name: `Remove ${name}` }).click()
  await expect(reference).toHaveCount(0)
  await expect(page.locator('input[name="reference"]')).toHaveCount(0)

  // Images: chosen from the + menu, uploaded into the brand's assets.
  await add.click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Upload images/ }).click()
  await (await chooser).setFiles([{ name: `sneaker-${run}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(photo) }])
  const image = page.getByTestId('brief-image')
  await expect(image.locator('img')).toBeVisible({ timeout: 20_000 })
  const assetId = await page.locator('input[name="image"]').inputValue()
  const assets = AssetSummary.array().parse(await (await fetch(`${API_URL}/brands/${DEV_BRAND}/assets`)).json())
  expect(assets.map((a) => a.id)).toContain(assetId)
  writeOutput('composer-2-image.png', await page.screenshot())
  await image.getByRole('button', { name: `Remove sneaker-${run}.jpg` }).click()
  await expect(image).toHaveCount(0)
  await expect(page.locator('input[name="image"]')).toHaveCount(0)
})

test('Brand kit opens the whole kit: the switch, and each colour, font and the voice picked or not', async ({
  page,
}) => {
  const brandId = await newBrand('e2e composer')
  await putKit(brandId, {
    colors: [
      { token: 'ink', name: 'Ink', value: '#1A1420FF' },
      { token: 'pop', name: 'Pop pink', value: '#FF48B0FF' },
    ],
    fonts: [{ token: 'heading', name: 'Headings', family: 'Bricolage Grotesque' }],
    voice: 'Warm, quick and never pushy.',
  })
  await page.goto(`/brands/${brandId}`)
  const button = page.getByTestId('brief-kit')
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await button.click()
  const panel = page.getByTestId('brief-kit-panel')
  await expect(panel).toContainText('2 of 2 colours, 1 of 1 fonts')
  await expect(panel).toContainText('Warm, quick and never pushy.')
  await expect(page.locator('input[name="kitColor"]')).toHaveCount(2)

  // Leave one colour out.
  const pink = panel.getByRole('button', { name: 'Pop pink' })
  await pink.click()
  await expect(pink).toHaveAttribute('aria-pressed', 'false')
  await expect(panel).toContainText('1 of 2 colours')
  await expect(page.locator('input[name="kitColor"]')).toHaveCount(1)
  await expect(page.locator('input[name="kitColor"]')).toHaveValue('ink')
  await expect(page.locator('input[name="kitFont"]')).toHaveValue('heading')
  await expect(page.locator('input[name="kitVoice"]')).toHaveValue('on')
  writeOutput('composer-3-kit.png', await page.screenshot())

  // The switch turns the whole kit off: nothing of it is sent.
  const use = panel.getByRole('switch', { name: 'Use brand kit' })
  await use.click()
  await expect(use).toHaveAttribute('aria-checked', 'false')
  await expect(
    page.locator('input[name="kit"], input[name="kitColor"], input[name="kitFont"], input[name="kitVoice"]'),
  ).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(button).toBeFocused()
})
