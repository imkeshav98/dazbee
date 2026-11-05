// Export (#55) in Chromium, through the Export menu: every frame of a page as PNG downloads as one
// flat zip, every file in it byte for byte what Node exports of the same frame, drawn in the export
// worker rather than on the main thread, and named after its frame or by the File names field;
// each page of a carousel, picked in the Page field, downloads its own frame; and one frame as JPG
// downloads as itself. Ticking frames and numbered names are in export-frames.spec.ts.
import { readFileSync } from 'node:fs'

import { readZip } from '@dazbee/export'
import type { DesignInput } from '@dazbee/schema'

import { photo, upload } from '../../support/assets.ts'
import { writeOutput } from '../../support/editor.ts'
import { fileOf, nodeExport } from '../../support/export.ts'
import { choose } from '../../support/fields.ts'
import { PERF, report } from '../../support/perf.ts'
import { frameDesign, linkedFrames } from '../../support/seed.ts'
import { openStage } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

/** The sizes each page of the design holds, a frame of each, in order. */
const SIZES = [
  { key: 'sq', name: 'Square', width: 1080, height: 1080 },
  { key: 'pt', name: 'Portrait 4:5', width: 1080, height: 1350 },
  { key: 'story', name: 'Story', width: 1080, height: 1920 },
  { key: 'land', name: 'Landscape', width: 1200, height: 628 },
  { key: 'mpu', name: 'MPU', width: 300, height: 250 },
]
/** A page's frames, `<page>-<size>`, in order. */
const framesOn = (pageId: string) => SIZES.map((size) => `${pageId}-${size.key}`)

/** The copies in the other frames of the first page move and resize layers, as an agency's sizes do. */
const VALUES: Record<string, Record<string, Record<string, unknown>>> = {
  story: { title: { y: 1400 }, photo: { height: 1100 } },
  land: {
    photo: { width: 560, height: 468 },
    title: { x: 660, y: 200, width: 480, height: 260 },
    badge: { x: 980, width: 160, height: 160 },
  },
  mpu: {
    photo: { x: 10, y: 10, width: 280, height: 150 },
    title: { x: 10, y: 170, width: 280, height: 40 },
    badge: { x: 230, y: 4, width: 60, height: 60 },
  },
}
/** The other four frames of a page, linked to its square. */
const others = (pageId: string) =>
  SIZES.slice(1).map(({ key, ...size }) => ({
    id: `${pageId}-${key}`,
    ...size,
    values: pageId === 'p1' ? VALUES[key] : undefined,
  }))

/** Two pages, Hero and Offer, each a frame in every size of SIZES, the square's layers copied into the others. */
const design = (assetId: string): DesignInput => {
  const hero = frameDesign({
    name: 'Spring drop',
    frameId: 'p1-sq',
    fills: [{ type: 'solid', color: '#FFF6E8FF' }],
    nodes: {
      photo: {
        type: 'graphic',
        parentId: 'p1-sq',
        index: 'a0',
        name: 'Photo',
        props: {
          x: 80,
          y: 80,
          width: 920,
          height: 600,
          shape: { kind: 'rect', cornerRadius: 40 },
          fills: [{ type: 'image', assetId, fit: 'fill', filter: 'vivid' }],
        },
      },
      title: {
        type: 'text',
        parentId: 'p1-sq',
        index: 'a1',
        name: 'Title',
        role: 'headline',
        props: {
          x: 80,
          y: 740,
          width: 920,
          height: 140,
          text: 'Spring drop',
          style: { fontFamily: 'Noto Sans', fontSize: 110, fontWeight: 800, color: '#15121AFF' },
        },
      },
      badge: {
        type: 'graphic',
        parentId: 'p1-sq',
        index: 'a2',
        name: 'Badge',
        props: {
          x: 820,
          y: 40,
          width: 220,
          height: 220,
          shape: { kind: 'star', points: 10, innerRadius: 0.75 },
          fills: [{ type: 'solid', color: '#FF48B0FF' }],
        },
      },
    },
  })
  const both: DesignInput = {
    ...hero,
    pages: { p1: { name: 'Hero', order: 'a0' }, p2: { name: 'Offer', order: 'a1' } },
    frames: {
      ...hero.frames,
      'p2-sq': {
        pageId: 'p2',
        name: 'Square',
        width: 1080,
        height: 1080,
        x: 0,
        y: 0,
        fills: [{ type: 'solid', color: '#15121AFF' }],
        order: 'a0',
      },
    },
    nodes: {
      ...hero.nodes,
      offer: {
        type: 'text',
        parentId: 'p2-sq',
        link: 'offer',
        index: 'a0',
        name: 'Offer',
        props: {
          x: 80,
          y: 400,
          width: 920,
          height: 140,
          text: '30% off',
          style: { fontFamily: 'Noto Sans', fontSize: 120, fontWeight: 800, color: '#FFFFFFFF' },
        },
      },
    },
  }
  return linkedFrames(linkedFrames(both, others('p1'), 'p1'), others('p2'), 'p2')
}

