// SVG files as layers (#225) in Chromium, with real input: an SVG uploaded to the library places as
// a group of path layers in one undo step, says what it left out, and one of its shapes takes a new
// colour like any other layer; SVG markup pasted on the stage places the same way; an SVG set as
// the brand logo places from the Brand panel as layers too.
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { screenPoint, writeOutput } from '../support/editor.ts'
import { DEV_BRAND, getKit, newBrand } from '../support/seed.ts'
import { fillList, openStage, press, read, selection, type Design } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

const run = randomUUID().slice(0, 8)
const design: DesignInput = {
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'SVG layers', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFF8F0FF' }] } },
  nodes: {},
  overrides: {},
}
/** A logo as a design tool writes one: a gradient badge, a dot and a bar, and a blurred shadow no layer can show. */
const logo = (tag: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
  <!-- ${run} ${tag} -->
  <defs>
    <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#FF4D8D"/><stop offset="1" stop-color="#6B4DFF"/></linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>
  <rect id="Shadow" x="16" y="16" width="180" height="180" rx="40" fill="#000" opacity="0.2" filter="url(#blur)"/>
  <rect id="Badge" x="10" y="10" width="180" height="180" rx="40" fill="url(#g)"/>
  <circle id="Dot" cx="100" cy="100" r="40" fill="#FFD166"/>
  <path id="Bar" d="M210 40h80v120h-80z" fill="#073B4C"/>
</svg>`

type Node = Design['nodes'][string] & { type: string; name: string }
const nodes = async (page: Page) => Object.entries((await read(page)).nodes) as [string, Node][]
const named = async (page: Page, name: string) => (await nodes(page)).find(([, n]) => n.name === name)
const fillColor = async (page: Page, name: string) => ((await named(page, name))?.[1].props.fills as { color?: string }[] | undefined)?.[0]?.color

/** Checks the placed logo: one group on the page holding the four shapes as path layers, the badge keeping its gradient. */
async function expectPlacedLogo(page: Page, groupName: string) {
  const all = await nodes(page)
  const group = all.find(([, n]) => n.type === 'group' && n.name === groupName)
  expect(group?.[1].parentId).toBe('p1')
  const shapes = all.filter(([, n]) => n.parentId === group?.[0])
  expect(shapes.map(([, n]) => n.name)).toEqual(expect.arrayContaining(['Shadow', 'Badge', 'Dot', 'Bar']))
  for (const [, n] of shapes) expect(n.props.shape).toMatchObject({ kind: 'path' })
  expect((await named(page, 'Badge'))?.[1].props.fills).toMatchObject([{ type: 'linear' }])
  return group?.[0] as string
}

test('an SVG uploaded to the library places as layers in one step, and a shape in it takes a new colour', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  await page.locator('[data-panel="assets"]').click()
  const library = page.getByTestId('asset-library')
  const name = `Logo ${run}`
  await library.locator('input[type="file"]').setInputFiles({ name: `${name}.svg`, mimeType: 'image/svg+xml', buffer: Buffer.from(logo('library')) })
  const tile = library.locator('li[data-asset]').filter({ hasText: name })
  await expect(tile).toHaveCount(1, { timeout: 20_000 })
  // The tile shows the file drawn by the server, as layers.
  await expect(tile.locator('img')).toHaveJSProperty('complete', true)
  writeOutput('svg-layers-1-library.png', await page.screenshot())
  // Its original comes back as text the browser neither runs nor draws.
  const served = await page.request.get(`${new URL(page.url()).origin}/brands/${DEV_BRAND}/assets/${await tile.getAttribute('data-asset')}`)
  expect(served.headers()).toMatchObject({ 'content-type': 'text/plain; charset=utf-8', 'content-security-policy': "default-src 'none'; sandbox", 'x-content-type-options': 'nosniff' })
  expect(await served.text()).toContain('<svg')

  await tile.getByRole('button', { name: `Place ${name} on the design` }).click()
  await expect.poll(async () => (await nodes(page)).length).toBe(5)
  const groupId = await expectPlacedLogo(page, name)
  expect(await selection(page)).toEqual([groupId])
  // The blur is named as left out.
  await expect(page.getByRole('status').filter({ hasText: 'Left out, since no layer can show them: filters.' })).toBeVisible()
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('svg-layers-2-placed.png', await page.screenshot())

  // The dot is a layer of its own: a double-click goes into the group and picks it.
  const [dotId, dot] = await named(page, 'Dot') as [string, Node]
  const { x, y, width, height } = dot.props as { x: number; y: number; width: number; height: number }
  const at = await screenPoint(page, x + width / 2, y + height / 2)
  await page.mouse.dblclick(at.x, at.y)
  await expect.poll(() => selection(page)).toEqual([dotId])
  const list = await fillList(page)
  await list.locator('[data-row="1"]').getByTestId('paint-swatch').click()
  const hex = page.getByTestId('paint-editor').getByRole('textbox', { name: 'Colour hex' })
  await hex.fill('2EC4B6')
  await hex.press('Enter')
  await expect.poll(() => fillColor(page, 'Dot')).toBe('#2EC4B6FF')
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('svg-layers-3-recoloured.png', await page.screenshot())

  // One undo takes the colour back; the next takes the whole logo away.
  await page.mouse.click(5, 500)
  await press(page, 'undo')
  await expect.poll(() => fillColor(page, 'Dot')).toBe('#FFD166FF')
  await press(page, 'undo')
  await expect.poll(async () => (await nodes(page)).length).toBe(0)
  expect(errors).toEqual([])
})

test('SVG markup pasted on the stage places as layers', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate((text) => navigator.clipboard.writeText(text), logo('paste'))
  const middle = await screenPoint(page, 540, 540)
  await page.mouse.click(middle.x, middle.y)
  await page.keyboard.press('Control+v')
  await expect.poll(async () => (await nodes(page)).length).toBe(5)
  await expectPlacedLogo(page, 'SVG')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('svg-layers-4-pasted.png', await page.screenshot())
  expect(errors).toEqual([])
})

test('an SVG set as the brand logo places from the Brand panel as layers', async ({ browser }) => {
  const brandId = await newBrand('e2e svg-layers')
  const { page, errors } = await openStage(browser, design, { brandId })
  await page.locator('[data-panel="brand"]').click()
  const kit = page.getByTestId('brand-kit')
  await kit.getByRole('button', { name: 'Edit' }).click()
  await kit.locator('input[name="logo-file"]').setInputFiles({ name: `Brand logo ${run}.svg`, mimeType: 'image/svg+xml', buffer: Buffer.from(logo('kit')) })
  await expect.poll(async () => (await getKit(brandId)).logoAssetId, { timeout: 20_000 }).not.toBeNull()
  await kit.getByRole('button', { name: 'Done' }).click()
  const place = kit.getByTestId('kit-logo-place').first()
  await expect(place.locator('img')).toHaveJSProperty('complete', true)
  writeOutput('svg-layers-5-brand-logo.png', await page.screenshot())
  await place.click()
  await expect.poll(async () => (await nodes(page)).length).toBe(5)
  await expectPlacedLogo(page, `Brand logo ${run}`)
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('svg-layers-6-logo-placed.png', await page.screenshot())
  expect(errors).toEqual([])
})
