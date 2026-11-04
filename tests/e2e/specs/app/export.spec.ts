// Export (#55) in Chromium, through the Export menu: every frame of a page as PNG downloads as one
// flat zip, every file in it byte for byte what Node exports of the same frame, drawn in the export
// worker rather than on the main thread, and named after its frame or by the File names field,
// repeated names numbered; every page of a carousel downloads as one zip of each page's frame; and
// one frame as JPG downloads as itself.
import { readFileSync } from 'node:fs'

import { exportDesign, readZip } from '@dazbee/export'
import { fixtureResources } from '@dazbee/pixels/pixels'
import { loadCanvasKit } from '@dazbee/renderer/node'
import type { DesignInput } from '@dazbee/schema'

import { photo, upload } from '../../support/assets.ts'
import { designOf, writeOutput } from '../../support/editor.ts'
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
/** The file a frame's name gives by default, as the export makes a name safe. */
const fileOf = (name: string, n = 1, type = 'png') => `${name.replace(':', '-')}${n > 1 ? ` ${n}` : ''}.${type}`

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

const slide = (pageId: string, color: string) => ({
  pageId,
  name: 'Portrait 4:5',
  width: 1080,
  height: 1350,
  x: 0,
  y: 0,
  fills: [{ type: 'solid' as const, color }],
  order: 'a0',
})

/** A carousel of three pages, each one portrait frame with its own picture: a photo and words, words on dark, a badge on pink. */
const carousel = (assetId: string): DesignInput => ({
  meta: { designId: 'replaced-by-the-api', name: 'Spring carousel' },
  pages: {
    s1: { name: 'Slide 1', order: 'a0' },
    s2: { name: 'Slide 2', order: 'a1' },
    s3: { name: 'Slide 3', order: 'a2' },
  },
  frames: {
    's1-pt': slide('s1', '#FFF6E8FF'),
    's2-pt': slide('s2', '#15121AFF'),
    's3-pt': slide('s3', '#FF48B0FF'),
  },
  nodes: {
    photo: {
      type: 'graphic',
      parentId: 's1-pt',
      link: 'photo',
      index: 'a0',
      name: 'Photo',
      props: {
        x: 80,
        y: 80,
        width: 920,
        height: 760,
        shape: { kind: 'rect', cornerRadius: 40 },
        fills: [{ type: 'image', assetId, fit: 'fill' }],
      },
    },
    title: {
      type: 'text',
      parentId: 's1-pt',
      link: 'title',
      index: 'a1',
      name: 'Title',
      role: 'headline',
      props: {
        x: 80,
        y: 960,
        width: 920,
        height: 140,
        text: 'Spring drop',
        style: { fontFamily: 'Noto Sans', fontSize: 110, fontWeight: 800, color: '#15121AFF' },
      },
    },
    offer: {
      type: 'text',
      parentId: 's2-pt',
      link: 'offer',
      index: 'a0',
      name: 'Offer',
      props: {
        x: 80,
        y: 600,
        width: 920,
        height: 140,
        text: '30% off',
        style: { fontFamily: 'Noto Sans', fontSize: 120, fontWeight: 800, color: '#FFFFFFFF' },
      },
    },
    badge: {
      type: 'graphic',
      parentId: 's3-pt',
      link: 'badge',
      index: 'a0',
      name: 'Badge',
      props: {
        x: 340,
        y: 300,
        width: 400,
        height: 400,
        shape: { kind: 'star', points: 10, innerRadius: 0.75 },
        fills: [{ type: 'solid', color: '#FFD23FFF' }],
      },
    },
    cta: {
      type: 'text',
      parentId: 's3-pt',
      link: 'cta',
      index: 'a1',
      name: 'Call to action',
      props: {
        x: 80,
        y: 900,
        width: 920,
        height: 120,
        text: 'Shop now',
        style: { fontFamily: 'Noto Sans', fontSize: 96, fontWeight: 700, color: '#15121AFF' },
      },
    },
  },
})

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

async function nodeExport(page: Page, assetId: string) {
  const ck = await loadCanvasKit()
  const json = JSON.parse(await designOf(page)) as unknown
  const stored = new Uint8Array(await (await page.request.get(`/brands/dev-brand-coffee/assets/${assetId}`)).body())
  const bytes = { ...fixtureResources(), images: { [assetId]: stored } }
  return (request: { frameIds: string[]; type: 'png' | 'jpg'; quality?: number }) =>
    exportDesign(ck, json, request, bytes).bytes
}

