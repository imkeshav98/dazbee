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
import { openStage, props, read, selection } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

/** A photo from the pixel fixtures; each test drops it into a brand of its own, whose library starts empty. */
const card = readFileSync(join(import.meta.dirname, '..', '..', 'pixels', 'assets', 'card-1.jpg'))

const second = readFileSync(join(import.meta.dirname, '..', '..', 'pixels', 'assets', 'card-2.jpg'))
const third = readFileSync(join(import.meta.dirname, '..', '..', 'pixels', 'assets', 'card-3.jpg'))
const notes = Buffer.from('Not a picture.\n')

const svgBadge = readFileSync(join(import.meta.dirname, '..', '..', 'pixels', 'assets', 'svg', 'figma-badge.svg'))

/** A square design with one white page, and any more formats and pages given. */
const design = (nodes: DesignInput['nodes'] = {}, more: Partial<Pick<DesignInput, 'formats' | 'pages'>> = {}): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Dropped files', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' }, ...more.formats },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] }, ...more.pages },
  nodes,
  overrides: {},
})

/** A frame with a solid fill, 100 in from the page's top and left, 400 square. */
const box: DesignInput['nodes'][string] = { type: 'frame', parentId: 'p1', index: 'a0', name: 'Box', props: { x: 100, y: 100, width: 400, height: 400, fills: [{ type: 'solid', color: '#2F6BFFFF' }] } }

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

/** Fires only the start of a drag of files over a point: it enters and passes over, without dropping. */
function dragFilesOver(page: Page, at: { x: number; y: number }, files: { name: string; type: string }[]) {
  return page.evaluate(({ at, files }) => {
    const transfer = new DataTransfer()
    for (const f of files) transfer.items.add(new File(['x'], f.name, { type: f.type }))
    const target = document.elementFromPoint(at.x, at.y)
    for (const type of ['dragenter', 'dragover']) target?.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, dataTransfer: transfer }))
  }, { at, files })
}

/**
 * Holds every upload into the brand's library until the returned function is called; uploads of
 * files whose names start with `fail-` are answered with an error instead.
 */
