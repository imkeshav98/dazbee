// What each redraw of the infinite canvas (#36) draws and records, for five formats of a 120-layer
// page and a 20-card carousel, panned, dragged and typed into; and what a redraw takes. Needs the
// API and the sync server: `docker compose up -d --wait`.
import type { Camera, DrawInfo } from '@dazbee/editor'
import { framesInView } from '@dazbee/editor/camera'
import type { DesignInput } from '@dazbee/schema'

import { filler, fiveFormats, FORMATS, heroes, merge, open } from '../../support/canvas.ts'
import { writeOutput } from '../../support/editor.ts'
import { PERF, report, spread } from '../../support/perf.ts'
import { drawn } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

/** What one redraw did, and the camera and viewport it drew with. */
interface Redraw extends DrawInfo {
  camera: Camera
  viewport: { width: number; height: number }
}

const FIVE_FORMATS = { pan: { dx: 6, dy: 3 }, dragId: 'p1-box', textId: 'p1-headline' }
const CAROUSEL = { pan: { dx: 0, dy: 24 }, dragId: 'c3-box', textId: 'c3-headline' }

/** A carousel of `cards` pages in five formats. */
const carousel = (cards: number): DesignInput => {
  const pages: DesignInput['pages'] = {}
  const parts = []
  for (let i = 0; i < cards; i++) {
    const id = `c${i}`
    pages[id] = {
      name: `Card ${i + 1}`,
      order: `a${String(i).padStart(2, '0')}`,
      fills: [{ type: 'solid', color: i % 2 ? '#F2F6FFFF' : '#FFF8F0FF' }],
    }
    parts.push(heroes(id, `Card ${i + 1}`), { nodes: filler(id, 10, i * 10) })
  }
  return {
    meta: {
      schemaVersion: 5,
      designId: 'replaced-by-the-api',
      name: 'Carousel',
      kind: 'carousel',
      primaryFormatId: 'sq',
    },
    formats: FORMATS,
    pages,
    ...merge(...parts),
  }
}

/**
 * Waits until the fonts and images the design asked for are here, then for the redraw that follows:
 * one arriving later would drop every frame's picture, and the pictures recorded again would read
 * as work the checks below did not cause.
 */
const settled = (page: Page) =>
  page.evaluate(async () => {
    await window.dazbee?.loaded()
    await window.dazbee?.drawn()
  })

/**
 * Redraws while panning back and forth, dragging a layer in Story and typing into a text every
 * format shows: what each redraw did and the camera it drew with, and the frames on the canvas.
 */
async function redraws(page: Page, opts: { pan: { dx: number; dy: number }; dragId: string; textId: string }) {
  return page.evaluate(async ({ pan, dragId, textId }) => {
    const editor = window.dazbee
    if (!editor) throw new Error('no editor')
    /** Makes a change, then waits for the redraw that shows it. */
    const redraw = (change: () => void) =>
      new Promise<Redraw>((resolve) => {
        const stop = editor.onDraw((_d, _at, info) => {
          stop()
          resolve({ ...info, camera: { ...editor.camera() }, viewport: { ...editor.viewport() } })
        })
        change()
      })
    await editor.drawn()
    const frames = editor.frames()
    const panning: Redraw[] = []
    // Back and forth, ending where it started.
    for (let i = 0; i < 100; i++) {
      const sign = Math.floor(i / 25) % 2 ? -1 : 1
      const c = editor.camera()
      panning.push(await redraw(() => editor.setCamera({ ...c, x: c.x + sign * pan.dx, y: c.y + sign * pan.dy })))
    }
    const dragging: Redraw[] = []
    const end = editor.session.beginGesture()
    for (let i = 0; i < 65; i++) {
      dragging.push(
        await redraw(() =>
          editor.session.run('node.update', {
            ids: [dragId],
            scope: 'format:story',
            patch: { x: 100 + i * 3, y: 100 + i },
          }),
        ),
      )
    }
    end()
    const typing: Redraw[] = []
    for (let i = 0; i < 35; i++) {
      typing.push(
        await redraw(() => editor.session.run('text.edit', { id: textId, op: { kind: 'insert', at: 0, text: 'a' } })),
      )
    }
    return { frames, pan: panning, drag: dragging, type: typing }
  }, opts)
}

type Work = Awaited<ReturnType<typeof redraws>>

/** The keys of the frames a redraw had in view, culled as the editor culls them. */
const inView = (work: Work, draw: Redraw) =>
  framesInView(work.frames, draw.camera, draw.viewport).map((frame) => frame.key)
