// Export (#55) in Chromium, through the Export menu: every format of a page as PNG downloads as one
// zip with a folder per format, and every file in it is byte for byte what Node exports from the
// same design, drawn in the export worker rather than on the main thread, and named by the File
// names field; and one format as JPG downloads as itself.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '../support/test.ts'
import { exportDesign, readZip } from '@dazbee/export'
import { FALLBACK_FAMILIES } from '@dazbee/fonts'
import { loadFontFiles } from '@dazbee/fonts/node'
import { loadCanvasKit } from '@dazbee/renderer/node'
import type { DesignInput } from '@dazbee/schema'
import { photo, upload } from '../support/assets.ts'
import { designOf, writeOutput } from '../support/editor.ts'
import { PERF, report } from '../support/perf.ts'
import { openStage } from '../support/stage.ts'
import { choose } from '../support/select.ts'

test.describe.configure({ timeout: 180_000 })

const FORMATS = {
  sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
  pt: { name: 'Portrait 4:5', width: 1080, height: 1350, order: 'a1' },
  story: { name: 'Story', width: 1080, height: 1920, order: 'a2' },
  land: { name: 'Landscape', width: 1200, height: 628, order: 'a3' },
  mpu: { name: 'MPU', width: 300, height: 250, order: 'a4' },
}

const design = (assetId: string): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Spring drop', kind: 'single', primaryFormatId: 'sq' },
  formats: FORMATS,
  pages: {
    p1: { name: 'Hero', order: 'a0', fills: [{ type: 'solid', color: '#FFF6E8FF' }] },
    p2: { name: 'Offer', order: 'a1', fills: [{ type: 'solid', color: '#15121AFF' }] },
  },
  nodes: {
    photo: {
      type: 'graphic', parentId: 'p1', index: 'a0', name: 'Photo',
      props: { x: 80, y: 80, width: 920, height: 600, shape: { kind: 'rect', cornerRadius: 40 }, fills: [{ type: 'image', assetId, fit: 'fill', filter: 'vivid' }] },
    },
    title: {
      type: 'text', parentId: 'p1', index: 'a1', name: 'Title', role: 'headline',
      props: { x: 80, y: 740, width: 920, height: 140, text: 'Spring drop', style: { fontFamily: 'Noto Sans', fontSize: 110, fontWeight: 800, color: '#15121AFF' } },
    },
    badge: {
      type: 'graphic', parentId: 'p1', index: 'a2', name: 'Badge',
      props: { x: 820, y: 40, width: 220, height: 220, shape: { kind: 'star', points: 10, innerRadius: 0.75 }, fills: [{ type: 'solid', color: '#FF48B0FF' }] },
    },
    offer: {
      type: 'text', parentId: 'p2', index: 'a0', name: 'Offer',
      props: { x: 80, y: 400, width: 920, height: 140, text: '30% off', style: { fontFamily: 'Noto Sans', fontSize: 120, fontWeight: 800, color: '#FFFFFFFF' } },
    },
  },
  overrides: {
    // The other formats move and resize layers, as an agency's sizes do.
    'format:story': { title: { y: 1400 }, photo: { height: 1100 } },
    'format:land': { photo: { width: 560, height: 468 }, title: { x: 660, y: 200, width: 480, height: 260 }, badge: { x: 980, width: 160, height: 160 } },
    'format:mpu': { photo: { x: 10, y: 10, width: 280, height: 150 }, title: { x: 10, y: 170, width: 280, height: 40 }, badge: { x: 230, y: 4, width: 60, height: 60 } },
  },
})

type LongTasks = { longTasks: number[]; longTaskWatch: PerformanceObserver }
/** Records every task that blocks the main thread for more than 50 ms, from now on. */
const watchLongTasks = (page: Page) => page.evaluate(() => {
  const seen: number[] = []
  const watch = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) seen.push(Math.round(entry.duration))
  })
  watch.observe({ type: 'longtask', buffered: false })
  Object.assign(window, { longTasks: seen, longTaskWatch: watch })
})
/** The tasks recorded so far, with those the browser has queued but not yet handed to the watch. */
const longTasks = (page: Page) => page.evaluate(() => {
  const { longTasks: seen, longTaskWatch: watch } = window as unknown as LongTasks
  for (const entry of watch.takeRecords()) seen.push(Math.round(entry.duration))
  return seen
})