async function routeUploads(page: Page, brandId: string, { hold = false } = {}) {
  let release = () => {}
  const held = hold ? new Promise<void>((resolve) => { release = resolve }) : Promise.resolve()
  await page.route((url) => url.pathname === `/brands/${brandId}/assets`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    if (/filename="fail-/.test(route.request().postDataBuffer()?.toString('latin1') ?? '')) return route.fulfill({ status: 500, json: { error: 'Storage is down' } })
    await held
    return route.continue()
  })
  return release
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
  const nodes = (await read(page)).nodes as unknown as Record<string, { parentId: string; props: { x: number; y: number; width: number; height: number; fills?: { type: string; assetId?: string }[] } }>
  return Object.entries(nodes).filter(([, n]) => n.props.fills?.[0]?.type === 'image').map(([id, n]) => ({ id, parentId: n.parentId, assetId: n.props.fills?.[0]?.assetId, ...n.props }))
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

test('several images dropped on the canvas upload once each and go on cascading from the drop point, in one undo step', async ({ browser }) => {
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(browser, design(), { brandId })
  const uploads = watchUploads(page, brandId)

  const names = [`Dropped ${randomUUID().slice(0, 8)}`, `Dropped ${randomUUID().slice(0, 8)}`]
  const files = [{ name: `${names[0]}.jpg`, type: 'image/jpeg', bytes: card }, { name: `${names[1]}.jpg`, type: 'image/jpeg', bytes: second }]
  expect(await dropFiles(page, await screenPoint(page, 540, 540), files)).toBe(true)
  await expect.poll(async () => (await images(page)).length, { timeout: 30_000 }).toBe(2)
  const assets = await assetsOf(brandId)
  const placed = await images(page)
  // Each shows its own upload; the first is centred on the drop point and the next a step lower and to the right.
  expect(placed.map((p) => p.assetId).sort()).toEqual(assets.map((a) => a.id).sort())
  const centres = placed.map((p) => ({ x: p.x + p.width / 2, y: p.y + p.height / 2 })).sort((a, b) => a.x - b.x)
  const step = 24 / (await page.evaluate(() => window.dazbee?.camera().zoom ?? 1))
  expect(Math.abs((centres[0]?.x ?? 0) - 540)).toBeLessThanOrEqual(1)
  expect(Math.abs((centres[0]?.y ?? 0) - 540)).toBeLessThanOrEqual(1)
  expect(Math.abs((centres[1]?.x ?? 0) - 540 - step)).toBeLessThanOrEqual(1)
  expect(Math.abs((centres[1]?.y ?? 0) - 540 - step)).toBeLessThanOrEqual(1)
  expect((await selection(page)).sort()).toEqual(placed.map((p) => p.id).sort())
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('dropped-files-2-several.png', await page.screenshot())
  expect(uploads()).toBe(2)
  expect(assets.map((a) => a.name).sort()).toEqual([...names].sort())

  // One undo takes both away, and one redo puts both back.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await images(page)).toEqual([])
  await page.evaluate(() => window.dazbee?.perform('redo'))
  expect((await images(page)).map((p) => p.id).sort()).toEqual(placed.map((p) => p.id).sort())
  expect(errors).toEqual([])
})

test('an image dropped with a text file on a frame in the second format lights the frame, fills it and selects it in that format, as one undo step', async ({ browser }) => {
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(browser, design({ box }, { formats: { wide: { name: 'Wide', width: 1920, height: 1080, order: 'a1' } } }), { brandId })
  // Both formats in view, clear of the cards on the right.
  await page.evaluate(() => window.dazbee?.setCamera({ x: 40, y: 80, zoom: 0.35 }))
  await page.evaluate(() => window.dazbee?.drawn())
  const uploads = watchUploads(page, brandId)

  const name = `Dropped ${randomUUID().slice(0, 8)}`
  const files = [{ name: `${name}.jpg`, type: 'image/jpeg', bytes: card }, { name: 'notes.txt', type: 'text/plain', bytes: notes }]
  const at = await screenPoint(page, 300, 300, { pageId: 'p1', formatId: 'wide' })
  // The text file will be left out, so the one image lights the frame it would fill.
  await dragFilesOver(page, at, files)
  await expect(page.locator('.stage-overlay .drop-target')).toHaveCount(1)
  expect(await dropFiles(page, at, files)).toBe(true)
  await expect(page.locator('.stage-overlay .drop-target')).toHaveCount(0)
  const fills = async () => ((await read(page)).nodes as unknown as Record<string, { props: { fills: { type: string; assetId?: string }[] } }>).box?.props.fills
  // The image goes on top of the frame's colour.
  await expect.poll(async () => (await fills())?.map((f) => f.type), { timeout: 30_000 }).toEqual(['solid', 'image'])
  const [asset] = await assetsOf(brandId)
  expect((await fills())?.[1]?.assetId).toBe(asset?.id)
  // No new layer: the frame took the image, and it is selected where it was dropped.
  expect(Object.keys((await read(page)).nodes)).toEqual(['box'])
  expect(await selection(page)).toEqual(['box'])
  expect(await page.evaluate(() => window.dazbee?.selectedFrame())).toBe('p1/wide')
  await expect(page.getByTestId('notice-toast')).toContainText('notes.txt')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('dropped-files-3-frame.png', await page.screenshot())
  expect(uploads()).toBe(1)

  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await fills()).toEqual([{ type: 'solid', color: '#2F6BFFFF' }])
  expect(errors).toEqual([])
})

test('a file that is not an image is left out with a notice, while the image dropped with it goes on, at every screen size', async ({ browser }) => {
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(browser, design(), { brandId })
  const uploads = watchUploads(page, brandId)

  // A photo of its own at each size: the library keeps one asset for the same bytes.
  let count = 0
  for (const [size, bytes] of [[{ width: 1280, height: 760 }, card], [{ width: 820, height: 1180 }, second], [{ width: 390, height: 844 }, third]] as const) {
    await page.setViewportSize(size)
    await page.evaluate(() => window.dazbee?.fitAll())
    await page.evaluate(() => window.dazbee?.drawn())
    const name = `Dropped ${randomUUID().slice(0, 8)}`
    const files = [{ name: `${name}.jpg`, type: 'image/jpeg', bytes }, { name: 'notes.txt', type: 'text/plain', bytes: notes }]
    expect(await dropFiles(page, await screenPoint(page, 540, 540), files)).toBe(true)
    await expect(page.getByTestId('notice-toast')).toContainText('notes.txt')
    count++
    await expect.poll(async () => (await images(page)).length, { timeout: 30_000 }).toBe(1)
    await page.evaluate(() => window.dazbee?.drawn())
    writeOutput(`dropped-files-4-left-out-${size.width}x${size.height}.png`, await page.screenshot())
    // The page starts empty again for the next size, so the next image isn't dropped onto this one.
    await page.evaluate(() => window.dazbee?.perform('undo'))
    expect(await images(page)).toEqual([])
  }

  // Only the images were sent; the text file never left the page.
  expect(uploads()).toBe(count)
  expect((await assetsOf(brandId)).length).toBe(count)

  // A drop of only a text file still takes the drag, so the browser doesn't open the file, and places nothing.
  expect(await dropFiles(page, await screenPoint(page, 540, 540), [{ name: 'other.txt', type: 'text/plain', bytes: notes }])).toBe(true)
  await expect(page.getByTestId('notice-toast')).toContainText('other.txt')
  expect(uploads()).toBe(count)
  expect(await images(page)).toEqual([])
  expect(errors).toEqual([])
})

