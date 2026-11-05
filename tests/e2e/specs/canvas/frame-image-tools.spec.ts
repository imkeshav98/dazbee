// The frame, box and image tools, with real pointer and keyboard input: F draws an empty frame
// where it is dragged, and one dragged past the size limits keeps its shape; the shape menu's Box draws a box, and one drawn around layers takes them in
// without moving them, their copies in the wide frame staying as they were; Mod+Alt+G and the
// Arrange card box the selection; Shift+A on shapes wraps them in an auto layout box where they
// stand; I opens the image picker, and the image picked lands where the stage is clicked, one undo
// step.
import type { DesignInput } from '@dazbee/schema'

import { photo } from '../../support/assets.ts'
import { writeOutput } from '../../support/editor.ts'
import { copyIn, frameDesign, linkedFrames, type Seeded } from '../../support/seed.ts'
import { type Box, boxOf, click, drag, openStage, press, read, selection } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { moreAction } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

type Node = Seeded
const rect = (name: string, index: string, x: number, y: number, width: number, height: number, color: string): Node =>
  ({
    type: 'graphic',
    parentId: 'sq',
    index,
    name,
    props: { x, y, width, height, shape: { kind: 'rect', cornerRadius: 12 }, fills: [{ type: 'solid', color }] },
  }) as Node

/** A square frame of layers, and a wide frame of their linked copies, with A and B apart and A smaller there. */
const design = (): DesignInput =>
  linkedFrames(
    frameDesign({
      name: 'Frames',
      fills: [{ type: 'solid', color: '#FFF8F0FF' }],
      nodes: {
        a: rect('A', 'a0', 100, 100, 160, 120, '#FF2E7EFF'),
        b: {
          ...rect('B', 'a1', 300, 140, 120, 120, '#2F6BFFFF'),
          props: { ...rect('B', 'a1', 300, 140, 120, 120, '#2F6BFFFF').props, rotation: 15 },
        } as Node,
        c: rect('C', 'a2', 600, 100, 140, 140, '#FFB020FF'),
        d: rect('D', 'a3', 780, 160, 160, 100, '#00A88AFF'),
        // A row, tops lined up, 40 apart: auto layout reads it as it stands.
        e: rect('E', 'a4', 120, 600, 200, 160, '#9747FFFF'),
        f: rect('F', 'a5', 360, 600, 120, 100, '#1F2329FF'),
      },
    }),
    [
      {
        id: 'wide',
        name: 'Wide',
        width: 1920,
        height: 1080,
        values: { a: { x: 900, y: 500, width: 80, height: 60 }, b: { x: 1300, y: 600 } },
      },
    ],
  )

const near = (a: Box, b: Box) => {
  for (const k of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs(a[k] - b[k]), `${k}: ${a[k]} vs ${b[k]}`).toBeLessThanOrEqual(0.5)
}
/** The wide frame's layers as the design stores them. */
const wideLayers = async (page: Page) =>
  Object.entries((await read(page)).nodes).filter(([, n]) => n.parentId === 'wide' || n.parentId.startsWith('wide-'))
const frameIds = async (page: Page) => Object.keys((await read(page)).frames).sort()
/** Picks a tool from the dock's shape menu. */
const pick = async (page: Page, shape: string) => {
  await page.getByTestId('shape-menu').click()
  await page.locator(`[role="menu"] [data-shape="${shape}"]`).click()
}
const childrenOf = async (page: Page, parentId: string) =>
  Object.entries((await read(page)).nodes)
    .filter(([, n]) => n.parentId === parentId)
    .sort(([, x], [, y]) => (x.index < y.index ? -1 : 1))
    .map(([id]) => id)

