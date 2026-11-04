// What each redraw of the infinite canvas (#36) draws and records, for a page of five linked frames
// of 120 layers each and a 20-card carousel of such pages, panned, dragged and typed into; and what
// a redraw takes. Needs the API and the sync server: `docker compose up -d --wait`.
import type { Camera, DrawInfo } from '@dazbee/editor'
import { framesInView } from '@dazbee/editor/camera'
import type { DesignInput } from '@dazbee/schema'

import { filler, fiveFrames, heroes, merge, open, withFrames } from '../../support/canvas.ts'
import { writeOutput } from '../../support/editor.ts'
import { PERF, report, spread } from '../../support/perf.ts'
import { copyIn } from '../../support/seed.ts'
import { drawn } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

/** What one redraw did, and the camera and viewport it drew with. */
interface Redraw extends DrawInfo {
  camera: Camera
  viewport: { width: number; height: number }
}

/** What the redraws do: the pan, the layer dragged and its frame, the text typed into and its frame. */
interface Steps {
  pan: { dx: number; dy: number }
  dragId: string
  dragFrame: string
  textId: string
  textFrame: string
}

const FIVE_FRAMES: Steps = {
  pan: { dx: 6, dy: 3 },
  dragId: copyIn('story', 'p1-box'),
  dragFrame: 'story',
  textId: 'p1-headline',
  textFrame: 'sq',
}
const CAROUSEL: Steps = {
  pan: { dx: 0, dy: 24 },
  dragId: copyIn('c3-story', 'c3-box'),
  dragFrame: 'c3-story',
  textId: 'c3-headline',
  textFrame: 'c3-sq',
}

/**
 * A carousel of `cards` pages, each holding five linked frames: a square `c<i>-sq` with its box,
 * headline and ten more layers, and the four other sizes of FRAMES holding their copies.
 */
const carousel = (cards: number): DesignInput => {
  let design: DesignInput = {
    meta: { designId: 'replaced-by-the-api', name: 'Carousel' },
    pages: {},
    frames: {},
    nodes: {},
  }
  for (let i = 0; i < cards; i++) {
    const pageId = `c${i}`
    const frameId = `${pageId}-sq`
    const part = merge(heroes(pageId, frameId, `Card ${i + 1}`), { nodes: filler(pageId, frameId, 10, i * 10) })
    design = {
      ...design,
      pages: { ...design.pages, [pageId]: { name: `Card ${i + 1}`, order: `a${String(i).padStart(2, '0')}` } },
      frames: {
        ...design.frames,
        [frameId]: {
          pageId,
          name: 'Square',
          width: 1080,
          height: 1080,
          x: 0,
          y: 0,
          fills: [{ type: 'solid', color: i % 2 ? '#F2F6FFFF' : '#FFF8F0FF' }],
          order: 'a0',
        },
      },
      nodes: {
        ...design.nodes,
        ...Object.fromEntries(Object.entries(part.nodes).map(([id, node]) => [id, { ...node, link: id }])),
      } as DesignInput['nodes'],
    }
    design = withFrames(design, part, pageId)
  }
  return design
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
 * Redraws while panning back and forth, dragging a layer in one frame and typing into a text in
 * another: what each redraw did and the camera it drew with, and the shown page's frames.
 */
async function redraws(page: Page, steps: Steps) {
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
        await redraw(() => editor.session.run('node.update', { ids: [dragId], patch: { x: 100 + i * 3, y: 100 + i } })),
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
  }, steps)
}

type Work = Awaited<ReturnType<typeof redraws>>

/** The keys of the frames a redraw had in view, culled as the editor culls them. */
const inView = (work: Work, draw: Redraw) =>
  framesInView(work.frames, draw.camera, draw.viewport).map((frame) => frame.key)

/**
 * The work the redraws did. Every frame was drawn, all in view, once the fonts and images had
 * settled, so each has its picture: a pan draws at least the frames in view and records none, a
 * drag records the one frame it is in, and typing records the one frame that holds the text, while
 * it is in view, once per redraw. Soft checks, so a break shows in each of them.
 */
