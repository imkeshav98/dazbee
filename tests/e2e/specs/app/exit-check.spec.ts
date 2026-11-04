// Phase 1's exit check (#61) in Chromium: a designer starts a design from the brief, sets up the
// brand kit, uploads a photo and a font and builds an ad in its one frame, all through real input.
// Commands then duplicate the frame and add it at four more sizes, laid out to fit; the headline is
// dragged in one frame, and every other frame keeps its copy as it was. Every frame of the page is
// exported as PNG, JPG, PDF and SVG through the Export menu. Each file is byte for byte what Node
// exports of the same frame from the same design and files; PNG and JPG are pixel for pixel Node's
// render, and PDF and SVG, drawn by pdfium and resvg, stay within EXIT_VECTOR_LIMIT of it, as does
// the SVG drawn by Chromium's own decoder. The numbers go to output/exit-check.json.
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { PDFiumLibrary } from '@hyzyla/pdfium'

import type { CanvasKit } from '@dazbee/canvaskit'
import { exportDesign, readZip } from '@dazbee/export'
import { decodePng, encodePng, fixtureResources, type Pixels } from '@dazbee/pixels/pixels'
import { overWhite, rasterisePdf, rasteriseSvg, vectorDifference } from '@dazbee/pixels/vector'
import { renderDesign } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'
import type { ExportType } from '@dazbee/schema'

import { photo, righteous } from '../../support/assets.ts'
import { designOf, OUTPUT, screenPoint, shoot, writeOutput } from '../../support/editor.ts'
import { newBrand } from '../../support/seed.ts'
import { drawn, press } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 600_000 })

const run = crypto.randomUUID().slice(0, 6)
/** The most a PDF or SVG of this ad may differ from the CPU render, in percent of its pixels. */
const EXIT_VECTOR_LIMIT = 1
/** The sizes the ad is added at after its duplicate, as Add size would add them. */
const SIZES = [
  { name: 'Story and Reel', width: 1080, height: 1920 },
  { name: 'Medium rectangle', width: 300, height: 250 },
  { name: 'Leaderboard', width: 728, height: 90 },
  { name: 'Link image', width: 1200, height: 628 },
]

interface Stored {
  meta: { name: string }
  frames: Record<string, { pageId: string; name: string; width: number; height: number; order: string }>
  nodes: Record<
    string,
    {
      type: string
      parentId: string
      link: string
      bindings?: Record<string, string>
      props: Record<string, unknown> & { fills?: { type: string; assetId?: string }[] }
    }
  >
}
const stored = async (page: Page) => JSON.parse(await designOf(page)) as Stored
/** The page's frames by order, as Export lists them. */
const framesOf = (design: Stored) =>
  Object.entries(design.frames)
    .filter(([, frame]) => frame.pageId === 'p1')
    .sort(([a, x], [b, y]) => (x.order < y.order ? -1 : x.order > y.order ? 1 : a < b ? -1 : 1))
/** The layer each frame holds with this link, by frame. */
const copiesOf = (design: Stored, link: string) => {
  const frameOf = (id: string) => {
    let at = id
    for (let i = 0; design.nodes[at] && i < 50; i++) at = design.nodes[at]?.parentId ?? ''
    return at
  }
  return Object.fromEntries(
    Object.entries(design.nodes)
      .filter(([, node]) => node.link === link)
      .map(([id, node]) => [frameOf(id), { id, ...node }]),
  )
}

/** An SVG file as Chromium's own SVG decoder draws it in the page, at the frame's size over white. */
async function drawnByChromium(
  page: Page,
  ck: CanvasKit,
  file: Uint8Array,
  width: number,
  height: number,
): Promise<Pixels> {
  const png = await page.evaluate(
    async ({ text, width, height }) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
      try {
        const image = new Image()
        image.src = url
        await image.decode()
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('no 2d context')
        context.fillStyle = '#FFFFFF'
        context.fillRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)
        const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return btoa(binary)
      } finally {
        URL.revokeObjectURL(url)
      }
    },
    { text: new TextDecoder().decode(file), width, height },
  )
  return decodePng(ck, new Uint8Array(Buffer.from(png, 'base64')))
}

