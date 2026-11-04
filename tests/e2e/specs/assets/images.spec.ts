// Image uploads (#35): an image uploaded to one brand is served to that brand's editor only.
import { photo, upload } from '../../support/assets.ts'
import { DEV_BRAND } from '../../support/seed.ts'
import { expect, test } from '../../support/test.ts'

test('the editor cannot read another brand’s image', async ({ page }) => {
  const asset = await upload(photo)
  const response = await page.request.get(`/brands/dev-brand-cycles/assets/${asset.id}`)
  expect(response.status()).toBe(404)
  const own = await page.request.get(`/brands/${DEV_BRAND}/assets/${asset.id}`)
  expect(own.status()).toBe(200)
  expect(new Uint8Array(await own.body())).toEqual(photo)
})
