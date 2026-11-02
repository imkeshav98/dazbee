// Resizing paths in Chromium, with real pointer input (#278): a path dragged by a corner handle,
// one with no box it was drawn in, and a group of paths (as an SVG places) all scale their
// drawing with their boxes in one undo step, and the export draws what the stage shows.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { placed, screenPoint, writeOutput } from '../support/editor.ts'
import { click, dragScreen, handle, openStage, press, read } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

const TRIANGLE = 'M0 0 L200 0 L100 160 Z'
const path = (name: string, parentId: string, index: string, x: number, y: number, color: string, sized: boolean) => ({
  type: 'graphic', parentId, index, name,
  props: { x, y, width: 200, height: 160, shape: { kind: 'path', d: TRIANGLE, ...(sized ? { drawnIn: { width: 200, height: 160 } } : {}) }, fills: [{ type: 'solid', color }] },
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
const props = async (page: Page, id: string) => placed(await read(page), id, 'sq') as { width: number; height: number; shape: { drawnIn?: { width: number; height: number } } }

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
  expect(await props(page, 'pen')).toMatchObject({ width: 400, height: 320, shape: { drawnIn: { width: 200, height: 160 } } })
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
  const pen = await props(page, 'pen') as unknown as { x: number; y: number; width: number; height: number; shape: { d: string; drawnIn: { width: number; height: number } } }
  expect(pen.shape.drawnIn).toEqual({ width: pen.width, height: pen.height })
  const points = [...pen.shape.d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [Number(m[1]) + pen.x, Number(m[2]) + pen.y])
  expect(points.slice(0, 3).map(([x, y]) => [Math.round(x ?? 0), Math.round(y ?? 0)])).toEqual([[100, 100], [540, 100], [300, 420]])
  writeOutput('path-resize-4-edited.png', await page.screenshot())
  expect(errors).toEqual([])
})

test('a path with no box it was drawn in takes its box on its first resize, and scales', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  await click(page, 700, 140)
  await stretch(page, 100, 80)
  expect(await props(page, 'old')).toMatchObject({ width: 300, height: 240, shape: { drawnIn: { width: 200, height: 160 } } })
  // The apex moves from y 260 down to y 340.
  expect(await exported(page, 750, 320)).toEqual([32, 80, 224])
  writeOutput('path-resize-2-old.png', await page.screenshot())
  // One undo takes the box it was drawn in and the new box back together.
  await press(page, 'undo')
  expect((await props(page, 'old')).shape.drawnIn).toBeUndefined()
  expect(await props(page, 'old')).toMatchObject({ width: 200, height: 160 })
  expect(errors).toEqual([])
})

test('an SVG placed as layers scales with its group, export included', async ({ browser }) => {
  const { page, errors } = await openStage(browser, { ...design, nodes: {} })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(() => navigator.clipboard.writeText('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><path d="M0 0H100V100Z" fill="#E02020"/><circle cx="150" cy="50" r="50" fill="#2050E0"/></svg>'))
  const middle = await screenPoint(page, 540, 540)
  await page.mouse.click(middle.x, middle.y)
  await page.keyboard.press('Control+v')
  await expect.poll(async () => Object.keys((await read(page)).nodes).length).toBe(3)
  // Placed at its own size in the middle of the square: 440,490 to 640,590.
  const [groupId] = await page.evaluate(() => window.dazbee?.selection() ?? [])
  expect(await props(page, groupId ?? '')).toMatchObject({ x: 440, y: 490, width: 200, height: 100 })
  await stretch(page, 200, 100)
  // Twice the size: the circle's middle is now 740,590, its edge 90 further right.
  expect(await exported(page, 740, 590)).toEqual([32, 80, 224])
  expect(await exported(page, 830, 590)).toEqual([32, 80, 224])
  writeOutput('path-resize-5-svg.png', await page.screenshot())
  await press(page, 'undo')
  expect(await exported(page, 830, 590)).toEqual([255, 255, 255])
  expect(errors).toEqual([])
})

test('Shift keeps the shape, Alt resizes from the middle, and the W field scales it too', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  await click(page, 200, 140)
  // Shift: the drag goes 200 across and 40 down, and the box keeps 200 × 160 at twice the size.
  const from = await handle(page, 'se')
  const zoom = await page.evaluate(() => window.dazbee?.camera().zoom ?? 1)
  await dragScreen(page, from, { x: from.x + 200 * zoom, y: from.y + 40 * zoom }, ['Shift'])
  const kept = await props(page, 'pen')
  expect(kept.width / kept.height).toBeCloseTo(200 / 160, 2)
  expect(kept.width).toBeGreaterThan(200)
  expect(await exported(page, Math.round(100 + kept.width / 2), Math.round(100 + kept.height - 15))).toEqual([224, 32, 32])
  await press(page, 'undo')

  // Alt: 50 across and 40 down from the middle, so 300 × 240 about the same centre.
  const corner = await handle(page, 'se')
  await dragScreen(page, corner, { x: corner.x + 50 * zoom, y: corner.y + 40 * zoom }, ['Alt'])
  expect(await props(page, 'pen')).toMatchObject({ x: 50, y: 60, width: 300, height: 240 })
  // The apex is at 200,300, and the top left corner reaches 50,60.
  expect(await exported(page, 200, 285)).toEqual([224, 32, 32])
  expect(await exported(page, 60, 65)).toEqual([224, 32, 32])
  writeOutput('path-resize-6-alt.png', await page.screenshot())
  await press(page, 'undo')

  // The W field: twice as wide, the same height; the far corner is drawn at 500,100.
  const width = page.getByTestId('layout-card').getByRole('spinbutton', { name: 'Width' })
  await width.fill('400')
  await width.press('Enter')
  await page.evaluate(() => window.dazbee?.drawn())
  expect(await props(page, 'pen')).toMatchObject({ width: 400, height: 160 })
  expect(await exported(page, 490, 105)).toEqual([224, 32, 32])
  // Undo is the editor's once the field lets go of the keyboard.
  await width.blur()
  await press(page, 'undo')
  expect(await props(page, 'pen')).toMatchObject({ width: 200 })
  expect(await exported(page, 490, 105)).toEqual([255, 255, 255])
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