test('F draws an empty frame where dragged and a click adds none; the Box tool draws a box, and one drawn around layers takes them in without moving them', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  const before = { a: await boxOf(page, 'a'), b: await boxOf(page, 'b') }
  const layers = Object.keys((await read(page)).nodes).length

  // F and a drag: an empty white frame named Frame on the page, where dragged, picked with no
  // layer selected, and the select tool comes back.
  await press(page, 'toolFrame')
  await expect(page.locator('[data-tool="frame"]')).toHaveAttribute('aria-pressed', 'true')
  await drag(page, { x: 600, y: 400 }, { x: 900, y: 520 })
  const [drawnFrame = ''] = (await frameIds(page)).filter((id) => id !== 'sq' && id !== 'wide')
  expect((await read(page)).frames[drawnFrame]).toMatchObject({
    pageId: 'p1',
    name: 'Frame',
    x: 600,
    y: 400,
    width: 300,
    height: 120,
    fills: [{ type: 'solid', color: '#FFFFFFFF' }],
  })
  expect(Object.keys((await read(page)).nodes)).toHaveLength(layers)
  expect(await selection(page)).toEqual([])
  expect(await page.evaluate(() => window.dazbee?.pickedFrame())).toBe(drawnFrame)
  expect(await page.evaluate(() => window.dazbee?.tool())).toBe('select')
  await expect(page.locator('[data-tool="select"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator(`.frame-label[data-frame="${drawnFrame}"]`)).toContainText('Frame')
  writeOutput('frame-1-drawn.png', await page.screenshot({ animations: 'disabled' }))
  // One undo step takes it away.
  await press(page, 'undo')
  expect(await frameIds(page)).toEqual(['sq', 'wide'])

  // A click with the Frame tool adds nothing and keeps the tool, so the Add a frame card stays open.
  await press(page, 'toolFrame')
  await click(page, 700, 800)
  expect(await frameIds(page)).toEqual(['sq', 'wide'])
  expect(Object.keys((await read(page)).nodes)).toHaveLength(layers)
  expect(await page.evaluate(() => window.dazbee?.tool())).toBe('frame')

  // A click with the Box tool draws a box of the default size, centred on it.
  await pick(page, 'box')
  await click(page, 700, 800)
  const [clicked] = await selection(page)
  expect((await read(page)).nodes[clicked ?? '']).toMatchObject({
    type: 'box',
    parentId: 'sq',
    name: 'Box',
    props: { x: 600, y: 700, width: 200, height: 200, fills: [{ type: 'solid', color: '#FFFFFFFF' }] },
  })
  await press(page, 'undo')
  const wideBefore = await wideLayers(page)

  // Around A and the turned B: both go inside it, and neither moves on the stage.
  await pick(page, 'box')
  await drag(page, { x: 80, y: 80 }, { x: 460, y: 300 })
  const [box] = await selection(page)
  expect(await childrenOf(page, box ?? '')).toEqual(['a', 'b'])
  near(await boxOf(page, 'a'), before.a)
  near(await boxOf(page, 'b'), before.b)
  // C, outside it, stays at the top of the square.
  expect((await read(page)).nodes.c?.parentId).toBe('sq')
  // The box is the square's only: the wide frame's copies of A and B stay as they were.
  expect((await read(page)).nodes[box ?? '']?.parentId).toBe('sq')
  expect(await wideLayers(page)).toEqual(wideBefore)
  expect((await read(page)).nodes[copyIn('wide', 'a')]?.parentId).toBe('wide')
  writeOutput('frame-2-around.png', await page.screenshot({ animations: 'disabled' }))
  await press(page, 'undo')
  expect((await read(page)).nodes.a?.parentId).toBe('sq')
  expect((await read(page)).nodes[box ?? '']).toBeUndefined()
  expect(errors).toEqual([])
})

test('a frame dragged out far past the size limits keeps the shape dragged, scaled to fit them', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  // Zoomed far out, a wide drag on screen spans 35000 × 10000 design pixels.
  await page.evaluate(() => window.dazbee?.setCamera({ x: 50, y: 150, zoom: 0.02 }))
  await page.evaluate(() => window.dazbee?.drawn())
  await press(page, 'toolFrame')
  await drag(page, { x: 10000, y: 10000 }, { x: 45000, y: 20000 })
  const [drawnFrame = ''] = (await frameIds(page)).filter((id) => id !== 'sq' && id !== 'wide')
  // 3.5 times as wide as tall, as dragged, with its long side at the most a frame may have.
  expect((await read(page)).frames[drawnFrame]).toMatchObject({ x: 10000, y: 10000, width: 8000, height: 2286 })
  expect(errors).toEqual([])
})

