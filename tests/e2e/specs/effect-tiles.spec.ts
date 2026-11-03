// The Effects panel's tiles (#288) preview each effect on a sample of the selection's kind, never
// the layer itself: "Ag" for text, the photo for a photo, a rounded shape for every other kind. A
// tile adds its effect and takes every effect of its type off again, None takes them all off, and
// Add another adds a second effect of a type; each is one undo step.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { photo, upload } from '../support/assets.ts'
import { writeOutput } from '../support/editor.ts'
import { barMenu, openStage } from '../support/stage.ts'
import { choose } from '../support/select.ts'

test.describe.configure({ timeout: 120_000 })

type Node = DesignInput['nodes'][string]
const shape = (name: string, index: string, parentId: string, x: number, y: number, kind: string, color: string, extra: Record<string, unknown> = {}): Node =>
  ({ type: 'graphic', parentId, index, name, props: { x, y, width: 260, height: 260, shape: { kind, ...extra }, fills: [{ type: 'solid', color }] } }) as Node

const design = (assetId: string): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Effect tiles', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFF8F0FF' }] } },
  nodes: {
    star: shape('Star', 'a0', 'p1', 120, 120, 'star', '#FF2E7EFF', { points: 5 }),
    photo: { type: 'graphic', parentId: 'p1', index: 'a1', name: 'Photo', props: { x: 640, y: 120, width: 320, height: 260, shape: { kind: 'rect', cornerRadius: 24 }, fills: [{ type: 'image', assetId, fit: 'fill' }] } },
    headline: { type: 'text', parentId: 'p1', index: 'a2', name: 'Headline', props: { x: 120, y: 520, width: 400, height: 80, text: 'Run lighter', boxMode: 'autoWidth', style: { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 800, color: '#2F6BFFFF' } } },
    pair: { type: 'group', parentId: 'p1', index: 'a3', name: 'Pair', props: { x: 600, y: 600, width: 400, height: 260 } },
    left: shape('Left', 'a0', 'pair', 600, 600, 'ellipse', '#00A88AFF'),
    right: shape('Right', 'a1', 'pair', 740, 600, 'rect', '#FFB020FF'),
    card: { type: 'frame', parentId: 'p1', index: 'a4', name: 'Card', props: { x: 120, y: 760, width: 300, height: 200, fills: [{ type: 'solid', color: '#14213DFF' }] } },
  },
  overrides: {},
})

const select = async (page: Page, ids: string[]) => {
  await page.evaluate((ids) => window.dazbee?.select(ids), ids)
  await expect(page.getByTestId('top-bar')).toHaveAttribute('data-selection', ids.join(' '))
}
const panel = (page: Page) => barMenu(page, 'effects')
const tiles = async (page: Page) => (await panel(page)).locator('[data-tile]')
const tile = async (page: Page, name: string) => (await panel(page)).locator(`[data-tile="${name}"]`)
const effectsOf = (page: Page, id: string) => page.evaluate((id) => (window.dazbee?.design().nodes[id]?.props as { effects?: { type: string }[] }).effects?.map((e) => e.type) ?? [], id)
const undo = (page: Page) => page.evaluate(() => window.dazbee?.perform('undo'))

test('each kind previews the effects on its own sample, never on the layer', async ({ browser }) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))

  // A shape: a rounded shape on every tile, six of them, no picture of the star.
  await select(page, ['star'])
  await expect(await tiles(page)).toHaveText(['None', 'Drop shadow', 'Inner shadow', 'Glow', 'Layer blur', 'Background blur'])
  await expect((await tiles(page)).locator('img')).toHaveCount(0)
  writeOutput('effect-tiles-1-shape.png', await (await panel(page)).screenshot())

  // A photo: the photo on every tile.
  await select(page, ['photo'])
  await expect((await tiles(page)).locator('img')).toHaveCount(6)
  expect(await (await tile(page, 'glow')).locator('img').getAttribute('src')).toContain(`/assets/${asset.id}/thumbnail`)
  writeOutput('effect-tiles-2-photo.png', await (await panel(page)).screenshot())

  // A group and a box: the rounded shape, as for a shape.
  for (const ids of [['pair'], ['card'], ['star', 'card']]) {
    await select(page, ids)
    await expect(await tiles(page)).toHaveCount(6)
    await expect((await tiles(page)).locator('img')).toHaveCount(0)
    await expect(await tiles(page)).not.toContainText(['Ag'])
  }

  // Text: "Ag", with an Outline tile of its own.
  await select(page, ['headline'])
  await expect(await tiles(page)).toHaveText(['AgNone', 'AgDrop shadow', 'AgInner shadow', 'AgGlow', 'AgOutline', 'AgLayer blur', 'AgBackground blur'])
  writeOutput('effect-tiles-3-text.png', await (await panel(page)).screenshot())
  expect(errors).toEqual([])
})

test('a tile adds its effect and takes it off, None takes them all off, and Add another adds a second', async ({ browser }) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await select(page, ['star'])
  const advanced = async () => (await panel(page)).getByTestId('effects-card')
  await expect((await advanced()).getByRole('heading')).toHaveText('Advanced')
  await expect(await advanced()).toContainText('Pick one or more effects above')

  await (await tile(page, 'dropShadow')).click()
  await expect(await tile(page, 'dropShadow')).toHaveAttribute('aria-pressed', 'true')
  await expect(await tile(page, 'none')).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => effectsOf(page, 'star')).toEqual(['dropShadow'])
  // Its numbers show under Advanced, with its own remove button.
  await expect((await advanced()).locator('[data-item="effects-0"]')).toContainText('Drop shadow')
  await expect((await advanced()).getByRole('spinbutton', { name: 'Drop shadow 1 Blur' })).toHaveValue('24')

  await (await tile(page, 'innerShadow')).click()
  await expect.poll(() => effectsOf(page, 'star')).toEqual(['dropShadow', 'innerShadow'])
  // Add another: a second drop shadow.
  await choose((await advanced()).getByRole('combobox', { name: 'Add another' }), 'dropShadow')
  await expect.poll(() => effectsOf(page, 'star')).toEqual(['dropShadow', 'innerShadow', 'dropShadow'])
  // The tile takes every drop shadow off, in one undo step.
  await (await tile(page, 'dropShadow')).click()
  await expect.poll(() => effectsOf(page, 'star')).toEqual(['innerShadow'])
  await undo(page)
  await expect.poll(() => effectsOf(page, 'star')).toEqual(['dropShadow', 'innerShadow', 'dropShadow'])
  // None takes every effect off.
  await (await tile(page, 'none')).click()
  await expect.poll(() => effectsOf(page, 'star')).toEqual([])
  await expect(await tile(page, 'none')).toHaveAttribute('aria-pressed', 'true')

  // Text's Outline tile outlines the letters, with its width and colour under Advanced.
  await select(page, ['headline'])
  await (await tile(page, 'outline')).click()
  await expect.poll(() => page.evaluate(() => (window.dazbee?.design().nodes.headline?.props as { style: { outline?: { width: number } } }).style.outline?.width)).toBe(2)
  await expect((await advanced()).getByRole('spinbutton', { name: 'Outline width' })).toHaveValue('2')
  await (await tile(page, 'none')).click()
  await expect.poll(() => page.evaluate(() => (window.dazbee?.design().nodes.headline?.props as { style: { outline?: unknown } }).style.outline)).toBeUndefined()
  expect(errors).toEqual([])
})
