// Resizing paths in Chromium, with real pointer input (#278): a path dragged by a corner handle,
// one drawn before paths had a size, and a group of paths (as an SVG places) all scale their
// drawing with their boxes in one undo step, and the export draws what the stage shows.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { placed, screenPoint, writeOutput } from '../support/editor.ts'
import { click, dragScreen, handle, openStage, press, read } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

const TRIANGLE = 'M0 0 L200 0 L100 160 Z'
const path = (name: string, parentId: string, index: string, x: number, y: number, color: string, sized: boolean) => ({
  type: 'graphic', parentId, index, name,
  props: { x, y, width: 200, height: 160, shape: { kind: 'path', d: TRIANGLE, ...(sized ? { size: { width: 200, height: 160 } } : {}) }, fills: [{ type: 'solid', color }] },
}) as DesignInput['nodes'][string]
const design: DesignInput = {
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Path resize', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    pen: path('Pen', 'p1', 'a0', 100, 100, '#E02020FF', true),
    old: path('Old', 'p1', 'a1', 600, 100, '#2050E0FF', false),
    logo: { type: 'group', parentId: 'p1', index: 'a2', name: 'Logo', props: { x: 100, y: 500, width: 420, height: 160 } },
    left: path('Left', 'logo', 'a0', 100, 500, '#10A060FF', true),
    right: path('Right', 'logo', 'a1', 320, 500, '#F0A020FF', true),
  },
  overrides: {},
}

/** The colour the export draws at a design pixel of the square. */
const exported = (page: Page, x: number, y: number) => page.evaluate(({ x, y }) => {
  const pixels = window.dazbee?.exportPixels()
  const at = (y * 1080 + x) * 4
  return pixels ? [pixels[at], pixels[at + 1], pixels[at + 2]] : null
}, { x, y })
/** A layer's props as the square shows them: the base with the square's own. */
const props = async (page: Page, id: string) => placed(await read(page), id, 'sq') as { width: number; height: number; shape: { size?: { width: number; height: number } } }

/** Drags the selection's south-east handle by a design offset. */
async function stretch(page: Page, dx: number, dy: number) {
  const from = await handle(page, 'se')
  const zoom = await page.evaluate(() => window.dazbee?.camera().zoom ?? 1)
  await dragScreen(page, from, { x: from.x + dx * zoom, y: from.y + dy * zoom })
}

test('a path dragged by its corner scales its drawing, in one undo step', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  await click(page, 200, 140)
  // Twice as big: the apex goes from y 260 to y 420.
  await stretch(page, 200, 160)
  expect(await props(page, 'pen')).toMatchObject({ width: 400, height: 320, shape: { size: { width: 200, height: 160 } } })
  expect(await exported(page, 300, 400)).toEqual([224, 32, 32])
  expect(await exported(page, 480, 110)).toEqual([224, 32, 32])
  writeOutput('path-resize-1-pen.png', await page.screenshot())
  await press(page, 'undo')
  expect(await props(page, 'pen')).toMatchObject({ width: 200, height: 160 })
  expect(await exported(page, 300, 400)).toEqual([255, 255, 255])
  expect(errors).toEqual([])
})

test('a resized path edits from where its points are drawn', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  await click(page, 200, 140)
  await stretch(page, 200, 160)
  // Its points are drawn at 100,100, 500,100 and 300,420; the editor shows them there.
  await press(page, 'editPoints')
  const dot = page.locator('.path-anchor[data-anchor="0:1"]')
  const box = await dot.boundingBox()
  const want = await screenPoint(page, 500, 100)
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - want.x)).toBeLessThan(2)
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) / 2 - want.y)).toBeLessThan(2)
  // Dragging one moves it alone: the others stay where they are drawn.
  const zoom = await page.evaluate(() => window.dazbee?.camera().zoom ?? 1)
  await dragScreen(page, want, { x: want.x + 40 * zoom, y: want.y })
  const pen = await props(page, 'pen') as unknown as { x: number; y: number; width: number; height: number; shape: { d: string; size: { width: number; height: number } } }
  expect(pen.shape.size).toEqual({ width: pen.width, height: pen.height })
  const points = [...pen.shape.d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [Number(m[1]) + pen.x, Number(m[2]) + pen.y])
  expect(points.slice(0, 3).map(([x, y]) => [Math.round(x ?? 0), Math.round(y ?? 0)])).toEqual([[100, 100], [540, 100], [300, 420]])
  writeOutput('path-resize-4-edited.png', await page.screenshot())
  expect(errors).toEqual([])
})

test('a path drawn before paths had a size gets one on its first resize, and scales', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  await click(page, 700, 140)
  await stretch(page, 100, 80)
  expect(await props(page, 'old')).toMatchObject({ width: 300, height: 240, shape: { size: { width: 200, height: 160 } } })
  // The apex moves from y 260 down to y 340.
  expect(await exported(page, 750, 320)).toEqual([32, 80, 224])
  writeOutput('path-resize-2-old.png', await page.screenshot())
  // One undo takes the size and the box back together.
  await press(page, 'undo')
  expect((await props(page, 'old')).shape.size).toBeUndefined()
  expect(await props(page, 'old')).toMatchObject({ width: 200, height: 160 })
  expect(errors).toEqual([])
})

test('a group of paths scales every path in it', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  const at = await screenPoint(page, 200, 540)
  await page.mouse.click(at.x, at.y)
  await page.evaluate(() => window.dazbee?.drawn())
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['logo'])
  // Half as wide again and as tall: 630 × 240.
  await stretch(page, 210, 80)
  expect(await props(page, 'left')).toMatchObject({ width: 300, height: 240 })
  expect(await props(page, 'right')).toMatchObject({ width: 300, height: 240 })
  // Each apex goes down 80: the left one to 250,740, the right one to 580,740.
  expect(await exported(page, 250, 725)).toEqual([16, 160, 96])
  expect(await exported(page, 580, 725)).toEqual([240, 160, 32])
  writeOutput('path-resize-3-group.png', await page.screenshot())
  await press(page, 'undo')
  expect(await props(page, 'left')).toMatchObject({ width: 200, height: 160 })
  expect(await exported(page, 250, 725)).toEqual([255, 255, 255])
  expect(errors).toEqual([])
})