/** How many frames in view a redraw had of one page. */
const ofPage = (work: Work, draw: Redraw, pageId: string) =>
  inView(work, draw).filter((key) => key.startsWith(`${pageId}/`)).length

/**
 * The work the redraws did. Every frame was drawn, all in view, once the fonts and images had
 * settled, so each has its picture: a pan draws at least the frames in view and records none, a
 * drag records the one frame it is in, and typing records each frame in view that shows the text,
 * once per redraw. Soft checks, so a break shows in each of them.
 */
function expectWork(work: Work, frames: number, pageId: string) {
  expect
    .soft(
      work.pan.map((draw) => ({
        frames: draw.frames,
        inViewDrawn: draw.drawn >= inView(work, draw).length,
        recorded: draw.recorded,
      })),
      'pan',
    )
    .toEqual(work.pan.map(() => ({ frames, inViewDrawn: true, recorded: 0 })))
  expect
    .soft(
      work.drag.every((draw) => inView(work, draw).includes(`${pageId}/story`)),
      'Story in view while dragging',
    )
    .toBe(true)
  expect
    .soft(
      work.drag.map((draw) => draw.recorded),
      'drag',
    )
    .toEqual(work.drag.map(() => 1))
  expect
    .soft(
      work.type.map((draw) => draw.recorded),
      'typing',
    )
    .toEqual(work.type.map((draw) => ofPage(work, draw, pageId)))
}

/** The time each redraw took, past the first five, step by step. */
const timings = (work: Work) => ({
  pan: spread(work.pan.slice(5).map((draw) => draw.ms)),
  drag: spread(work.drag.slice(5).map((draw) => draw.ms)),
  type: spread(work.type.slice(5).map((draw) => draw.ms)),
})

/** Opens the five formats of a 120-layer page, every frame in view, drawn once its fonts and images settled. */
async function openFiveFormats(page: Page) {
  const opened = await open(page, fiveFormats(118))
  await settled(page)
  return opened
}

/**
 * Opens the carousel of 20 cards, drawn with every frame in view once its fonts and images
 * settled, then close enough to read a card: two or three rows on screen.
 */
async function openCarousel(page: Page) {
  const opened = await open(page, carousel(20))
  await settled(page)
  writeOutput('canvas-4-carousel-fit-all.png', await page.screenshot())
  await page.evaluate(() => window.dazbee?.fitFrame('c3', 'story'))
  await drawn(page)
  return opened
}

test('five formats of a 120-layer page: a pan records nothing, a drag one frame, typing each frame once', async ({
  page,
}) => {
  const { errors } = await openFiveFormats(page)
  const layers = await page.evaluate(() => Object.keys(window.dazbee?.design().nodes ?? {}).length)
  expect(layers).toBe(120)
  writeOutput('canvas-3-five-formats-120-layers.png', await page.screenshot())
  const work = await redraws(page, FIVE_FORMATS)
  // Every frame is in view throughout, and every one shows the headline: typing records the five.
  expect(work.pan.every((draw) => inView(work, draw).length === 5)).toBe(true)
  expectWork(work, 5, 'p1')
  expect(work.type.map((draw) => draw.recorded)).toEqual(work.type.map(() => 5))
  expect(errors).toEqual([])
})

test('a 20-card carousel in five formats culls the frames out of view', async ({ page }) => {
  const { errors } = await openCarousel(page)
  expect(await page.evaluate(() => window.dazbee?.frames().length)).toBe(100)
  writeOutput('canvas-5-carousel-card-4.png', await page.screenshot())
  const work = await redraws(page, CAROUSEL)
  // Only the frames in view are drawn: the card's row and its neighbours, not the 100.
  expect(Math.max(...work.pan.map((draw) => draw.drawn))).toBeLessThan(30)
  // Other cards' frames are in view as the text is typed, so a redraw that recorded every frame in
  // view would record more than the card's.
  expect(work.type.every((draw) => inView(work, draw).length > ofPage(work, draw, 'c3'))).toBe(true)
  expectWork(work, 100, 'c3')
  expect(errors).toEqual([])
})

test('five formats of a 120-layer page: what a redraw takes', PERF, async ({ page }) => {
  await openFiveFormats(page)
  report('Canvas, five formats of a 120-layer page, redraw', timings(await redraws(page, FIVE_FORMATS)))
})

test('a 20-card carousel in five formats: what a redraw takes', PERF, async ({ page }) => {
  await openCarousel(page)
  report('Canvas, 20-card carousel in five formats, redraw', timings(await redraws(page, CAROUSEL)))
})
