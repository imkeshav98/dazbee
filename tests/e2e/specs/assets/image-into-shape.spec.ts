// An image into any shape, with real input: an image dragged from the asset library onto a star
// lights the star and goes into it as its fill, while one dropped on empty space still makes a new
// layer; the Image card's Replace swaps the picture, keeping its filter; a shape's Add image puts a
// picture into a plain rectangle. Each is one undo step; redo brings a placed image back, and it is
// there after a reload. The star's linked copy in the wide frame keeps its own fills throughout.
import type { DesignInput } from '@dazbee/schema'

import { card1, photo, upload } from '../../support/assets.ts'
import { placed, reloads, screenPoint, writeOutput } from '../../support/editor.ts'
import { copyIn, frameDesign, linkedFrames } from '../../support/seed.ts'
import { click, openStage, press, read, selection } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, openCard } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput =>
  linkedFrames(
    frameDesign({
      name: 'Image into a shape',
      fills: [{ type: 'solid', color: '#FFF8F0FF' }],
      nodes: {
        star: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a0',
          name: 'Star',
          props: {
            x: 600,
            y: 120,
            width: 420,
            height: 420,
            shape: { kind: 'star', points: 5 },
            fills: [{ type: 'solid', color: '#FF2E7EFF' }],
          },
        },
        box: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a1',
          name: 'Box',
          props: {
            x: 640,
            y: 640,
            width: 320,
            height: 240,
            shape: { kind: 'rect', cornerRadius: 24 },
            fills: [{ type: 'solid', color: '#2F6BFFFF' }],
          },
        },
      },
    }),
    // The star's copy in the wide frame is green: it keeps its own fills when an image goes into the square's star.
    [
      {
        id: 'wide',
        name: 'Wide',
        width: 1920,
        height: 1080,
        values: { star: { fills: [{ type: 'solid', color: '#00A88AFF' }] } },
      },
    ],
  )

type Fill = { type: string; assetId?: string; fit?: string; filter?: string; crop?: unknown }
/** A layer's fills, which the cards write. */
const fillsOf = async (page: Page, id: string) => (placed(await read(page), id)?.fills ?? []) as Fill[]
/** The fills of the star's copy in the wide frame. */
const wideStarFills = async (page: Page) => fillsOf(page, copyIn('wide', 'star'))
const GREEN = [{ type: 'solid', color: '#00A88AFF' }]

/** Drags an asset library tile to a design pixel of the square with the mouse, the shot taken mid-drag. */
async function dragTile(page: Page, assetId: string, to: { x: number; y: number }, shot?: string) {
  const tile = page.locator(`[data-testid="asset-library"] li[data-asset="${assetId}"] button`).first()
  const from = await tile.boundingBox()
  if (!from) throw new Error('no tile')
  const at = await screenPoint(page, to.x, to.y)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(at.x - 40, at.y - 40, { steps: 8 })
  await page.mouse.move(at.x, at.y, { steps: 4 })
  if (shot) {
    await expect(page.locator('.stage-overlay .drop-target')).toHaveCount(1)
    writeOutput(shot, await page.screenshot({ animations: 'disabled' }))
  }
  await page.mouse.up()
  await page.evaluate(() => window.dazbee?.drawn())
}