type LongTasks = { longTasks: number[]; longTaskWatch: PerformanceObserver }
/** Records every task that blocks the main thread for more than 50 ms, from now on. */
const watchLongTasks = (page: Page) =>
  page.evaluate(() => {
    const seen: number[] = []
    const watch = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) seen.push(Math.round(entry.duration))
    })
    watch.observe({ type: 'longtask', buffered: false })
    Object.assign(window, { longTasks: seen, longTaskWatch: watch })
  })
/** The tasks recorded so far, with those the browser has queued but not yet handed to the watch. */
const longTasks = (page: Page) =>
  page.evaluate(() => {
    const { longTasks: seen, longTaskWatch: watch } = window as unknown as LongTasks
    for (const entry of watch.takeRecords()) seen.push(Math.round(entry.duration))
    return seen
  })

/** A reply from the export worker (ExportReply in packages/editor/src/export/export-client.ts). */
type Reply =
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'done'; file: { bytes: Uint8Array } }
  | { kind: 'error'; message: string }
/** What the worker watch records: the request of each job posted, and each reply with the file's size in place of the file. */
interface Posted {
  jobs: { request: unknown }[]
  replies: (Exclude<Reply, { kind: 'done' }> | { kind: 'done'; bytes: number })[]
}

/**
 * Records, from now on, every job the page posts to a worker (the export request it carries) and
 * every reply a worker sends back: each file it reports made, and the size of the file it hands over.
 */
const watchWorkers = (page: Page) =>
  page.evaluate(() => {
    const seen: Posted = { jobs: [], replies: [] }
    const heard = new WeakSet<Worker>()
    const post = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (this: Worker, message: { request?: unknown }, ...rest: unknown[]) {
      if (!heard.has(this)) {
        heard.add(this)
        this.addEventListener('message', ({ data }: MessageEvent<Reply & { id: number }>) => {
          seen.replies.push(
            data.kind === 'done'
              ? { kind: 'done', bytes: data.file.bytes.length }
              : data.kind === 'progress'
                ? { kind: 'progress', done: data.done, total: data.total }
                : { kind: 'error', message: data.message },
          )
        })
      }
      seen.jobs.push({ request: message.request })
      Reflect.apply(post, this, [message, ...rest])
    }
    ;(window as unknown as { workers: Posted }).workers = seen
  })
const workers = (page: Page) => page.evaluate(() => (window as unknown as { workers: Posted }).workers)

test('Export opened from Share, by pointer or keyboard, takes the focus onto its first control, and Esc gives it back to Share', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  const share = page.getByTestId('share-open')
  const dialog = page.getByTestId('export')
  const first = dialog.getByTestId('export-page')
  await share.click()
  await page.getByTestId('export-open').click()
  await expect(first).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(share).toBeFocused()

  // Enter opens the menu with the focus on Export, and Enter opens it.
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('export-open')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(first).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(share).toBeFocused()
  expect(errors).toEqual([])
})

