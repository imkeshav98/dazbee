// The Effects card's tiles preview each effect on the selected layer: a star shows the star, a photo
// the photo, a group a render of itself, text its Aa in its own colour, and several layers Aa. The
// pictures are drawn by the editor's renderer, follow a fill change, and dragging with the card
// open stays within a frame.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { photo, upload } from '../support/assets.ts'
import { writeOutput } from '../support/editor.ts'
import { click, openStage } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

type Node = DesignInput['nodes'][string]
const shape = (name: string, index: string, parentId: string, x: number, y: number, kind: string, color: string, extra: Record<string, unknown> = {}): Node =>
  ({ type: 'graphic', parentId, index, name, props: { x, y, width: 260, height: 260, shape: { kind, ...extra }, fills: [{ type: 'solid', color }] } }) as Node

const design = (assetId: string): DesignInput => ({
  meta: { schemaVersion: 3, designId: 'replaced-by-the-api', name: 'Effect tiles', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFF8F0FF' }] } },
  nodes: {
    star: shape('Star', 'a0', 'p1', 120, 120, 'star', '#FF2E7EFF', { points: 5 }),
    photo: { type: 'graphic', parentId: 'p1', index: 'a1', name: 'Photo', props: { x: 640, y: 120, width: 320, height: 260, shape: { kind: 'rect', cornerRadius: 24 }, fills: [{ type: 'image', assetId, fit: 'fill' }] } },
    headline: { type: 'text', parentId: 'p1', index: 'a2', name: 'Headline', props: { x: 120, y: 520, width: 400, height: 80, text: 'Run lighter', boxMode: 'autoWidth', style: { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 800, color: '#2F6BFFFF' } } },
    pair: { type: 'group', parentId: 'p1', index: 'a3', name: 'Pair', props: { x: 600, y: 600, width: 400, height: 260 } },
    left: shape('Left', 'a0', 'pair', 600, 600, 'ellipse', '#00A88AFF'),
    right: { ...shape('Right', 'a1', 'pair', 740, 600, 'rect', '#FFB020FF'), props: { ...shape('Right', 'a1', 'pair', 740, 600, 'rect', '#FFB020FF').props, width: 260 } } as Node,
  },
  overrides: {},
})

const tiles = (page: Page) => page.getByTestId('effects-card').locator('[data-tile]')
/** The colour at the middle of the None tile's picture, read from the picture itself. */
const middleOf = (page: Page) => page.getByTestId('effects-card').locator('[data-tile="none"] img').evaluate(async (img: HTMLImageElement) => {
  await img.decode()
  const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight)
  const context = canvas.getContext('2d')
  context?.drawImage(img, 0, 0)
  return [...(context?.getImageData(Math.floor(img.naturalWidth / 2), Math.floor(img.naturalHeight / 2), 1, 1).data ?? [])]
})

test('each layer previews the effects on itself; a fill change follows; several layers show Aa', async ({ browser }) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))

  // A star: every tile shows the pink star, drawn by the renderer.
  await click(page, 250, 260)
  await expect(tiles(page).locator('img[data-thumbnail]')).toHaveCount(4)
  expect((await middleOf(page)).slice(0, 3)).toEqual([255, 46, 126])
  writeOutput('effect-tiles-1-star.png', await page.getByTestId('effects-card').screenshot())
  const starSrc = await tiles(page).first().locator('img').getAttribute('src')

  // A fill change redraws them, once the change settles.
  const fill = page.getByTestId('fill-card')
  await fill.locator('[data-fold]').click()
  await fill.getByRole('textbox', { name: 'Colour 1 hex' }).fill('2F6BFF')
  await fill.getByRole('textbox', { name: 'Colour 1 hex' }).press('Enter')
  await expect.poll(async () => (await middleOf(page)).slice(0, 3)).toEqual([47, 107, 255])
  expect(await tiles(page).first().locator('img').getAttribute('src')).not.toBe(starSrc)

  // A photo shows the photo.
  await click(page, 800, 250)
  await expect.poll(async () => (await middleOf(page)).slice(0, 3)).not.toEqual([47, 107, 255])
  await expect(tiles(page).locator('img[data-thumbnail]')).toHaveCount(4)
  writeOutput('effect-tiles-2-photo.png', await page.getByTestId('effects-card').screenshot())
  const photoSrc = await tiles(page).first().locator('img').getAttribute('src')

  // A group shows a render of itself: its two shapes.
  await click(page, 680, 730)
  await expect(tiles(page).locator('img[data-thumbnail]')).toHaveCount(4)
  expect(await tiles(page).first().locator('img').getAttribute('src')).not.toBe(photoSrc)
  expect((await middleOf(page))[3]).toBeGreaterThan(0)
  writeOutput('effect-tiles-3-group.png', await page.getByTestId('effects-card').screenshot())

  // Text keeps Aa, in its own colour.
  await click(page, 200, 560)
  await expect(tiles(page).locator('img')).toHaveCount(0)
  await expect(tiles(page).first().locator('span[aria-hidden]')).toHaveCSS('color', 'rgb(47, 107, 255)')
  writeOutput('effect-tiles-4-text.png', await page.getByTestId('effects-card').screenshot())

  // Several layers: Aa as before.
  await click(page, 250, 260, ['Shift'])
  await expect(tiles(page).locator('img')).toHaveCount(0)
  await expect(tiles(page).first()).toContainText('Aa')
  expect(errors).toEqual([])
})

test('dragging a layer with its tiles showing stays within a frame, and redraws the tiles once it stops', async ({ browser }) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await click(page, 250, 260)
  await expect(tiles(page).locator('img[data-thumbnail]')).toHaveCount(4)
  // Every picture the None tile shows, as it changes.
  await page.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { seen: string[] }).seen = seen
    const img = document.querySelector('[data-testid="effects-card"] [data-tile="none"] img')
    if (img) new MutationObserver(() => seen.push(img.getAttribute('src') ?? '')).observe(img, { attributes: true, attributeFilter: ['src'] })
  })
  const budget = await page.evaluate(async () => {
    const editor = window.dazbee
    if (!editor) throw new Error('no editor')
    const next = () => new Promise<number>((resolve) => {
      const stop = editor.onDraw((_d, _at, info) => {
        stop()
        resolve(info.ms)
      })
    })
    const times: number[] = []
    const end = editor.session.beginGesture()
    for (let i = 0; i < 65; i++) {
      const drawn = next()
      editor.session.run('node.update', { ids: ['star'], scope: 'format:sq', patch: { x: 120 + i * 3, y: 120 + i } })
      times.push(await drawn)
    }
    end()
    const sorted = times.slice(5).sort((a, b) => a - b)
    return { median: sorted[Math.floor(sorted.length / 2)] ?? 0, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0 }
  })
  console.log('drag with the effect tiles showing', JSON.stringify(budget))
  writeOutput('effect-tiles-budget.json', JSON.stringify(budget, null, 2))
  expect(budget.median).toBeLessThanOrEqual(16.7)
  expect(budget.p95).toBeLessThanOrEqual(50)
  // The tiles drew the star again once, after the drag, not on every step of it.
  await expect.poll(() => page.evaluate(() => (window as unknown as { seen: string[] }).seen.length), { timeout: 5_000 }).toBe(1)
  expect(errors).toEqual([])
})