/** A reply from the export worker (ExportReply in packages/editor/src/export-client.ts). */
type Reply =
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'done'; file: { bytes: Uint8Array } }
  | { kind: 'error'; message: string }
/** What the worker watch records: the request of each job posted, and each reply with the file's size in place of the file. */
interface Posted { jobs: { request: unknown }[]; replies: (Exclude<Reply, { kind: 'done' }> | { kind: 'done'; bytes: number })[] }

/**
 * Records, from now on, every job the page posts to a worker (the export request it carries) and
 * every reply a worker sends back: each file it reports made, and the size of the file it hands over.
 */
const watchWorkers = (page: Page) => page.evaluate(() => {
  const seen: Posted = { jobs: [], replies: [] }
  const heard = new WeakSet<Worker>()
  const post = Worker.prototype.postMessage
  Worker.prototype.postMessage = function (this: Worker, message: { request?: unknown }, ...rest: unknown[]) {
    if (!heard.has(this)) {
      heard.add(this)
      this.addEventListener('message', ({ data }: MessageEvent<Reply & { id: number }>) => {
        seen.replies.push(data.kind === 'done' ? { kind: 'done', bytes: data.file.bytes.length }
          : data.kind === 'progress' ? { kind: 'progress', done: data.done, total: data.total }
            : { kind: 'error', message: data.message })
      })
    }
    seen.jobs.push({ request: message.request })
    Reflect.apply(post, this, [message, ...rest])
  }
  ;(window as unknown as { workers: Posted }).workers = seen
})
const workers = (page: Page) => page.evaluate(() => (window as unknown as { workers: Posted }).workers)

async function nodeExport(page: Page, assetId: string) {
  const ck = await loadCanvasKit()
  const json = JSON.parse(await designOf(page)) as unknown
  const stored = new Uint8Array(await (await page.request.get(`/brands/dev-brand-coffee/assets/${assetId}`)).body())
  const bytes = { fonts: loadFontFiles().map((f) => ({ family: f.family, bytes: f.bytes })), fallbackFamilies: [...FALLBACK_FAMILIES], images: { [assetId]: stored } }
  return (request: { pageIds: string[]; formatIds: string[]; type: 'png' | 'jpg'; quality?: number }) => exportDesign(ck, json, request, bytes).bytes
}

