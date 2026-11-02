// Text bound to a brand font when the kit's font changes, in Chromium: the bound text takes the new
// family and its box fits it again in every format, all in one undo step; a box that shrinks its
// words to fit keeps them inside, and the export draws every word within its box.
import { expect, test, type Page } from '../support/test.ts'
import { EMPTY_BRAND_KIT, type DesignInput } from '@dazbee/schema'
import { writeOutput } from '../support/editor.ts'
import { importGoogleFonts } from '../support/fonts.ts'
import { API_URL, DEV_BRAND } from '../support/seed.ts'
import { openStage, read } from '../support/stage.ts'

test.describe.configure({ timeout: 180_000 })

const heading = { fontFamily: 'brand:heading' as const }
const style = { fontFamily: 'Noto Sans', fontSize: 72, fontWeight: 400, color: '#111111FF' }
const design = (): DesignInput => ({
  meta: { schemaVersion: 3, designId: 'replaced-by-the-api', name: 'Brand font', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' }, story: { name: 'Story', width: 1080, height: 1920, order: 'a1' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    // A box that grows wide with its words, smaller in the story.
    wide: { type: 'text', parentId: 'p1', index: 'a0', name: 'Wide', bindings: heading, props: { x: 60, y: 100, width: 420, height: 98, boxMode: 'autoWidth', text: 'Summer sale', style } },
    // A long headline in a fixed box that shrinks its words to fit.
    shrink: { type: 'text', parentId: 'p1', index: 'a1', name: 'Shrink', bindings: heading, props: { x: 60, y: 400, width: 460, height: 200, boxMode: 'fixed', shrinkToFit: { min: 12, max: 72 }, text: 'Cold brew, three ways, every single morning of the week', style } },
  },
  overrides: { 'format:story': { wide: { style: { ...style, fontSize: 48 } } } },
})

type Text = { props: { width: number; height: number; style: { fontFamily: string } } }
const text = async (page: Page, id: string) => (await read(page)).nodes[id] as unknown as Text
const storyWidth = async (page: Page) => ((await read(page)).overrides['format:story']?.wide as { width?: number } | undefined)?.width
const putKit = (family: string) => fetch(`${API_URL}/brands/${DEV_BRAND}/kit`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...EMPTY_BRAND_KIT, fonts: [{ token: 'heading', name: 'Heading', family }] }) })

/** Whether the export draws anything but the white page in a column band right of a box, over its rows. */
const inkRightOf = (page: Page, box: { x: number; y: number; width: number; height: number }) => page.evaluate((box) => {
  const pixels = window.dazbee?.exportPixels()
  if (!pixels) throw new Error('no export')
  for (let y = Math.round(box.y); y < Math.round(box.y + box.height); y++) {
    for (let x = Math.ceil(box.x + box.width) + 2; x < Math.min(1080, box.x + box.width + 200); x++) {
      const at = (y * 1080 + x) * 4
      if ((pixels[at] ?? 255) < 200) return true
    }
  }
  return false
}, box)

test.beforeAll(async () => {
  importGoogleFonts(['Playfair Display'])
  expect((await putKit('Noto Sans')).ok).toBe(true)
})
test.afterAll(async () => {
  await fetch(`${API_URL}/brands/${DEV_BRAND}/kit`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(EMPTY_BRAND_KIT) })
})

test('a brand kit font change refits the text bound to it in every format, in one undo step', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const before = { wide: (await text(page, 'wide')).props.width, story: await storyWidth(page) }

  // Change the kit's Heading font in the Brand panel.
  await page.locator('[data-panel="brand"]').click()
  const kit = page.getByTestId('brand-kit')
  await kit.getByRole('button', { name: 'Edit', exact: true }).click()
  await kit.getByRole('combobox', { name: 'Family of Heading' }).click()
  await page.locator('[role="listbox"] [role="option"][data-value="Playfair Display"]').click()

  // Both bound texts take the family; the wide box fits its words again, in the square and the story.
  await expect.poll(async () => (await text(page, 'wide')).props.style.fontFamily, { timeout: 20_000 }).toBe('Playfair Display')
  expect((await text(page, 'shrink')).props.style.fontFamily).toBe('Playfair Display')
  const after = { wide: (await text(page, 'wide')).props.width, story: await storyWidth(page) }
  expect(after.wide).not.toBe(before.wide)
  expect(after.story).toBeDefined()
  expect(after.story).not.toBe(before.story)
  // The shrinking box keeps its size.
  expect((await text(page, 'shrink')).props).toMatchObject({ width: 460, height: 200 })

  // The export draws every word inside its box: nothing to the right of either.
  await page.evaluate(() => window.dazbee?.drawn())
  await page.evaluate(() => window.dazbee?.exportFiles({ pageIds: ['p1'], formatIds: ['sq'], type: 'png' }))
  const wide = (await text(page, 'wide')).props
  expect(await inkRightOf(page, { x: 60, y: 100, width: wide.width, height: wide.height })).toBe(false)
  expect(await inkRightOf(page, { x: 60, y: 400, width: 460, height: 200 })).toBe(false)
  writeOutput('brand-font-refit.png', await page.screenshot())

  // One undo step puts the old family and the old boxes back.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await text(page, 'wide')).props.style.fontFamily).toBe('Noto Sans')
  expect((await text(page, 'wide')).props.width).toBe(before.wide)
  expect(await storyWidth(page)).toBe(before.story)
  expect((await text(page, 'shrink')).props.style.fontFamily).toBe('Noto Sans')
  expect(errors).toEqual([])
})