test('images dropped on the second page at another zoom go where they were dropped though the view moves while they upload, and the notice stays until they are up', async ({ browser }) => {
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(browser, design({}, { pages: { p2: { name: 'Page 2', order: 'a1', fills: [{ type: 'solid', color: '#FFF8F0FF' }] } } }), { brandId })
  await page.evaluate(() => window.dazbee?.setCamera({ x: 60, y: 60, zoom: 0.4 }))
  await page.evaluate(() => window.dazbee?.drawn())
  const release = await routeUploads(page, brandId, { hold: true })

  const names = [`Dropped ${randomUUID().slice(0, 8)}`, `Dropped ${randomUUID().slice(0, 8)}`]
  const files = [{ name: `${names[0]}.jpg`, type: 'image/jpeg', bytes: card }, { name: `${names[1]}.jpg`, type: 'image/jpeg', bytes: second }]
  expect(await dropFiles(page, await screenPoint(page, 300, 400, { pageId: 'p2', formatId: 'sq' }), files)).toBe(true)
  const toast = page.getByTestId('notice-toast')
  await expect(toast).toContainText('Uploading 2 images')
  // While they upload the view zooms in and pans, and the notice stays past the time a notice usually goes.
  await page.evaluate(() => window.dazbee?.setCamera({ x: -200, y: -150, zoom: 1.1 }))
  await page.waitForTimeout(9_000)
  await expect(toast).toContainText('Uploading 2 images')
  release()

  await expect.poll(async () => (await images(page)).length, { timeout: 30_000 }).toBe(2)
  await expect(toast).toHaveCount(0)
  // On page 2, the first centred on the drop point and the next 24 screen pixels on at the zoom it was dropped at.
  const placed = (await images(page)).sort((a, b) => a.x - b.x)
  expect(placed.map((p) => p.parentId)).toEqual(['p2', 'p2'])
  const step = 24 / 0.4
  for (const [i, p] of placed.entries()) {
    expect(Math.abs(p.x + p.width / 2 - (300 + i * step))).toBeLessThanOrEqual(1)
    expect(Math.abs(p.y + p.height / 2 - (400 + i * step))).toBeLessThanOrEqual(1)
  }
  expect(await page.evaluate(() => window.dazbee?.selectedFrame())).toBe('p2/sq')
  expect((await selection(page)).sort()).toEqual(placed.map((p) => p.id).sort())
  await page.evaluate(() => window.dazbee?.fitAll())
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('dropped-files-5-second-page.png', await page.screenshot())

  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await images(page)).toEqual([])
  expect(errors).toEqual([])
})

test('files that don’t upload are each named with why, beside the file left out, and the rest still go on', async ({ browser }) => {
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(browser, design(), { brandId })
  await routeUploads(page, brandId)

  const name = `Dropped ${randomUUID().slice(0, 8)}`
  const files = [
    { name: `${name}.jpg`, type: 'image/jpeg', bytes: card },
    { name: 'fail-one.jpg', type: 'image/jpeg', bytes: second },
    { name: 'fail-two.png', type: 'image/png', bytes: third },
    { name: 'notes.txt', type: 'text/plain', bytes: notes },
  ]
  expect(await dropFiles(page, await screenPoint(page, 540, 540), files)).toBe(true)
  await expect.poll(async () => (await images(page)).length, { timeout: 30_000 }).toBe(1)
  const toast = page.getByTestId('notice-toast')
  await expect(toast).toContainText('notes.txt')
  await expect(toast).toContainText('fail-one.jpg (Storage is down)')
  await expect(toast).toContainText('fail-two.png (Storage is down)')
  const [placed] = await images(page)
  expect(Math.abs((placed?.x ?? 0) + (placed?.width ?? 0) / 2 - 540)).toBeLessThanOrEqual(1)
  expect((await assetsOf(brandId)).map((a) => a.name)).toEqual([name])
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('dropped-files-6-failed.png', await page.screenshot())
  expect(errors).toEqual([])
})