test('every frame of a page as PNG is one flat zip whose files are what Node exports, drawn in the export worker, named after the frames or by the File names field', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  const dialog = page.getByTestId('export')
  await expect(dialog).toBeVisible()
  // Every frame of the shown page.
  await expect(page.getByTestId('export-run')).toHaveText('Export 5 files')
  writeOutput('export-0-menu.png', await page.screenshot())

  await watchWorkers(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  expect(download.suggestedFilename()).toBe('Spring drop.zip')
  const zipped = new Uint8Array(readFileSync(await download.path()))

  // One file per frame, in the page's frame order, each named after its frame, with no folders.
  const entries = readZip(zipped)
  expect(entries.map((e) => e.path)).toEqual(SIZES.map((size) => fileOf(size.name)))
  const node = await nodeExport(page, [asset.id])
  for (const [i, frameId] of framesOn('p1').entries()) {
    const browserFile = entries[i]?.bytes
    expect(browserFile, frameId).toBeDefined()
    expect(
      Buffer.from(browserFile ?? []).equals(Buffer.from(node({ frameIds: [frameId], type: 'png' }).bytes)),
      `${frameId} matches Node`,
    ).toBe(true)
  }
  writeOutput(
    'export-1-zip.json',
    JSON.stringify(
      { files: entries.map((e) => ({ path: e.path, bytes: e.bytes.length })), zipBytes: zipped.length },
      null,
      2,
    ),
  )
  writeOutput('export-2-story.png', Buffer.from(entries[2]?.bytes ?? []))
  // The worker drew the files, not the main thread: the page posted it the one request, it reported
  // each of the five as it made it, and the zip that downloaded is the one it handed back.
  const posted = await workers(page)
  expect(posted.jobs).toEqual([{ request: expect.objectContaining({ frameIds: framesOn('p1'), type: 'png' }) }])
  expect(posted.replies).toEqual([
    ...SIZES.map((_, i) => ({ kind: 'progress', done: i + 1, total: 5 })),
    { kind: 'done', bytes: zipped.length },
  ])

  // The other page: its frames have the same names as the first page's, and keep them, since
  // numbers count within a page.
  await choose(page.getByTestId('export-page'), 'p2')
  await expect(page.getByTestId('export-run')).toHaveText('Export 5 files')
  const [other] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  expect(readZip(new Uint8Array(readFileSync(await other.path()))).map((e) => e.path)).toEqual(
    SIZES.map((size) => fileOf(size.name)),
  )

  // The File names field names every file in the zip from its page and frame.
  await page.getByTestId('export-name').fill('{page} for {frame}')
  await expect(page.getByTestId('export-run')).toHaveText('Export 5 files')
  const [named] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  expect(readZip(new Uint8Array(readFileSync(await named.path()))).map((e) => e.path)).toEqual(
    SIZES.map((size) => `Offer for ${size.name.replace(':', '-')}.png`),
  )
  expect(errors).toEqual([])
})

test(
  "exporting every frame of a page: how long it takes, and the main thread's long tasks",
  PERF,
  async ({ browser }) => {
    const asset = await upload(photo)
    const { page } = await openStage(browser, design(asset.id))
    await watchLongTasks(page)
    // Started from a timer, as a click would start it: the browser times tasks, and an evaluate is not one.
    const took = await page.evaluate(
      (frameIds) =>
        new Promise<number>((resolve, reject) => {
          setTimeout(() => {
            const editor = window.dazbee
            if (!editor) return reject(new Error('no editor'))
            const started = performance.now()
            editor.exportFiles({ frameIds, type: 'png' }).then(() => resolve(performance.now() - started), reject)
          })
        }),
      framesOn('p1'),
    )
    const blocked = await longTasks(page)
    report('Export, five frames of a page as PNG', {
      export: { ms: Math.round(took) },
      'main-thread tasks over 50 ms': { count: blocked.length, longestMs: Math.round(Math.max(0, ...blocked)) },
    })
  },
)