test('Mod+Alt+G and the Arrange card box the selection; Shift+A wraps shapes in auto layout without moving them', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  const before = {
    c: await boxOf(page, 'c'),
    d: await boxOf(page, 'd'),
    e: await boxOf(page, 'e'),
    f: await boxOf(page, 'f'),
  }

  await click(page, 660, 160)
  await click(page, 860, 210, ['Shift'])
  expect(await selection(page)).toEqual(['c', 'd'])
  await press(page, 'boxSelection')
  const [boxed] = await selection(page)
  let now = await read(page)
  expect(now.nodes[boxed ?? '']).toMatchObject({
    type: 'box',
    name: 'Box',
    props: { x: 600, y: 100, width: 340, height: 160, clip: false, fills: [] },
  })
  expect(await childrenOf(page, boxed ?? '')).toEqual(['c', 'd'])
  near(await boxOf(page, 'c'), before.c)
  near(await boxOf(page, 'd'), before.d)
  writeOutput('frame-3-selection.png', await page.screenshot({ animations: 'disabled' }))
  await press(page, 'undo')
  expect((await read(page)).nodes.c?.parentId).toBe('sq')

  // The same from the full menu's Put in a box; undo and redo take the box away and back in one step.
  await click(page, 660, 160)
  await click(page, 860, 210, ['Shift'])
  await moreAction(page, 'Put in a box')
  const [carded] = await selection(page)
  expect((await read(page)).nodes[carded ?? '']).toMatchObject({ type: 'box', name: 'Box' })
  expect(await childrenOf(page, carded ?? '')).toEqual(['c', 'd'])
  await press(page, 'undo')
  now = await read(page)
  expect(now.nodes[carded ?? '']).toBeUndefined()
  expect([now.nodes.c?.parentId, now.nodes.d?.parentId]).toEqual(['sq', 'sq'])
  await press(page, 'redo')
  expect((await read(page)).nodes[carded ?? '']).toMatchObject({ type: 'box', name: 'Box' })
  expect(await childrenOf(page, carded ?? '')).toEqual(['c', 'd'])
  near(await boxOf(page, 'c'), before.c)
  near(await boxOf(page, 'd'), before.d)
  await press(page, 'undo')

  // Shift+A on two shapes: an auto layout box that hugs them, laid out as they stand.
  await click(page, 220, 680)
  await click(page, 420, 650, ['Shift'])
  await press(page, 'autoLayout')
  const [auto] = await selection(page)
  now = await read(page)
  expect(now.nodes[auto ?? '']?.props).toMatchObject({
    layout: { direction: 'row', gap: 40, align: 'start' },
    sizing: { width: 'hug', height: 'hug' },
  })
  expect(await childrenOf(page, auto ?? '')).toEqual(['e', 'f'])
  near(await boxOf(page, 'e'), before.e)
  near(await boxOf(page, 'f'), before.f)
  near(await boxOf(page, auto ?? ''), { x: 120, y: 600, width: 360, height: 160 })
  writeOutput('frame-4-auto-layout.png', await page.screenshot({ animations: 'disabled' }))
  // With a box among the selection, Shift+A switches that box's auto layout instead: off here, and C stays at the top of the square.
  await click(page, 660, 160, ['Shift'])
  expect(await selection(page)).toEqual([auto, 'c'])
  await press(page, 'autoLayout')
  now = await read(page)
  expect(now.nodes[auto ?? '']?.props.layout).toBeUndefined()
  expect(now.nodes.c?.parentId).toBe('sq')
  await press(page, 'undo')
  // One undo step for the whole wrap.
  await press(page, 'undo')
  expect((await read(page)).nodes[auto ?? '']).toBeUndefined()
  expect((await read(page)).nodes.e?.parentId).toBe('sq')
  expect(errors).toEqual([])
})

test('I opens the image picker; the image uploaded there lands where the stage is clicked, one undo step', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await press(page, 'toolImage')
  const picker = page.getByTestId('image-picker')
  await expect(picker).toBeVisible()
  await expect(page.locator('[data-tool="image"]')).toHaveAttribute('aria-pressed', 'true')
  writeOutput('image-1-picker.png', await page.screenshot({ animations: 'disabled' }))
  await picker
    .locator('input[type="file"]')
    .setInputFiles({ name: 'sneaker.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo) })
  // Picked: the picker goes and the stage waits for a click.
  await expect(picker).toBeHidden({ timeout: 30_000 })
  expect(await page.evaluate(() => window.dazbee?.imageArmed())).toBe(true)
  const layers = Object.keys((await read(page)).nodes).length

  await click(page, 540, 800)
  const [placed] = await selection(page)
  const node = (await read(page)).nodes[placed ?? ''] as unknown as {
    props: { x: number; y: number; width: number; height: number; fills: { type: string; assetId?: string }[] }
  }
  const uploaded = node.props.fills[0]?.assetId ?? ''
  expect(node.props.fills[0]?.type).toBe('image')
  // Centred on the click, at most half the frame across.
  expect(Math.abs(node.props.x + node.props.width / 2 - 540)).toBeLessThanOrEqual(1)
  expect(Math.abs(node.props.y + node.props.height / 2 - 800)).toBeLessThanOrEqual(1)
  expect(node.props.width).toBeLessThanOrEqual(540)
  expect(await page.evaluate(() => window.dazbee?.tool())).toBe('select')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('image-2-placed.png', await page.screenshot({ animations: 'disabled' }))

  await press(page, 'undo')
  expect((await read(page)).nodes[placed ?? '']).toBeUndefined()
  expect(Object.keys((await read(page)).nodes).length).toBe(layers)

  // The image uploaded, picked in the picker, covers the box dragged on the stage.
  await press(page, 'toolImage')
  await expect(picker).toBeVisible()
  await picker.locator(`[data-asset="${uploaded}"] button`).click()
  await expect(picker).toBeHidden()
  await drag(page, { x: 100, y: 850 }, { x: 400, y: 1000 })
  const [dragged] = await selection(page)
  expect((await read(page)).nodes[dragged ?? '']).toMatchObject({
    props: { x: 100, y: 850, width: 300, height: 150, fills: [{ type: 'image', fit: 'fill' }] },
  })
  writeOutput('image-3-dragged.png', await page.screenshot({ animations: 'disabled' }))
  await press(page, 'undo')

  // Pressing I again and closing the picker goes back to the select tool.
  await press(page, 'toolImage')
  await expect(picker).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  expect(await page.evaluate(() => window.dazbee?.tool())).toBe('select')
  expect(errors).toEqual([])
})