test('an SVG file dropped on the canvas uploads once, goes on as layers centred where it was dropped, and shows in the open library', async ({ browser }) => {
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(browser, design(), { brandId })
  const uploads = watchUploads(page, brandId)
  await page.locator('[data-panel="assets"]').click()
  const library = page.getByTestId('asset-library')
  await expect(library).toBeVisible()

  const name = `Badge ${randomUUID().slice(0, 8)}`
  expect(await dropFiles(page, await screenPoint(page, 760, 540), [{ name: `${name}.svg`, type: 'image/svg+xml', bytes: svgBadge }])).toBe(true)
  const group = async () => Object.entries((await read(page)).nodes as unknown as Record<string, { type: string; name: string; parentId: string }>).find(([, n]) => n.type === 'group' && n.name === name)?.[0]
  await expect.poll(group, { timeout: 30_000 }).toBeTruthy()
  const id = await group() as string
  const box = await page.evaluate((id) => window.dazbee?.boxOf(id), id)
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 760)).toBeLessThanOrEqual(1)
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) / 2 - 540)).toBeLessThanOrEqual(1)
  expect(await selection(page)).toEqual([id])
  // The library, open while it uploaded, lists it without being opened again.
  await expect(library.locator('li[data-asset]').filter({ hasText: name })).toBeVisible()
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('dropped-files-7-svg.png', await page.screenshot())
  expect(uploads()).toBe(1)
  expect((await assetsOf(brandId)).map((a) => [a.name, a.contentType])).toEqual([[name, 'image/svg+xml']])

  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await group()).toBeUndefined()
  expect(errors).toEqual([])
})

test('images that finish uploading while a text is typed into end the typing and go on as one undo step of their own', async ({ browser }) => {
  const brandId = await newBrand('e2e dropped files')
  const title: DesignInput['nodes'][string] = { type: 'text', parentId: 'p1', index: 'a0', name: 'Title', props: { x: 100, y: 100, width: 600, height: 60, text: 'Hello', style: { fontFamily: 'Noto Sans', fontSize: 40, color: '#111111FF' } } }
  const { page, errors } = await openStage(browser, design({ title }), { brandId })
  const release = await routeUploads(page, brandId, { hold: true })
  const text = async () => ((await read(page)).nodes as unknown as Record<string, { props: { text: string } }>).title?.props.text

  const files = [{ name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: card }, { name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: second }]
  expect(await dropFiles(page, await screenPoint(page, 540, 700), files)).toBe(true)
  await expect(page.getByTestId('notice-toast')).toContainText('Uploading 2 images')
  // Typing into the title, past its end, when the uploads finish.
  const end = await screenPoint(page, 600, 130)
  await page.mouse.dblclick(end.x, end.y)
  await expect(page.locator('.caret')).toBeVisible()
  await page.keyboard.type('abc')
  release()

  await expect.poll(async () => (await images(page)).length, { timeout: 30_000 }).toBe(2)
  await expect(page.locator('.caret')).toHaveCount(0)
  expect(await text()).toBe('Helloabc')
  // One undo takes both images away and leaves the typing; the next takes the typing back.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await images(page)).toEqual([])
  expect(await text()).toBe('Helloabc')
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await text()).toBe('Hello')
  expect(errors).toEqual([])
})