test('an ad built in one frame, duplicated and added at 4 more sizes, exports every frame as PNG, JPG, PDF and SVG that match Node', async ({
  browser,
}) => {
  const brandId = await newBrand('e2e exit-check')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    recordVideo: { dir: join(OUTPUT, 'exit-check-video'), size: { width: 1440, height: 1000 } },
  })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  // The brief opens a design of one blank square frame.
  await page.goto(`/brands/${brandId}`)
  await page.getByLabel('Brief').fill(`Trail days ${run}`)
  await page.getByRole('button', { name: 'Make drafts' }).click()
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  const [[square = '', squareFrame] = []] = framesOf(await stored(page))
  expect(squareFrame).toMatchObject({ name: 'Feed square', width: 1080, height: 1080 })
  await page.evaluate(() => window.dazbee?.setCamera({ x: 120, y: 80, zoom: 0.7 }))
  await drawn(page)

  // The brand kit gets two colours, typed in by hand.
  const colour = `Trail green ${run}`
  const accent = `Sun ${run}`
  await page.locator('[data-panel="brand"]').click()
  const kit = page.getByTestId('brand-kit')
  await kit.getByRole('button', { name: 'Edit', exact: true }).click()
  for (const [named, hex] of [
    [colour, '1F7A4D'],
    [accent, 'FFB627'],
  ] as const) {
    await kit.getByRole('button', { name: 'Add colour' }).click()
    const row = kit.locator('li[data-token]').last()
    await row.getByRole('textbox', { name: /^Name of colour/ }).fill(named)
    await row.getByRole('textbox', { name: /^Name of colour/ }).press('Enter')
    await row.getByRole('textbox', { name: `Hex value of ${named}` }).fill(hex)
    await row.getByRole('textbox', { name: `Hex value of ${named}` }).press('Enter')
    await expect(row.getByRole('textbox', { name: `Hex value of ${named}` })).toHaveValue(new RegExp(hex, 'i'))
  }
  await shoot(page, 'exit-check-0-brand-kit')

  // A photo goes into the brand's assets and is dragged onto the frame.
  await page.locator('[data-panel="assets"]').click()
  const library = page.getByTestId('asset-library')
  const name = `Sneaker ${run}`
  // Bytes after the JPEG's end make each run's file its own, since assets are stored by hash.
  await library
    .locator('input[type="file"]')
    .setInputFiles({ name: `${name}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.concat([photo, Buffer.from(run)]) })
  const item = library.locator('li[data-asset]').filter({ hasText: name })
  await expect(item).toBeVisible({ timeout: 30_000 })
  const stage = page.getByTestId('stage')
  const box = await stage.boundingBox()
  const drop = await screenPoint(page, 600, 420)
  await item
    .getByRole('button', { name: `Place ${name} on the design` })
    .dragTo(stage, { targetPosition: { x: drop.x - (box?.x ?? 0), y: drop.y - (box?.y ?? 0) } })
  await expect
    .poll(
      async () =>
        Object.values((await stored(page)).nodes).filter((n) => n.props.fills?.some((f) => f.type === 'image')).length,
    )
    .toBe(1)
  await page.keyboard.press('Escape')
  await page.locator('[data-panel="assets"]').click()
  await expect(page.getByTestId('flyout')).toHaveCount(0)
  await drawn(page)

  // A badge drawn with the rectangle tool, in the brand colour from the kit.
  await press(page, 'toolRect')
  const from = await screenPoint(page, 800, 60)
  const to = await screenPoint(page, 1020, 200)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  await drawn(page)
  await page.locator('[data-panel="brand"]').click()
  await kit.getByRole('button', { name: `Apply ${accent} to the selection` }).click()
  await expect
    .poll(
      async () =>
        Object.values((await stored(page)).nodes).filter((n) => n.bindings?.fill?.startsWith('brand:')).length,
    )
    .toBe(1)
  await page.keyboard.press('Escape')

  // A headline typed with the text tool, then set in an uploaded font.
  await press(page, 'toolText')
  const at = await screenPoint(page, 80, 860)
  await page.mouse.click(at.x, at.y)
  await drawn(page)
  await page.keyboard.type('Ride further')
  await page.keyboard.press('Escape')
  await drawn(page)
  const headline = Object.entries((await stored(page)).nodes).find(([, n]) => n.type === 'text')?.[0] ?? ''
  expect(headline).not.toBe('')
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual([headline])
  await barMenu(page, 'font')
  // An upload from the list joins the brand's fonts and is set at once.
  await page
    .getByTestId('font-upload')
    .setInputFiles({ name: 'Righteous-Regular.ttf', mimeType: 'font/ttf', buffer: Buffer.from(righteous) })
  await expect
    .poll(async () => ((await stored(page)).nodes[headline]?.props.style as { fontFamily: string }).fontFamily)
    .toBe('Righteous')
  // The size is a field on the top bar: a click selects it, ready to type over; 140, typed.
  await page.getByTestId('bar-size-field').click()
  await page.keyboard.type('140')
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => ((await stored(page)).nodes[headline]?.props.style as { fontSize: number }).fontSize)
    .toBe(140)
  // A click on the empty canvas leaves nothing selected.
  await page.mouse.click(40, 900)
  await expect.poll(() => page.evaluate(() => window.dazbee?.selection())).toEqual([])
  await page.locator('[data-panel="brand"]').click()
  await expect(kit).toBeHidden()
  await drawn(page)
  await shoot(page, 'exit-check-1-square')
  const built = await stored(page)
  const layers = Object.keys(built.nodes).length
  expect(layers).toBe(3)

  // The frame duplicated, then added at four more sizes: each one command and one undo step, a
  // linked copy of every layer in each new frame.
  const copies = await page.evaluate(
    ({ square, sizes }) => {
      const session = window.dazbee?.session
      if (!session) throw new Error('no editor')
      return [
        session.run('frame.duplicate', { frameId: square }),
        ...sizes.map(({ width, height }) => session.run('frame.addSize', { frameId: square, width, height })),
      ]
    },
    { square, sizes: SIZES },
  )
  await expect.poll(async () => Object.keys((await stored(page)).nodes).length).toBe(layers * 6)
  const design = await stored(page)
  const frames = framesOf(design)
  expect(frames.map(([id]) => id)).toEqual([square, ...copies])
  // Duplicate and Add size keep the frame's name.
  expect(frames.map(([, f]) => [f.name, f.width, f.height])).toEqual([
    ['Feed square', 1080, 1080],
    ['Feed square', 1080, 1080],
    ...SIZES.map((size) => ['Feed square', size.width, size.height]),
  ])
  const headlines = copiesOf(design, design.nodes[headline]?.link ?? '')
  expect(Object.keys(headlines).sort()).toEqual(frames.map(([id]) => id).sort())
  const story = copies[1] ?? ''
  await page.evaluate(() => window.dazbee?.fitAll())
  await drawn(page)

  // The headline dragged up in the story only: laid out to fit put it low in the tall frame.
  const inStory = headlines[story] as unknown as {
    id: string
    props: { x: number; y: number; width: number; height: number }
  }
  const before = inStory.props
  // Nothing selected, so no bar by a selection floats over the story's headline.
  await page.keyboard.press('Escape')
  await press(page, 'toolSelect')
  await page.evaluate((story) => window.dazbee?.fitFrame(story), story)
  await drawn(page)
  const grab = await screenPoint(page, before.x + before.width / 2, before.y + before.height / 2, story)
  const lift = await screenPoint(page, before.x + before.width / 2, before.y + before.height / 2 - 600, story)
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(lift.x, lift.y, { steps: 8 })
  await page.mouse.up()
  await drawn(page)
  const after = await stored(page)
  expect(after.nodes[inStory.id]?.props.y as number).toBeLessThan(before.y - 500)
  // Every other frame keeps its headline, and every other layer, as it was.
  for (const [frameId] of frames.filter(([id]) => id !== story)) {
    const id = headlines[frameId]?.id ?? ''
    expect(after.nodes[id], `the headline in ${frameId}`).toEqual(design.nodes[id])
  }
  for (const [id, node] of Object.entries(design.nodes))
    if (id !== inStory.id) expect(after.nodes[id], `layer ${id}`).toEqual(node)
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.dazbee?.fitAll())
  await drawn(page)
  await shoot(page, 'exit-check-2-six-frames')

  // Every frame of the page as each file type, through the Export menu: one flat zip each.
  const files: Partial<Record<ExportType, { path: string; bytes: Uint8Array }[]>> = {}
  for (const type of ['png', 'jpg', 'pdf', 'svg'] as const) {
    await page.getByRole('button', { name: 'Share' }).click()
    await page.getByText('Export', { exact: true }).click()
    await page.locator(`[data-type="${type}"]`).click()
    if (type === 'png') await shoot(page, 'exit-check-3-export')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
    files[type] = readZip(new Uint8Array(readFileSync(await download.path())))
    await page.keyboard.press('Escape')
  }

  // Node exports the same frames of the same design from the same files.
  const final = await stored(page)
  const json = JSON.parse(await designOf(page)) as unknown
  const assetId =
    Object.values(final.nodes)
      .flatMap((n) => n.props.fills ?? [])
      .find((f) => f.type === 'image')?.assetId ?? ''
  const image = new Uint8Array(await (await page.request.get(`/brands/${brandId}/assets/${assetId}`)).body())
  const shipped = fixtureResources()
  const bytes = {
    ...shipped,
    fonts: [...shipped.fonts, { family: 'Righteous', bytes: righteous }],
    images: { [assetId]: image },
  }
  const ck = await loadCanvasKit()
  const frameIds = framesOf(final).map(([id]) => id)
  for (const type of ['png', 'jpg', 'pdf', 'svg'] as const) {
    // Named after the frames, the repeats numbered, in the page's order.
    const names = readZip(exportDesign(ck, json, { frameIds, type }, bytes).bytes).map((entry) => entry.path)
    expect(
      (files[type] ?? []).map((entry) => entry.path),
      `the ${type} zip's files`,
    ).toEqual(names)
    expect(names[0]).toBe(`Feed square.${type}`)
    expect(names[1]).toBe(`Feed square 2.${type}`)
  }
  const pdfium = await PDFiumLibrary.init()
  const results: Record<string, unknown>[] = []
  for (const [i, [frameId, frame]] of framesOf(final).entries()) {
    const result: Record<string, unknown> = { frame: frameId, name: frame.name, size: `${frame.width}×${frame.height}` }
    const fileOf = (type: ExportType) => files[type]?.[i]?.bytes ?? new Uint8Array()
    for (const type of ['png', 'jpg', 'pdf', 'svg'] as const) {
      const node = exportDesign(ck, json, { frameIds: [frameId], type }, bytes).bytes
      const browserFile = fileOf(type)
      expect(Buffer.from(browserFile).equals(Buffer.from(node)), `${frameId} ${type} is Node's, byte for byte`).toBe(
        true,
      )
      result[type] = { bytes: browserFile.length, identicalToNode: true }
    }
    const cpu = overWhite(renderDesign(ck, json, frameId, bytes))
    const pdf = await rasterisePdf(pdfium, fileOf('pdf'))
    const svg = rasteriseSvg(fileOf('svg'))
    const chromium = await drawnByChromium(page, ck, fileOf('svg'), frame.width, frame.height)
    const vector = {
      pdf: Number(vectorDifference(cpu, pdf).toFixed(3)),
      svg: Number(vectorDifference(cpu, svg).toFixed(3)),
      svgInChromium: Number(vectorDifference(cpu, chromium).toFixed(3)),
    }
    result.vectorPercentDiffering = vector
    writeOutput(`exit-check-4-${i + 1}-cpu.png`, Buffer.from(encodePng(ck, cpu)))
    writeOutput(`exit-check-4-${i + 1}-pdf.png`, Buffer.from(encodePng(ck, pdf)))
    writeOutput(`exit-check-4-${i + 1}-svg.png`, Buffer.from(encodePng(ck, svg)))
    writeOutput(`exit-check-4-${i + 1}-svg-chromium.png`, Buffer.from(encodePng(ck, chromium)))
    results.push(result)
  }
  pdfium.destroy()
  writeOutput(
    'exit-check.json',
    JSON.stringify({ design: final.meta.name, layers: Object.keys(final.nodes).length, frames: results }, null, 2),
  )
  for (const { name, size, vectorPercentDiffering } of results as {
    name: string
    size: string
    vectorPercentDiffering: { pdf: number; svg: number; svgInChromium: number }
  }[]) {
    const { pdf, svg, svgInChromium } = vectorPercentDiffering
    expect
      .soft(svgInChromium, `${name} ${size} SVG drawn by Chromium, % of pixels differing`)
      .toBeLessThanOrEqual(EXIT_VECTOR_LIMIT)
    expect.soft(pdf, `${name} ${size} PDF, % of pixels differing`).toBeLessThanOrEqual(EXIT_VECTOR_LIMIT)
    expect.soft(svg, `${name} ${size} SVG, % of pixels differing`).toBeLessThanOrEqual(EXIT_VECTOR_LIMIT)
  }
  expect(errors).toEqual([])
  await context.close()
  const video = await page.video()?.path()
  if (video) writeOutput('exit-check.webm', readFileSync(video))
  rmSync(join(OUTPUT, 'exit-check-video'), { recursive: true, force: true })
})
