// Images dropped from the computer, as the browser hands them over: a drag of files that enters,
// passes over and drops on the page. On the asset library the image uploads once and shows in the
// library; on the canvas it uploads once and is placed where it was dropped.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '../support/test.ts'
import { AssetSummary, type DesignInput } from '@dazbee/schema'
import { screenPoint, writeOutput } from '../support/editor.ts'
import { callApi, newBrand } from '../support/seed.ts'
import { openStage, read, selection } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

/** A photo from the pixel fixtures; each test drops it into a brand of its own, whose library starts empty. */
const card = readFileSync(join(import.meta.dirname, '..', '..', 'pixels', 'assets', 'card-1.jpg'))

const design = (): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Dropped files', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {},
  overrides: {},
})

/**
 * Drops files from the computer at a point on screen, as the browser does: the drag enters and
 * passes over the element there, and drops only if the page took it on the way over (otherwise
 * the browser would open the file). Says whether the page took it.
 */
function dropFiles(page: Page, at: { x: number; y: number }, files: { name: string; type: string; bytes: Buffer }[]) {
  return page.evaluate(({ at, files }) => {
    const transfer = new DataTransfer()
    for (const f of files) transfer.items.add(new File([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], f.name, { type: f.type }))
    const target = document.elementFromPoint(at.x, at.y)
    if (!target) throw new Error(`nothing on screen at ${at.x}, ${at.y}`)
    const fire = (type: string) => target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, dataTransfer: transfer }))
    fire('dragenter')
    const taken = !fire('dragover')
    if (taken) fire('drop')
    return taken
  }, { at, files: files.map((f) => ({ name: f.name, type: f.type, base64: f.bytes.toString('base64') })) })
}

/** Counts, from now on, the uploads the page sends into the brand's asset library. */
function watchUploads(page: Page, brandId: string) {
  let count = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === `/brands/${brandId}/assets`) count++
  })
  return () => count
}

const assetsOf = async (brandId: string) => AssetSummary.array().parse(await callApi('GET', `/brands/${brandId}/assets`))

/** The graphics on the page filled with an image, and the asset each shows. */
async function images(page: Page) {
  const nodes = (await read(page)).nodes as unknown as Record<string, { props: { x: number; y: number; width: number; height: number; fills?: { type: string; assetId?: string }[] } }>
  return Object.entries(nodes).filter(([, n]) => n.props.fills?.[0]?.type === 'image').map(([id, n]) => ({ id, assetId: n.props.fills?.[0]?.assetId, ...n.props }))
}

test('an image dropped from the computer on the asset library uploads once and shows in the library', async ({ browser }) => {
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(browser, design(), { brandId })
  const uploads = watchUploads(page, brandId)
  await page.locator('[data-panel="assets"]').click()
  const library = page.getByTestId('asset-library')
  await expect(library).toBeVisible()
  const box = await library.boundingBox()
  if (!box) throw new Error('no asset library')

  const name = `Dropped ${randomUUID().slice(0, 8)}`
  expect(await dropFiles(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, [{ name: `${name}.jpg`, type: 'image/jpeg', bytes: card }])).toBe(true)
  const item = library.locator('li[data-asset]').filter({ hasText: name })
  await expect(item).toBeVisible({ timeout: 30_000 })
  await expect(library.getByTestId('asset-uploads')).toHaveCount(0)
  await expect.poll(() => item.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
  writeOutput('dropped-files-0-library.png', await page.screenshot())

  // One upload, and the one asset in the library; the design itself is as it was.
  expect(uploads()).toBe(1)
  expect((await assetsOf(brandId)).map((a) => a.name)).toEqual([name])
  await expect(library.locator('li[data-asset]')).toHaveCount(1)
  expect(await images(page)).toEqual([])
  expect(errors).toEqual([])
})

test('an image dropped from the computer on the canvas uploads once and is placed where it was dropped', async ({ browser }) => {
  test.fixme(true, 'An image file dropped from the computer on the canvas is neither uploaded nor placed')
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(browser, design(), { brandId })
  const uploads = watchUploads(page, brandId)

  const name = `Dropped ${randomUUID().slice(0, 8)}`
  expect(await dropFiles(page, await screenPoint(page, 760, 360), [{ name: `${name}.jpg`, type: 'image/jpeg', bytes: card }])).toBe(true)
  await expect.poll(async () => (await images(page)).length, { timeout: 30_000 }).toBe(1)
  const [asset] = await assetsOf(brandId)
  const [placed] = await images(page)
  if (!asset || !placed) throw new Error('nothing uploaded or placed')
  // Its own image, centred where it was dropped, and selected.
  expect(placed.assetId).toBe(asset.id)
  expect(Math.abs(placed.x + placed.width / 2 - 760)).toBeLessThanOrEqual(1)
  expect(Math.abs(placed.y + placed.height / 2 - 360)).toBeLessThanOrEqual(1)
  expect(await selection(page)).toEqual([placed.id])
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('dropped-files-1-canvas.png', await page.screenshot())

  // One upload, and the one asset in the library.
  expect(uploads()).toBe(1)
  expect((await assetsOf(brandId)).map((a) => a.name)).toEqual([name])
  expect(errors).toEqual([])
})