function expectWork(work: Work, frames: number, steps: Steps) {
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
      work.drag.every((draw) => inView(work, draw).includes(steps.dragFrame)),
      `${steps.dragFrame} in view while dragging`,
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
    .toEqual(work.type.map((draw) => (inView(work, draw).includes(steps.textFrame) ? 1 : 0)))
}

/** The time each redraw took, past the first five, step by step. */
const timings = (work: Work) => ({
  pan: spread(work.pan.slice(5).map((draw) => draw.ms)),
  drag: spread(work.drag.slice(5).map((draw) => draw.ms)),
  type: spread(work.type.slice(5).map((draw) => draw.ms)),
})

/** Opens the page of five frames of 120 layers each, every frame in view, drawn once its fonts and images settled. */
async function openFiveFrames(page: Page) {
  const opened = await open(page, fiveFrames(118))
  await settled(page)
  return opened
}

/**
 * Opens the carousel of 20 cards on its first page, drawn with every frame in view once its fonts
 * and images settled, then the fourth card's page, fitted to its Story frame: its Square and
 * Landscape at the sides, its MPU and Leaderboard out of view.
 */
async function openCarousel(page: Page) {
  const opened = await open(page, carousel(20))
  await settled(page)
  writeOutput('canvas-4-carousel-first-card.png', await page.screenshot())
  await page.evaluate(() => window.dazbee?.fitFrame('c3-story'))
  await settled(page)
  await drawn(page)
  return opened
}

test('five frames of 120 layers each: a pan records nothing, a drag one frame, typing one frame', async ({ page }) => {
  const { errors } = await openFiveFrames(page)
  const layers = await page.evaluate(() => Object.keys(window.dazbee?.design().nodes ?? {}).length)
  expect(layers).toBe(600)
  writeOutput('canvas-3-five-frames-120-layers.png', await page.screenshot())
  const work = await redraws(page, FIVE_FRAMES)
  // Every frame is in view throughout; only the square holds the headline typed into.
  expect(work.pan.every((draw) => inView(work, draw).length === 5)).toBe(true)
  expectWork(work, 5, FIVE_FRAMES)
  expect(work.type.map((draw) => draw.recorded)).toEqual(work.type.map(() => 1))
  expect(errors).toEqual([])
})

test('a 20-card carousel shows one card at a time and culls its frames out of view', async ({ page }) => {
  const { errors } = await openCarousel(page)
  expect(await page.evaluate(() => Object.keys(window.dazbee?.design().frames ?? {}).length)).toBe(100)
  expect(await page.evaluate(() => window.dazbee?.shownPage())).toBe('c3')
  expect(await page.evaluate(() => window.dazbee?.frames().map((frame) => frame.key))).toEqual([
    'c3-sq',
    'c3-story',
    'c3-land',
    'c3-mpu',
    'c3-leader',
  ])
  writeOutput('canvas-5-carousel-card-4.png', await page.screenshot())
  const work = await redraws(page, CAROUSEL)
  // Only the card's frames in view are drawn: never all five of its frames, and none of the other cards'.
  expect(work.pan.every((draw) => inView(work, draw).length < 5)).toBe(true)
  expect(Math.max(...work.pan.map((draw) => draw.drawn))).toBeLessThan(5)
  // The card's other frames are in view as the text is typed, so a redraw that recorded every
  // frame in view would record more than the one that holds it.
  expect(work.type.every((draw) => inView(work, draw).length > 1)).toBe(true)
  expectWork(work, 5, CAROUSEL)
  expect(errors).toEqual([])
})

test('five frames of 120 layers each: what a redraw takes', PERF, async ({ page }) => {
  await openFiveFrames(page)
  report('Canvas, five frames of 120 layers each, redraw', timings(await redraws(page, FIVE_FRAMES)))
})

test('a 20-card carousel of five frames each: what a redraw takes', PERF, async ({ page }) => {
  await openCarousel(page)
  report('Canvas, 20-card carousel of five frames each, redraw', timings(await redraws(page, CAROUSEL)))
})