test('images that finish uploading while a pen path is open go on within a few seconds as one undo step, the path kept as drawn', async ({ browser }) => {
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(browser, design(), { brandId })
  const release = await routeUploads(page, brandId, { hold: true })
  const paths = async () => Object.entries((await read(page)).nodes as unknown as Record<string, { props: { shape?: { kind: string } } }>).filter(([, n]) => n.props.shape?.kind === 'path').map(([id]) => id)

  const files = [{ name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: card }, { name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: second }]
  expect(await dropFiles(page, await screenPoint(page, 540, 700), files)).toBe(true)
  await expect(page.getByTestId('notice-toast')).toContainText('Uploading 2 images')
  // A pen path with two anchors, left open, when the uploads finish.
  await page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Pen' }).click()
  for (const [x, y] of [[200, 200], [420, 260]] as const) {
    const at = await screenPoint(page, x, y)
    await page.mouse.click(at.x, at.y)
  }
  await expect.poll(paths).toHaveLength(1)
  expect(await page.evaluate(() => window.dazbee?.gesturing())).toBe(true)
  const released = Date.now()
  release()

  await expect.poll(async () => (await images(page)).length, { timeout: 20_000 }).toBe(2)
  expect(Date.now() - released).toBeLessThan(12_000)
  await expect(page.getByTestId('notice-toast')).toHaveCount(0)
  const [path] = await paths()
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('dropped-files-8-pen.png', await page.screenshot())
  // One undo takes both images away and keeps the path; the next takes the path.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await images(page)).toEqual([])
  expect(await paths()).toEqual([path])
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await paths()).toEqual([])
  expect(errors).toEqual([])
})

test('images that finish uploading while a layer is dragged on the canvas go on after it is let go, the drag and the images one undo step each', async ({ browser }) => {
  const brandId = await newBrand('e2e dropped files')
  const square: DesignInput['nodes'][string] = { type: 'graphic', parentId: 'p1', index: 'a0', name: 'Square', props: { x: 100, y: 100, width: 200, height: 200, shape: { kind: 'rect' }, fills: [{ type: 'solid', color: '#2F6BFFFF' }] } }
  const { page, errors } = await openStage(browser, design({ square }), { brandId })
  const release = await routeUploads(page, brandId, { hold: true })
  // Where the square is in the square format: a drag on the stage writes that format's override.
  const x = async () => (await props(page, 'square')).x

  const files = [{ name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: card }, { name: `Dropped ${randomUUID().slice(0, 8)}.jpg`, type: 'image/jpeg', bytes: second }]
  expect(await dropFiles(page, await screenPoint(page, 540, 800), files)).toBe(true)
  // The square is pressed and dragged, and still held when the uploads finish, for longer than the pen path's limit.
  const from = await screenPoint(page, 200, 200)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 60, from.y + 30, { steps: 5 })
  release()
  await page.waitForTimeout(4_500)
  expect(await images(page)).toEqual([])
  await page.mouse.move(from.x + 120, from.y + 60, { steps: 5 })
  await page.mouse.up()

  await expect.poll(async () => (await images(page)).length, { timeout: 20_000 }).toBe(2)
  const moved = await x()
  expect(moved).not.toBe(100)
  // One undo takes both images away and leaves the square where it was dragged; the next puts it back.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await images(page)).toEqual([])
  expect(await x()).toBe(moved)
  await page.evaluate(() => window.dazbee?.perform('undo'))
  expect(await x()).toBe(100)
  expect(errors).toEqual([])
})

test('an SVG file whose format goes while it uploads is not placed, and the notice says it is in the library', async ({ browser }) => {
  const brandId = await newBrand('e2e dropped files')
  const { page, errors } = await openStage(browser, design({}, { formats: { wide: { name: 'Wide', width: 1920, height: 1080, order: 'a1' } } }), { brandId })
  await page.evaluate(() => window.dazbee?.setCamera({ x: 40, y: 80, zoom: 0.35 }))
  await page.evaluate(() => window.dazbee?.drawn())
  const release = await routeUploads(page, brandId, { hold: true })

  const name = `Badge ${randomUUID().slice(0, 8)}`
  expect(await dropFiles(page, await screenPoint(page, 500, 500, { pageId: 'p1', formatId: 'wide' }), [{ name: `${name}.svg`, type: 'image/svg+xml', bytes: svgBadge }])).toBe(true)
  await page.evaluate(() => window.dazbee?.session.run('format.remove', { id: 'wide' }))
  release()

  await expect(page.getByTestId('notice-toast')).toContainText('Uploaded to the library', { timeout: 30_000 })
  expect(Object.values((await read(page)).nodes)).toEqual([])
  expect((await assetsOf(brandId)).map((a) => a.name)).toEqual([name])
  writeOutput('dropped-files-9-format-gone.png', await page.screenshot())
  expect(errors).toEqual([])
})