test('every frame of a page as PNG is one flat zip whose files are what Node exports, drawn in the export worker, named after the frames or by the File names field', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  const dialog = page.getByTestId('export')
  await expect(dialog).toBeVisible()
  // Every frame of every page, until the export is narrowed.
  await expect(page.getByTestId('export-run')).toHaveText('Export 10 files')
  await dialog.getByRole('radio', { name: 'This page' }).click()
  await choose(page.getByTestId('export-page'), 'p1')
  await expect(page.getByTestId('export-run')).toHaveText('Export 5 files')
  writeOutput('export-0-menu.png', await page.screenshot())

  await watchWorkers(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  expect(download.suggestedFilename()).toBe('Spring drop.zip')
  const zipped = new Uint8Array(readFileSync(await download.path()))

  // One file per frame, in the page's frame order, each named after its frame, with no folders.
  const entries = readZip(zipped)
  expect(entries.map((e) => e.path)).toEqual(SIZES.map((size) => fileOf(size.name)))
  const node = await nodeExport(page, asset.id)
  for (const [i, frameId] of framesOn('p1').entries()) {
    const browserFile = entries[i]?.bytes
    expect(browserFile, frameId).toBeDefined()
    expect(
      Buffer.from(browserFile ?? []).equals(Buffer.from(node({ frameIds: [frameId], type: 'png' }))),
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

  // Every page: the second page's frames have the same names, so each gets a number.
  await dialog.getByRole('radio', { name: 'All 2' }).click()
  await expect(page.getByTestId('export-run')).toHaveText('Export 10 files')
  const [all] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  expect(readZip(new Uint8Array(readFileSync(await all.path()))).map((e) => e.path)).toEqual([
    ...SIZES.map((size) => fileOf(size.name)),
    ...SIZES.map((size) => fileOf(size.name, 2)),
  ])

  // The File names field names every file in the zip from its page and frame.
  await page.getByTestId('export-name').fill('{page} for {frame}')
  await expect(page.getByTestId('export-run')).toHaveText('Export 10 files')
  const [named] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  const names = readZip(new Uint8Array(readFileSync(await named.path())))
    .map((e) => e.path)
    .sort()
  expect(names).toEqual(
    ['Hero', 'Offer']
      .flatMap((pageName) => SIZES.map((size) => `${pageName} for ${size.name.replace(':', '-')}.png`))
      .sort(),
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

test("every page of a carousel as PNG is one zip whose files are each what Node exports of that page's frame", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, carousel(asset.id))
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  const dialog = page.getByTestId('export')
  // Every page, as the export opens.
  await expect(dialog.getByRole('radio', { name: 'All 3' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('export-run')).toHaveText('Export 3 files')
  writeOutput('export-5-carousel-menu.png', await page.screenshot())
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  expect(download.suggestedFilename()).toBe('Spring carousel.zip')
  const entries = readZip(new Uint8Array(readFileSync(await download.path())))
  expect(entries).toHaveLength(3)

  // Each file is its own page's frame, byte for byte what Node exports of that frame alone.
  const node = await nodeExport(page, asset.id)
  for (const [i, frameId] of ['s1-pt', 's2-pt', 's3-pt'].entries()) {
    const browserFile = Buffer.from(entries[i]?.bytes ?? [])
    expect(
      browserFile.equals(Buffer.from(node({ frameIds: [frameId], type: 'png' }))),
      `file ${i + 1} is ${frameId} as Node exports it`,
    ).toBe(true)
    writeOutput(`export-6-carousel-${frameId}.png`, browserFile)
  }
  expect(new Set(entries.map((e) => Buffer.from(e.bytes).toString('base64'))).size).toBe(3)
  // The three frames share a name: the second and third get a number.
  expect(entries.map((e) => e.path)).toEqual([1, 2, 3].map((n) => fileOf('Portrait 4:5', n)))
  expect(errors).toEqual([])
})

test("one page's only frame as JPG downloads as itself, at the quality picked, the same bytes as Node", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, carousel(asset.id))
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  await page.getByTestId('export').getByRole('radio', { name: 'This page' }).click()
  await choose(page.getByTestId('export-page'), 's2')
  await page.locator('[data-type="jpg"]').click()
  await page.getByTestId('export-quality').fill('70')
  await page.getByTestId('export-quality').press('Enter')
  await expect(page.getByTestId('export-run')).toHaveText('Export 1 file')
  writeOutput('export-3-jpg-menu.png', await page.screenshot())
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  expect(download.suggestedFilename()).toBe(fileOf('Portrait 4:5', 1, 'jpg'))
  const jpg = readFileSync(await download.path())
  const node = await nodeExport(page, asset.id)
  expect(jpg.equals(Buffer.from(node({ frameIds: ['s2-pt'], type: 'jpg', quality: 70 })))).toBe(true)
  // Lower quality is a smaller file.
  expect(jpg.length).toBeLessThan(node({ frameIds: ['s2-pt'], type: 'jpg', quality: 100 }).length)
  writeOutput('export-4-offer.jpg', jpg)
  expect(errors).toEqual([])
})