test('an image dragged onto a star goes into it, the Image card replaces it, and on empty space it makes a new layer; one undo step each', async ({
  browser,
}) => {
  const sneaker = await upload(photo)
  const other = await upload(card1)
  const { page, errors } = await openStage(browser, design())
  await page.locator('[data-panel="assets"]').click()
  await expect(page.locator(`[data-testid="asset-library"] li[data-asset="${sneaker.id}"]`)).toBeVisible({
    timeout: 30_000,
  })
  const layers = Object.keys((await read(page)).nodes).length

  // Over the star it lights up; dropped, the photo is the star's fill on top of its pink.
  await dragTile(page, sneaker.id, { x: 810, y: 330 }, 'into-shape-1-over-star.png')
  expect(await fillsOf(page, 'star')).toEqual([
    { type: 'solid', color: '#FF2E7EFF' },
    { type: 'image', assetId: sneaker.id, fit: 'fill', opacity: 1 },
  ])
  // The copy in the wide frame keeps its own green and no photo.
  expect(await wideStarFills(page)).toEqual(GREEN)
  expect(Object.keys((await read(page)).nodes)).toHaveLength(layers)
  expect(await selection(page)).toEqual(['star'])
  await expect(page.locator('.stage-overlay .drop-target')).toHaveCount(0)
  writeOutput('into-shape-2-star-photo.png', await page.screenshot({ animations: 'disabled' }))

  // Replace from the bar: the other picture, in the star the drag filled.
  await page.getByTestId('bar-replace').click()
  const picker = page.getByTestId('bar-replace-picker')
  await expect(picker.locator(`li[data-asset="${other.id}"]`)).toBeVisible({ timeout: 30_000 })
  await picker.locator(`li[data-asset="${other.id}"] button`).click()
  await page.evaluate(() => window.dazbee?.drawn())
  expect((await fillsOf(page, 'star')).at(-1)).toMatchObject({ type: 'image', assetId: other.id })
  // Each is one undo step: the first photo, then the star's own pink.
  await press(page, 'undo')
  expect((await fillsOf(page, 'star')).at(-1)).toMatchObject({ type: 'image', assetId: sneaker.id })
  await press(page, 'undo')
  expect(await fillsOf(page, 'star')).toEqual([{ type: 'solid', color: '#FF2E7EFF' }])
  expect(await wideStarFills(page)).toEqual(GREEN)
  // Redo puts the photo into the star again, and only there.
  await press(page, 'redo')
  expect.soft(await fillsOf(page, 'star')).toEqual([
    { type: 'solid', color: '#FF2E7EFF' },
    { type: 'image', assetId: sneaker.id, fit: 'fill', opacity: 1 },
  ])
  expect.soft(await wideStarFills(page)).toEqual(GREEN)
  await press(page, 'undo')
  expect(await fillsOf(page, 'star')).toEqual([{ type: 'solid', color: '#FF2E7EFF' }])

  // On empty space, a new layer as before.
  await dragTile(page, sneaker.id, { x: 800, y: 980 })
  const after = (await read(page)).nodes
  expect(Object.keys(after)).toHaveLength(layers + 1)
  const [made] = await selection(page)
  expect(made).not.toBe('star')
  expect((after[made ?? '']?.props.fills as Fill[])[0]).toMatchObject({ type: 'image', assetId: sneaker.id })
  await press(page, 'undo')
  expect(Object.keys((await read(page)).nodes)).toHaveLength(layers)
  // Redo brings the new layer back, and after a reload it is still there.
  await press(page, 'redo')
  expect((await read(page)).nodes[made ?? '']).toEqual(after[made ?? ''])
  await reloads(page)
  expect(errors).toEqual([])
})

test('the bar replaces the picture, keeping its filter; Add image puts one into a plain shape', async ({ browser }) => {
  const sneaker = await upload(photo)
  const other = await upload(card1)
  const { page, errors } = await openStage(browser, design())
  await page.evaluate(
    (id) => window.dazbee?.fillWithImage('star', { id, name: 'Sneaker', width: 1920, height: 1200 }),
    sneaker.id,
  )
  await page.evaluate(() => window.dazbee?.drawn())

  // Mono, then Replace with another brand image: the new picture, still mono, no old crop.
  const imageCard = async () => await openCard(page, 'adjust-card')
  await expect(await imageCard()).toBeVisible()
  await (await openCard(page, 'look-card')).getByRole('radio', { name: 'Mono' }).click()
  await page.getByTestId('bar-replace').click()
  const picker = page.getByTestId('bar-replace-picker')
  await expect(picker).toBeVisible()
  // One thing open at a time: Replace closes the Edit image panel.
  await expect(page.getByTestId('bar-edit-menu')).toHaveCount(0)
  await expect(picker.locator(`li[data-asset="${other.id}"]`)).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(() =>
      picker
        .locator('img')
        .evaluateAll((imgs) =>
          imgs.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true)
  writeOutput('into-shape-3-replace-picker.png', await page.screenshot({ animations: 'disabled' }))
  await picker.locator(`li[data-asset="${other.id}"] button`).click()
  await expect(picker).toBeHidden()
  await page.evaluate(() => window.dazbee?.drawn())
  const image = (await fillsOf(page, 'star')).find((f) => f.type === 'image')
  expect(image).toMatchObject({ assetId: other.id, fit: 'fill', filter: 'mono' })
  expect(image?.crop).toBeUndefined()
  writeOutput('into-shape-4-replaced.png', await page.screenshot({ animations: 'disabled' }))
  // One undo step puts the first picture back, still mono.
  await press(page, 'undo')
  expect((await fillsOf(page, 'star')).find((f) => f.type === 'image')).toMatchObject({
    assetId: sneaker.id,
    filter: 'mono',
  })

  // The box has no picture: its Colour offers one.
  await click(page, 800, 760)
  expect(await selection(page)).toEqual(['box'])
  await (await barMenu(page, 'colour')).getByTestId('add-image').click()
  const adding = page.getByTestId('add-image-picker')
  await expect(adding.locator(`li[data-asset="${sneaker.id}"]`)).toBeVisible({ timeout: 30_000 })
  await adding.locator(`li[data-asset="${sneaker.id}"] button`).click()
  await page.evaluate(() => window.dazbee?.drawn())
  expect(await fillsOf(page, 'box')).toEqual([
    { type: 'solid', color: '#2F6BFFFF' },
    { type: 'image', assetId: sneaker.id, fit: 'fill', opacity: 1 },
  ])
  await expect(await openCard(page, 'adjust-card')).toBeVisible()
  writeOutput('into-shape-5-added.png', await page.screenshot({ animations: 'disabled' }))
  await press(page, 'undo')
  expect(await fillsOf(page, 'box')).toEqual([{ type: 'solid', color: '#2F6BFFFF' }])
  expect(errors).toEqual([])
})