test('every format of a page as PNG is one zip whose files are what Node exports, drawn in the export worker, named by the File names field', async ({ browser }) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  const dialog = page.getByTestId('export')
  await expect(dialog).toBeVisible()
  // Every page in every format, until the export is narrowed.
  await expect(page.getByTestId('export-run')).toHaveText('Export 10 files')
  await dialog.getByRole('radio', { name: 'This page' }).click()
  await choose(page.getByTestId('export-page'), 'p1')
  await expect(page.getByTestId('export-run')).toHaveText('Export 5 files')
  writeOutput('export-0-menu.png', await page.screenshot())

  await watchWorkers(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  expect(download.suggestedFilename()).toBe('Spring drop.zip')
  const zipped = new Uint8Array(readFileSync(await download.path()))

  const entries = readZip(zipped)
  expect(entries.map((e) => e.path)).toEqual(Object.values(FORMATS).map((f) => `${f.name.replace(':', '-')}/Spring drop - Hero - ${f.name.replace(':', '-')}.png`))
  const node = await nodeExport(page, asset.id)
  for (const [i, formatId] of Object.keys(FORMATS).entries()) {
    const browserFile = entries[i]?.bytes
    expect(browserFile, formatId).toBeDefined()
    expect(Buffer.from(browserFile ?? []).equals(Buffer.from(node({ pageIds: ['p1'], formatIds: [formatId], type: 'png' }))), `${formatId} matches Node`).toBe(true)
  }
  writeOutput('export-1-zip.json', JSON.stringify({ files: entries.map((e) => ({ path: e.path, bytes: e.bytes.length })), zipBytes: zipped.length }, null, 2))
  writeOutput('export-2-story.png', Buffer.from(entries[2]?.bytes ?? []))
  // The worker drew the files, not the main thread: the page posted it the one request, it reported
  // each of the five as it made it, and the zip that downloaded is the one it handed back.
  const posted = await workers(page)
  expect(posted.jobs).toEqual([{ request: expect.objectContaining({ pageIds: ['p1'], formatIds: Object.keys(FORMATS), type: 'png' }) }])
  expect(posted.replies).toEqual([
    ...Object.keys(FORMATS).map((_, i) => ({ kind: 'progress', done: i + 1, total: 5 })),
    { kind: 'done', bytes: zipped.length },
  ])

  // The File names field names every file in the zip, each page in each format's folder.
  await dialog.getByRole('radio', { name: 'All 2' }).click()
  await page.getByTestId('export-name').fill('{page} for {size}')
  await expect(page.getByTestId('export-run')).toHaveText('Export 10 files')
  const [named] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  const names = readZip(new Uint8Array(readFileSync(await named.path()))).map((e) => e.path).sort()
  const folders = Object.values(FORMATS).map((f) => f.name.replace(':', '-'))
  expect(names).toEqual(folders.flatMap((folder) => ['Hero', 'Offer'].map((pageName) => `${folder}/${pageName} for ${folder}.png`)).sort())
  expect(errors).toEqual([])
})

test('exporting every format of a page: how long it takes, and the main thread\'s long tasks', PERF, async ({ browser }) => {
  const asset = await upload(photo)
  const { page } = await openStage(browser, design(asset.id))
  await watchLongTasks(page)
  // Started from a timer, as a click would start it: the browser times tasks, and an evaluate is not one.
  const took = await page.evaluate((formatIds) => new Promise<number>((resolve, reject) => {
    setTimeout(() => {
      const editor = window.dazbee
      if (!editor) return reject(new Error('no editor'))
      const started = performance.now()
      editor.exportFiles({ pageIds: ['p1'], formatIds, type: 'png' }).then(() => resolve(performance.now() - started), reject)
    })
  }), Object.keys(FORMATS))
  const blocked = await longTasks(page)
  report('Export, five formats of a page as PNG', {
    export: { ms: Math.round(took) },
    'main-thread tasks over 50 ms': { count: blocked.length, longestMs: Math.round(Math.max(0, ...blocked)) },
  })
})

test('one format as JPG downloads as itself, at the quality picked, the same bytes as Node', async ({ browser }) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  await page.getByTestId('export').getByRole('radio', { name: 'This page' }).click()
  await choose(page.getByTestId('export-page'), 'p2')
  // Only the landscape format.
  for (const formatId of ['sq', 'pt', 'story', 'mpu']) await page.getByTestId('export').locator(`[data-format="${formatId}"]`).click()
  await page.locator('[data-type="jpg"]').click()
  await page.getByTestId('export-quality').fill('70')
  await page.getByTestId('export-quality').press('Enter')
  await expect(page.getByTestId('export-run')).toHaveText('Export 1 file')
  writeOutput('export-3-jpg-menu.png', await page.screenshot())
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  expect(download.suggestedFilename()).toBe('Spring drop - Offer - Landscape.jpg')
  const jpg = readFileSync(await download.path())
  const node = await nodeExport(page, asset.id)
  expect(jpg.equals(Buffer.from(node({ pageIds: ['p2'], formatIds: ['land'], type: 'jpg', quality: 70 })))).toBe(true)
  // Lower quality is a smaller file.
  expect(jpg.length).toBeLessThan(node({ pageIds: ['p2'], formatIds: ['land'], type: 'jpg', quality: 100 }).length)
  writeOutput('export-4-offer.jpg', jpg)
  expect(errors).toEqual([])
})
