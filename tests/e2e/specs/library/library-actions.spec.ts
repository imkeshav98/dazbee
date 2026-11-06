// Renaming, copying and deleting in the library (#159) in Chromium: a design tile's menu renames,
// duplicates and deletes it (asking first), with rows a finger can hit on a phone; a template tile's
// menu renames and deletes it; and the editor's crumb renames the design open in it.
import { type DesignInput, DesignSummary, TemplateSummary } from '@dazbee/schema'

import { editorPath, writeOutput } from '../../support/editor.ts'
import { rowHeights } from '../../support/layout.ts'
import { TILE_MENU } from '../../support/menu-rows.ts'
import { API_URL, DEV_BRAND, frameDesign, seed } from '../../support/seed.ts'
import { expect, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

const content = (name: string): DesignInput =>
  frameDesign({ name, fills: [{ type: 'solid', color: '#0F6E66FF' }], nodes: {} })
const designs = async () =>
  DesignSummary.array().parse(await (await fetch(`${API_URL}/brands/${DEV_BRAND}/designs`)).json())
const templates = async () =>
  TemplateSummary.array().parse(await (await fetch(`${API_URL}/brands/${DEV_BRAND}/templates`)).json())

test('a design tile renames, duplicates and deletes its design', async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 6)
  const id = await seed(content(`Summer ${run}`))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/brands/${DEV_BRAND}/designs`)
  const tile = page.getByTestId('design-tile').filter({ hasText: `Summer ${run}` })
  await tile.hover()
  await tile.getByRole('button', { name: `More for Summer ${run}` }).click()
  await expect(page.getByRole('menuitem')).toHaveText(TILE_MENU.map((row) => row.reads))
  writeOutput('library-actions-1-menu.png', await page.screenshot())

  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await tile.getByRole('textbox', { name: 'Name' }).fill(`Autumn ${run}`)
  await tile.getByRole('button', { name: 'Save' }).click()
  await expect.poll(async () => (await designs()).find((d) => d.id === id)?.name).toBe(`Autumn ${run}`)
  const renamed = page.locator(`[data-design="${id}"]`)
  await expect(renamed).toBeVisible()

  await renamed.hover()
  await renamed.getByRole('button', { name: `More for Autumn ${run}` }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(page.getByTestId('design-tile').filter({ hasText: `Autumn ${run} copy` })).toBeVisible()
  expect((await designs()).find((d) => d.name === `Autumn ${run} copy`)?.id).toMatch(/^[0-9a-z]{12}$/)

  // Delete asks first; Cancel keeps it, Delete takes it.
  await renamed.hover()
  await renamed.getByRole('button', { name: `More for Autumn ${run}` }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(renamed).toContainText('can’t be undone')
  writeOutput('library-actions-2-delete.png', await page.screenshot())
  await renamed.getByRole('button', { name: 'Cancel' }).click()
  expect((await designs()).some((d) => d.id === id)).toBe(true)
  await renamed.hover()
  await renamed.getByRole('button', { name: `More for Autumn ${run}` }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await renamed.getByRole('button', { name: 'Delete' }).click()
  await expect.poll(async () => (await designs()).some((d) => d.id === id)).toBe(false)
  await expect(renamed).toHaveCount(0)
})

test("on a phone a design tile's menu rows are at least 44 px tall", async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 6)
  await seed(content(`Phone ${run}`))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/brands/${DEV_BRAND}/designs`)
  const tile = page.getByTestId('design-tile').filter({ hasText: `Phone ${run}` })
  await tile.getByRole('button', { name: `More for Phone ${run}` }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem')).toHaveText(TILE_MENU.map((row) => row.reads))
  for (const height of await rowHeights(menu, '[role="menuitem"]')) expect(height).toBeGreaterThanOrEqual(44)
})

test('a template tile renames and deletes its template', async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 6)
  const saved = await fetch(`${API_URL}/brands/${DEV_BRAND}/templates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Offer ${run}`, scope: 'brand', content: content(`Offer ${run}`) }),
  })
  expect(saved.status).toBe(201)
  const template = TemplateSummary.parse(await saved.json())
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/brands/${DEV_BRAND}/templates`)
  const tile = page.locator(`[data-template="${template.id}"]`)
  await tile.hover()
  await tile.getByRole('button', { name: `More for Offer ${run}` }).click()
  await expect(page.getByRole('menuitem')).toHaveText(TILE_MENU.filter((row) => !row.design).map((row) => row.reads))
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await tile.getByRole('textbox', { name: 'Name' }).fill(`Weekend ${run}`)
  await tile.getByRole('button', { name: 'Save' }).click()
  await expect.poll(async () => (await templates()).find((x) => x.id === template.id)?.name).toBe(`Weekend ${run}`)
  await tile.hover()
  await tile.getByRole('button', { name: `More for Weekend ${run}` }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await tile.getByRole('button', { name: 'Delete' }).click()
  await expect.poll(async () => (await templates()).some((x) => x.id === template.id)).toBe(false)
  await expect(tile).toHaveCount(0)
})

test('the editor renames the design from its crumb', async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 6)
  const id = await seed(content(`Crumb ${run}`))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(editorPath(id))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  const heading = page.getByRole('heading', { level: 1 })
  await heading.getByRole('button', { name: `Crumb ${run}` }).click()
  const field = page.getByRole('textbox', { name: `Rename Crumb ${run}` })
  await field.fill(`Launch ${run}`)
  await field.press('Enter')
  await expect(heading).toHaveText(`Launch ${run}`)
  await expect.poll(async () => (await designs()).find((d) => d.id === id)?.name).toBe(`Launch ${run}`)
  // Esc keeps the name it has.
  await heading.getByRole('button').click()
  await page.getByRole('textbox', { name: `Rename Launch ${run}` }).fill('Never saved')
  await page.getByRole('textbox', { name: `Rename Launch ${run}` }).press('Escape')
  await expect(heading).toHaveText(`Launch ${run}`)
  writeOutput('library-actions-3-crumb.png', await page.screenshot())
})
