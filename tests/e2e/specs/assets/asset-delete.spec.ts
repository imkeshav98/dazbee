// Deleting an image from the asset library in Chromium, with real input: Delete on the tile asks
// first; one nothing uses goes once confirmed; one the open design uses, or another design does,
// can't be deleted and the panel says where it is used.
import { randomUUID } from 'node:crypto'

import type { DesignInput } from '@dazbee/schema'

import { api, photo, upload } from '../../support/assets.ts'
import { writeOutput } from '../../support/editor.ts'
import { API_URL, DEV_BRAND } from '../../support/seed.ts'
import { openStage } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

const run = randomUUID().slice(0, 8)
/** The sneaker photo with bytes of its own after its end, so each is a new image. */
const unique = (tag: string) => new Uint8Array(Buffer.concat([Buffer.from(photo), Buffer.from(`${run}-${tag}`)]))
const design = (assetId?: string): DesignInput => ({
  meta: {
    designId: 'replaced-by-the-api',
    name: 'Delete images',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFF8F0FF' }] } },
  nodes: assetId
    ? {
        photo: {
          type: 'graphic',
          parentId: 'p1',
          index: 'a0',
          name: 'Photo',
          props: {
            x: 100,
            y: 100,
            width: 600,
            height: 400,
            shape: { kind: 'rect' },
            fills: [{ type: 'image', assetId, fit: 'fill' }],
          },
        },
      }
    : {},
  overrides: {},
})
/** Whether the library lists the asset. */
const listed = async (id: string) =>
  ((await (await fetch(`${API_URL}/brands/${DEV_BRAND}/assets`)).json()) as { id: string }[]).some((a) => a.id === id)

/** How many lines a control's words take up. */
const lines = (control: Locator) =>
  control.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size
  })

/** Opens the library, finds the asset and presses Delete on its tile. */
async function deleteFromLibrary(page: Page, id: string, name: string) {
  await page.locator('[data-panel="assets"]').click()
  const library = page.getByTestId('asset-library')
  await library.getByRole('searchbox', { name: 'Search by name or tag' }).fill(name)
  const tile = library.locator(`li[data-asset="${id}"]`)
  await tile.hover()
  await tile.getByRole('button', { name: `Delete: ${name}` }).click()
  return { library, tile, details: page.getByTestId('asset-details') }
}

test('an image nothing uses is deleted once Delete is confirmed', async ({ browser }) => {
  const asset = await upload(unique('unused'))
  const name = `Unused ${run}`
  await fetch(`${API_URL}/brands/${DEV_BRAND}/assets/${asset.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const { page, errors } = await openStage(browser, design())
  const { tile, details } = await deleteFromLibrary(page, asset.id, name)
  // The button reads Delete on one line; the asset's name is in the question above it.
  await expect(details.getByTestId('asset-delete-ask')).toHaveText(`Delete “${name}” for good? This can’t be undone.`)
  await expect(details.getByTestId('asset-delete-confirm')).toHaveText('Delete')
  expect(await lines(details.getByTestId('asset-delete-confirm'))).toBe(1)
  writeOutput('asset-delete-confirm.png', await page.screenshot())
  await details.getByTestId('asset-delete-confirm').click()
  await expect(tile).toHaveCount(0)
  expect(await listed(asset.id)).toBe(false)
  expect(errors).toEqual([])
})

test('the confirm opens with the focus on Keep: Esc keeps the image, and so does Enter', async ({ browser }) => {
  const asset = await upload(unique('kept'))
  const name = `Kept ${run}`
  await fetch(`${API_URL}/brands/${DEV_BRAND}/assets/${asset.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const { page, errors } = await openStage(browser, design())
  const { tile, details } = await deleteFromLibrary(page, asset.id, name)
  const keep = details.getByRole('button', { name: 'Keep' })
  await expect(keep).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(details.getByTestId('asset-delete-confirm')).toHaveCount(0)
  await expect(details.getByTestId('asset-delete')).toBeFocused()

  // Enter on the details' Delete asks again, and Enter then keeps the image.
  await page.keyboard.press('Enter')
  await expect(keep).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(details.getByTestId('asset-delete-confirm')).toHaveCount(0)
  await expect(tile).toHaveCount(1)
  expect(await listed(asset.id)).toBe(true)
  expect(errors).toEqual([])
})

test('an image the open design uses stays, and the panel says so', async ({ browser }) => {
  const asset = await upload(unique('here'))
  const name = `Here ${run}`
  await fetch(`${API_URL}/brands/${DEV_BRAND}/assets/${asset.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const { page, errors } = await openStage(browser, design(asset.id))
  const { tile, details } = await deleteFromLibrary(page, asset.id, name)
  await expect(details.getByTestId('asset-in-use')).toHaveText('Used in this design')
  await expect(details.getByTestId('asset-delete-confirm')).toHaveCount(0)
  await expect(tile).toHaveCount(1)
  expect(await listed(asset.id)).toBe(true)
  writeOutput('asset-delete-in-use.png', await page.screenshot())
  expect(errors).toEqual([])
})

test('an image another design uses stays, and the panel names that design', async ({ browser }) => {
  const asset = await upload(unique('elsewhere'))
  const name = `Elsewhere ${run}`
  await fetch(`${API_URL}/brands/${DEV_BRAND}/assets/${asset.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  await api('/designs', { name: `Shop window ${run}`, content: design(asset.id) })
  const { page, errors } = await openStage(browser, design())
  const { tile, details } = await deleteFromLibrary(page, asset.id, name)
  await expect(details.getByTestId('asset-in-use')).toHaveText(`Used in Shop window ${run}`)
  await expect(details.getByTestId('asset-delete-confirm')).toHaveCount(0)
  await expect(tile).toHaveCount(1)
  expect(await listed(asset.id)).toBe(true)
  writeOutput('asset-delete-elsewhere.png', await page.screenshot())
  expect(errors).toEqual([])
})
