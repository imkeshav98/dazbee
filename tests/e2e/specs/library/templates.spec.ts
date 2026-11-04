// Templates (#54) in Chromium: save a design as a template from the editor, find it with its
// thumbnail on the brand page, start a design from it (same pixels, no shared ids), edit that
// design, and the template is unchanged: a second design started from it is the original again. Save
// as template takes the focus as it opens from Share, and gives it back on Esc.
import { randomUUID } from 'node:crypto'

import { type DesignInput, TemplateSummary } from '@dazbee/schema'

import { exportHashOf, placed, writeOutput } from '../../support/editor.ts'
import { API_URL, DEV_BRAND } from '../../support/seed.ts'
import { drag, openStage, read } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

const run = randomUUID().slice(0, 8)
const design = (): DesignInput => ({
  meta: {
    designId: 'replaced-by-the-api',
    name: `Autumn sale ${run}`,
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFF4E6FF' }] } },
  nodes: {
    box: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Box',
      props: {
        x: 140,
        y: 140,
        width: 500,
        height: 360,
        shape: { kind: 'rect', cornerRadius: 40 },
        fills: [{ type: 'solid', color: '#C2410CFF' }],
      },
    },
    dot: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a1',
      name: 'Dot',
      props: {
        x: 600,
        y: 560,
        width: 320,
        height: 320,
        shape: { kind: 'ellipse' },
        fills: [{ type: 'solid', color: '#14213DFF' }],
      },
    },
  },
  overrides: {},
})

/** Waits for a freshly opened design to be live, with the same camera as openStage, and drawn. */
async function ready(page: Page) {
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => window.dazbee?.setCamera({ x: 100, y: 60, zoom: 0.8 }))
  await page.evaluate(() => window.dazbee?.drawn())
}

/** Every id a design holds: its own, its formats', pages' and layers'. */
const idsOf = (design: object) => {
  const d = design as { meta?: { designId?: string }; formats?: object; pages?: object; nodes: object }
  return [d.meta?.designId, ...Object.keys(d.formats ?? {}), ...Object.keys(d.pages ?? {}), ...Object.keys(d.nodes)]
}

/** The layer named `name`, with its id and its place in the primary format. */
const named = async (page: Page, name: string) => {
  const design = (await read(page)) as unknown as {
    meta: { primaryFormatId: string }
    nodes: Record<string, { name: string; props: Record<string, unknown> }>
    overrides: Record<string, Record<string, Record<string, unknown>>>
  }
  const found = Object.entries(design.nodes).find(([, n]) => n.name === name)
  if (!found) throw new Error(`no layer ${name}`)
  return { id: found[0], ...(placed(design, found[0], design.meta.primaryFormatId) as { x: number; y: number }) }
}

test('Save as template opened from Share, by pointer or keyboard, takes the focus onto its name, and Esc gives it back to Share', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  const share = page.getByTestId('share-open')
  const dialog = page.getByTestId('template')
  const name = dialog.getByRole('textbox', { name: 'Template name' })
  await share.click()
  await page.getByTestId('template-open').click()
  await expect(name).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(share).toBeFocused()

  // Enter opens the menu, the arrow goes on to Save as template, and Enter opens it.
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('template-open')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(name).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(share).toBeFocused()
  expect(errors).toEqual([])
})

test('save a template, start a design from it, edit that design, and the template is unchanged', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  const original = await exportHashOf(page)
  const source = await read(page)
  const sourceId = page.url().split('/designs/')[1]
  const name = `Autumn sale template ${run}`

  // Save it as a template for this brand only.
  await page.getByTestId('share-open').click()
  await page.getByTestId('template-open').click()
  const dialog = page.getByTestId('template')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Template name' })).toHaveValue(`Autumn sale ${run}`)
  await dialog.getByRole('textbox', { name: 'Template name' }).fill(name)
  await dialog.getByRole('radio', { name: 'Only Harbour Coffee' }).check()
  writeOutput('templates-0-save.png', await page.screenshot())
  await dialog.getByTestId('template-save').click()
  await expect(dialog.getByRole('status')).toHaveText(`Saved “${name}” as a template.`)
  writeOutput('templates-1-saved.png', await page.screenshot())

  const listed = TemplateSummary.array().parse(await (await fetch(`${API_URL}/brands/${DEV_BRAND}/templates`)).json())
  const template = listed.find((t) => t.name === name)
  expect(template).toMatchObject({ scope: 'brand', brandId: DEV_BRAND, kind: 'single', width: 1080, height: 1080 })

  // The brand's Templates page lists it with its thumbnail, the small copy the API drew.
  await dialog.getByRole('link', { name: 'See it with the templates' }).click()
  await expect(page).toHaveURL(new RegExp(`/brands/${DEV_BRAND}/templates$`))
  const card = page.locator(`li[data-template="${template?.id}"]`)
  await expect(card).toBeVisible()
  await expect(card).toContainText('Harbour Coffee')
  await expect
    .poll(() =>
      card
        .locator('img')
        .evaluate((img: HTMLImageElement) => (img.complete ? [img.naturalWidth, img.naturalHeight] : null)),
    )
    .toEqual([320, 320])
  writeOutput(
    'templates-2-gallery.png',
    await page.getByRole('list', { name: 'Templates' }).screenshot({ animations: 'disabled' }),
  )

  // Start a design from it: a new design, the same pixels, none of the template's ids.
  await card.getByRole('button', { name: `Use ${name}` }).click()
  await expect(page).toHaveURL(/\/designs\/[\w-]+$/, { timeout: 20_000 })
  await ready(page)
  const started = await read(page)
  const startedId = page.url().split('/designs/')[1]
  expect(startedId).not.toBe(sourceId)
  expect(await exportHashOf(page)).toBe(original)
  const shared = idsOf(started).filter((id) => idsOf(source).includes(id))
  expect(shared).toEqual([])
  writeOutput('templates-3-started.png', await page.screenshot())

  // Edit it: drag the box 200 px right.
  const box = await named(page, 'Box')
  await drag(page, { x: 390, y: 320 }, { x: 590, y: 320 })
  await expect.poll(async () => (await named(page, 'Box')).x).toBe(box.x + 200)
  expect(await exportHashOf(page)).not.toBe(original)
  writeOutput('templates-4-edited.png', await page.screenshot())

  // The template is as it was: a second design started from it is the original again.
  await page.goto(`/brands/${DEV_BRAND}/templates`)
  await page
    .locator(`li[data-template="${template?.id}"]`)
    .getByRole('button', { name: `Use ${name}` })
    .click()
  await expect(page).not.toHaveURL(new RegExp(`/designs/${startedId}$`))
  await expect(page).toHaveURL(/\/designs\//, { timeout: 20_000 })
  await ready(page)
  expect(await exportHashOf(page)).toBe(original)
  expect((await named(page, 'Box')).x).toBe(box.x)
  expect(errors).toEqual([])
})
