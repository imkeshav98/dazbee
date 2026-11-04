// Text bound to a brand font when the kit's font changes, in Chromium: the bound text takes the new
// family and its box fits it again in every format, as a change no one undoes (the kit can't be
// undone with it); a box that shrinks its words to fit keeps them inside, and the export draws every
// word within its box.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../../support/editor.ts'
import { importGoogleFonts } from '../../support/fonts.ts'
import { newBrand, putKit } from '../../support/seed.ts'
import { openStage, read } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

const heading = { fontFamily: 'brand:heading' as const }
const style = { fontFamily: 'Noto Sans', fontSize: 72, fontWeight: 400, color: '#111111FF' }
const design = (): DesignInput => ({
  meta: {
    schemaVersion: 5,
    designId: 'replaced-by-the-api',
    name: 'Brand font',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    story: { name: 'Story', width: 1080, height: 1920, order: 'a1' },
  },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    // A box that grows wide with its words, smaller in the story.
    wide: {
      type: 'text',
      parentId: 'p1',
      index: 'a0',
      name: 'Wide',
      bindings: heading,
      props: { x: 60, y: 100, width: 420, height: 98, boxMode: 'autoWidth', text: 'Summer sale', style },
    },
    // A box that grows down with its words.
    tall: {
      type: 'text',
      parentId: 'p1',
      index: 'a2',
      name: 'Tall',
      bindings: heading,
      props: {
        x: 720,
        y: 100,
        width: 320,
        height: 98,
        boxMode: 'autoHeight',
        text: 'Fresh beans roasted daily',
        style,
      },
    },
    // A long headline in a fixed box, kept as it is.
    fixed: {
      type: 'text',
      parentId: 'p1',
      index: 'a3',
      name: 'Fixed',
      bindings: heading,
      props: { x: 600, y: 700, width: 400, height: 240, boxMode: 'fixed', text: 'Open late on Fridays', style },
    },
    // A long headline in a fixed box that shrinks its words to fit.
    shrink: {
      type: 'text',
      parentId: 'p1',
      index: 'a1',
      name: 'Shrink',
      bindings: heading,
      props: {
        x: 60,
        y: 400,
        width: 460,
        height: 200,
        boxMode: 'fixed',
        shrinkToFit: { min: 12, max: 72 },
        text: 'Cold brew, three ways, every single morning of the week',
        style,
      },
    },
  },
  overrides: { 'format:story': { wide: { style: { ...style, fontSize: 48 } } } },
})

type Text = { props: { width: number; height: number; style: { fontFamily: string } } }
const text = async (page: Page, id: string) => (await read(page)).nodes[id] as unknown as Text
const storyWidth = async (page: Page) =>
  ((await read(page)).overrides['format:story']?.wide as { width?: number } | undefined)?.width

/** Whether the export draws anything but the white page under a box, over its columns, before the next layer. */
const inkBelow = (page: Page, box: { x: number; y: number; width: number; height: number }) =>
  page.evaluate((box) => {
    const pixels = window.dazbee?.exportPixels()
    if (!pixels) throw new Error('no export')
    for (let y = Math.ceil(box.y + box.height) + 2; y < Math.min(1080, box.y + box.height + 80); y++) {
      for (let x = Math.round(box.x); x < Math.round(box.x + box.width); x++) {
        const at = (y * 1080 + x) * 4
        if ((pixels[at] ?? 255) < 200) return true
      }
    }
    return false
  }, box)

/** Whether the export draws anything but the white page in a column band right of a box, over its rows. */
const inkRightOf = (page: Page, box: { x: number; y: number; width: number; height: number }) =>
  page.evaluate((box) => {
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

test.beforeAll(() => {
  importGoogleFonts(['Playfair Display'])
})

test('a brand kit font change refits the text bound to it in every format, and undo leaves the refit', async ({
  browser,
}) => {
  const brandId = await newBrand('e2e brand-font-refit')
  await putKit(brandId, { fonts: [{ token: 'heading', name: 'Heading', family: 'Noto Sans' }] })
  const { page, errors } = await openStage(browser, design(), { brandId })
  const before = {
    wide: (await text(page, 'wide')).props.width,
    story: await storyWidth(page),
    tall: (await text(page, 'tall')).props.height,
  }

  // Change the kit's Heading font in the Brand panel.
  await page.locator('[data-panel="brand"]').click()
  const kit = page.getByTestId('brand-kit')
  await kit.getByRole('button', { name: 'Edit', exact: true }).click()
  await kit.getByRole('combobox', { name: 'Family of Heading' }).click()
  await page.locator('[role="listbox"] [role="option"][data-value="Playfair Display"]').click()

  // Both bound texts take the family; the wide box fits its words again, in the square and the story.
  await expect
    .poll(async () => (await text(page, 'wide')).props.style.fontFamily, { timeout: 20_000 })
    .toBe('Playfair Display')
  expect((await text(page, 'shrink')).props.style.fontFamily).toBe('Playfair Display')
  await expect.poll(async () => (await text(page, 'tall')).props.style.fontFamily).toBe('Playfair Display')
  const after = {
    wide: (await text(page, 'wide')).props.width,
    story: await storyWidth(page),
    tall: (await text(page, 'tall')).props.height,
  }
  // The box that grows down fits its new lines; the fixed box keeps its size.
  expect(after.tall).not.toBe(before.tall)
  expect((await text(page, 'fixed')).props).toMatchObject({
    width: 400,
    height: 240,
    style: { fontFamily: 'Playfair Display' },
  })
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
  expect(await inkBelow(page, { x: 60, y: 400, width: 460, height: 200 })).toBe(false)
  const tall = (await text(page, 'tall')).props
  expect(await inkBelow(page, { x: 720, y: 100, width: 320, height: tall.height })).toBe(false)
  writeOutput('brand-font-refit.png', await page.screenshot())

  // Undo leaves the refit: the box stays fitted to the family the kit still draws.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await page.evaluate(() => window.dazbee?.drawn())
  expect((await text(page, 'wide')).props.style.fontFamily).toBe('Playfair Display')
  expect((await text(page, 'wide')).props.width).toBe(after.wide)
  expect(await storyWidth(page)).toBe(after.story)
  expect(errors).toEqual([])
})
