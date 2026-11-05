// Text resizes as in Canva: a corner scales the text, its box keeping its shape; a side changes
// the width; only a fixed box has top and bottom handles. A drag changes the size shown only, runs
// and shrink to fit included, in one undo step, and stops at 1 px. Text in a group scales with it,
// text in a box doesn't, and text whose style is locked resizes its box only. The texts' linked
// copies in a Story frame keep their own sizes.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../../support/editor.ts'
import { copyIn, frameDesign, linkedFrames, type Seeded } from '../../support/seed.ts'
import { dragScreen, handle, openStage, press, read } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const style = (fontSize: number) => ({ fontFamily: 'Noto Sans', fontSize, fontWeight: 700, color: '#1F2329FF' })
const text = (id: string, props: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  type: 'text',
  parentId: 'sq',
  index: `a${id.length}`,
  name: id,
  ...extra,
  props: {
    x: 80,
    y: 80,
    width: 400,
    height: 80,
    text: 'Summer sale',
    boxMode: 'autoHeight',
    style: style(40),
    ...props,
  },
})
/** The layers in a square frame `sq`, with their linked copies in a Story frame `st`. */
const design = (nodes: Record<string, unknown>): DesignInput =>
  linkedFrames(frameDesign({ name: 'Text handles', nodes: nodes as Record<string, Seeded> }), [
    { id: 'st', name: 'Story', width: 1080, height: 1920 },
  ])

type Props = {
  width: number
  height: number
  boxMode?: string
  style: { fontSize: number; letterSpacing?: number }
  runs?: { start: number; end: number; style: { fontSize?: number } }[]
  shrinkToFit?: { min: number; max: number }
}
/** A layer's values in a frame: the square's layer, or its linked copy in the Story. */
const placed = async (page: Page, id: string, frameId = 'sq') =>
  (await read(page)).nodes[frameId === 'sq' ? id : copyIn(frameId, id)]?.props as unknown as Props
const select = async (page: Page, ids: string[]) => {
  await page.evaluate((ids) => window.dazbee?.select(ids), ids)
  await page.evaluate(() => window.dazbee?.drawn())
}
const handles = (page: Page) =>
  page.locator('.selection .handle').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.handle).sort())
/** Drags a handle of the selection by a distance in design pixels. */
async function dragHandle(page: Page, which: string, dx: number, dy: number, modifiers: ('Shift' | 'Alt')[] = []) {
  const from = await handle(page, which)
  const zoom = await page.evaluate(() => window.dazbee?.camera().zoom ?? 1)
  await dragScreen(page, from, { x: from.x + dx * zoom, y: from.y + dy * zoom }, modifiers)
}

test('one text that grows with its words has no top or bottom handles; a fixed box, a group and several layers have all eight', async ({
  browser,
}) => {
  const { page, errors } = await openStage(
    browser,
    design({
      tall: text('tall', {}),
      wide: text('wide', { y: 300, boxMode: 'autoWidth' }),
      fixed: text('fixed', { y: 500, boxMode: 'fixed', height: 120 }),
    }),
  )
  const sides = ['e', 'ne', 'nw', 'se', 'sw', 'w']
  const all = ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']
  for (const [ids, want] of [
    [['tall'], sides],
    [['wide'], sides],
    [['fixed'], all],
    [['tall', 'wide'], all],
  ] as const) {
    await select(page, [...ids])
    expect(await handles(page), ids.join(' ')).toEqual(want)
  }
  // Auto height picked from the Spacing panel hides them again.
  await select(page, ['fixed'])
  await (await barMenu(page, 'spacing')).locator('[data-testid="text-box-card"] [data-value="autoHeight"]').click()
  await expect.poll(() => handles(page)).toEqual(sides)
  expect(errors).toEqual([])
})

test('a corner scales the text and its box keeps its shape, in its frame only, in one undo step; the label says its size', async ({
  browser,
}) => {
  const { page, errors } = await openStage(
    browser,
    design({
      headline: text('headline', {
        style: { ...style(40), letterSpacing: 2 },
        paragraphSpacing: 10,
        runs: [{ start: 0, end: 6, style: { fontSize: 60 } }],
      }),
    }),
  )
  await select(page, ['headline'])
  const was = await page.evaluate(() => window.dazbee?.boxOf('headline'))
  if (!was) throw new Error('no box')
  const before = JSON.stringify(await read(page))
  // Mid-drag, the size label says the size it goes from and to.
  const from = await handle(page, 'se')
  const zoom = await page.evaluate(() => window.dazbee?.camera().zoom ?? 1)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 100 * zoom, from.y + 100 * zoom, { steps: 6 })
  await expect(page.locator('.selection-size')).toContainText('40 → ')
  writeOutput('text-handles-corner.png', await page.screenshot({ animations: 'disabled' }))
  await page.mouse.move(from.x + 200 * zoom, from.y + 200 * zoom, { steps: 6 })
  await page.mouse.up()
  await page.evaluate(() => window.dazbee?.drawn())
  const now = await placed(page, 'headline')
  const factor = now.style.fontSize / 40
  expect(factor).toBeGreaterThan(1.5)
  // Every size, by the same factor, to the nearest 0.1; the box mode stays.
  const tenth = (n: number) => Math.round(n * 10) / 10
  expect(now.style.letterSpacing).toBeCloseTo(tenth(2 * factor), 1)
  expect((now as unknown as { paragraphSpacing: number }).paragraphSpacing).toBeCloseTo(tenth(10 * factor), 0)
  expect(now.runs?.[0]?.style.fontSize).toBeCloseTo(tenth(60 * factor), 0)
  expect(now.boxMode).toBe('autoHeight')
  expect(now.width).toBeCloseTo(was.width * factor, -1)
  // The copy in the Story keeps its own.
  expect((await placed(page, 'headline', 'st')).style.fontSize).toBe(40)
  await press(page, 'undo')
  expect(JSON.stringify(await read(page))).toBe(before)
  await press(page, 'redo')
  expect((await placed(page, 'headline')).style.fontSize).toBe(now.style.fontSize)
  expect(errors).toEqual([])
})

test("a side changes the width and the size stays; shrink to fit's sizes scale with a corner; a corner stops at 1 px", async ({
  browser,
}) => {
  const { page, errors } = await openStage(
    browser,
    design({
      plain: text('plain', {}),
      fit: text('fit', { y: 400, boxMode: 'fixed', height: 120, shrinkToFit: { min: 20, max: 40 } }),
    }),
  )
  await select(page, ['plain'])
  const was = await placed(page, 'plain')
  await dragHandle(page, 'e', -150, 0)
  expect((await placed(page, 'plain')).width).toBeCloseTo(was.width - 150, 0)
  expect((await placed(page, 'plain')).style.fontSize).toBe(40)
  // Dragged far in, the smallest size stops at 1 px.
  await dragHandle(page, 'nw', 2000, 2000)
  expect((await placed(page, 'plain')).style.fontSize).toBeCloseTo(1, 1)
  await select(page, ['fit'])
  await dragHandle(page, 'se', 200, 60)
  const fit = await placed(page, 'fit')
  const factor = fit.style.fontSize / 40
  expect(factor).toBeGreaterThan(1.2)
  expect(fit.shrinkToFit?.max).toBeCloseTo(40 * factor, 0)
  expect(fit.shrinkToFit?.min).toBeCloseTo(20 * factor, 0)
  expect(fit.shrinkToFit?.max).toBe(fit.style.fontSize)
  expect(errors).toEqual([])
})

test('a corner on a group scales the text in it; text in a box keeps its size; style-locked text resizes its box only', async ({
  browser,
}) => {
  const { page, errors } = await openStage(
    browser,
    design({
      group: {
        type: 'group',
        parentId: 'sq',
        index: 'a0',
        name: 'Group',
        props: { x: 80, y: 80, width: 400, height: 80 },
      },
      inGroup: { ...text('inGroup', {}), parentId: 'group' },
      box: {
        type: 'box',
        parentId: 'sq',
        index: 'a1',
        name: 'Box',
        props: { x: 80, y: 400, width: 500, height: 200, fills: [{ type: 'solid', color: '#EEEEEEFF' }] },
      },
      inBox: { ...text('inBox', { y: 420 }), parentId: 'box' },
      locked: text('locked', { y: 700 }, { lock: { style: true } }),
      boxInGroup: {
        type: 'box',
        parentId: 'group',
        index: 'a9',
        name: 'Box in group',
        props: { x: 80, y: 180, width: 200, height: 100, fills: [] },
      },
      inBoxInGroup: { ...text('inBoxInGroup', { y: 190, width: 180 }), parentId: 'boxInGroup' },
      note: text('note', { x: 600, y: 800, width: 300 }),
      dot: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a8',
        name: 'Dot',
        props: {
          x: 950,
          y: 800,
          width: 60,
          height: 60,
          shape: { kind: 'ellipse' },
          fills: [{ type: 'solid', color: '#3D6BFFFF' }],
        },
      },
    }),
  )
  await select(page, ['group'])
  // The size label of a group is its box's only.
  const from = await handle(page, 'se')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 60, from.y + 30, { steps: 4 })
  await expect(page.locator('.selection-size')).not.toContainText('→')
  await page.mouse.up()
  await press(page, 'undo')
  await dragHandle(page, 'se', 200, 40)
  expect((await placed(page, 'inGroup')).style.fontSize).toBeGreaterThan(50)
  // A box in the group moves what it holds and never scales it.
  expect((await placed(page, 'inBoxInGroup')).style.fontSize).toBe(40)
  // Several layers, text among them: the text scales with the box round them.
  await select(page, ['note', 'dot'])
  await dragHandle(page, 'se', 200, 100)
  expect((await placed(page, 'note')).style.fontSize).toBeGreaterThan(45)
  await select(page, ['box'])
  await dragHandle(page, 'se', 100, 50)
  expect((await placed(page, 'inBox')).style.fontSize).toBe(40)
  await select(page, ['locked'])
  const was = await placed(page, 'locked')
  await dragHandle(page, 'se', 120, 40)
  expect((await placed(page, 'locked')).style.fontSize).toBe(40)
  expect((await placed(page, 'locked')).width).toBeCloseTo(was.width + 120, 0)
  expect(errors).toEqual([])
})

test('typed after a corner drag in one frame, the text keeps its runs on their characters, and its copy keeps its own', async ({
  browser,
}) => {
  const { page, errors } = await openStage(
    browser,
    design({
      headline: text('headline', { runs: [{ start: 7, end: 11, style: { color: '#FF3D6EFF' } }] }),
    }),
  )
  await select(page, ['headline'])
  await dragHandle(page, 'se', 120, 60)
  // The text keeps its run on the pink word, scaled with it.
  const own = async (frameId = 'sq') => (await placed(page, 'headline', frameId)).runs
  expect(await own()).toEqual([expect.objectContaining({ start: 7, end: 11 })])
  // Typed before the pink word: the run moves with it.
  const box = await page.evaluate(() => window.dazbee?.boxOf('headline'))
  if (!box) throw new Error('no box')
  const at = await page.evaluate(({ x, y }) => window.dazbee?.screenPoint(x, y, 'sq'), {
    x: box.x + 20,
    y: box.y + box.height / 2,
  })
  if (!at) throw new Error('no point')
  await page.mouse.dblclick(at.x, at.y)
  await page.keyboard.press('Home')
  await page.keyboard.type('Hot ')
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await read(page)).nodes.headline?.props.text).toBe('Hot Summer sale')
  expect(await own()).toEqual([expect.objectContaining({ start: 11, end: 15 })])
  // The copy in the Story keeps its words, its run where it was and its size.
  expect(await placed(page, 'headline', 'st')).toMatchObject({ text: 'Summer sale', style: { fontSize: 40 } })
  expect(await own('st')).toEqual([expect.objectContaining({ start: 7, end: 11 })])
  expect(errors).toEqual([])
})

test('a height set in the Position panel makes auto text a fixed box', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design({ headline: text('headline', {}) }))
  await select(page, ['headline'])
  const field = (await barMenu(page, 'position')).getByRole('spinbutton', { name: 'Height' })
  await field.fill('300')
  await field.press('Enter')
  await expect.poll(async () => (await placed(page, 'headline')).boxMode).toBe('fixed')
  expect((await placed(page, 'headline')).height).toBe(300)
  // One undo step takes both back.
  await page.keyboard.press('Escape')
  await press(page, 'undo')
  expect((await placed(page, 'headline')).boxMode).toBe('autoHeight')
  expect(errors).toEqual([])
})

test('a corner that scales text snaps one edge to a guide and keeps the shape', async ({ browser }) => {
  const { page, errors } = await openStage(
    browser,
    design({
      headline: text('headline', { boxMode: 'fixed', width: 400, height: 100 }),
      post: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a9',
        name: 'Post',
        props: {
          x: 700,
          y: 600,
          width: 40,
          height: 400,
          shape: { kind: 'rect' },
          fills: [{ type: 'solid', color: '#3D6BFFFF' }],
        },
      },
    }),
  )
  await select(page, ['headline'])
  // The east edge dragged to 3 px short of the post's left edge, at 700.
  await dragHandle(page, 'se', 217, 0)
  const now = await placed(page, 'headline')
  expect(80 + now.width).toBeCloseTo(700, 0)
  expect(now.height / now.width).toBeCloseTo(100 / 400, 2)
  expect(errors).toEqual([])
})

test("a fixed box's top and bottom change its height and the size stays; a turned text scales along its own edges; Alt scales from the centre", async ({
  browser,
}) => {
  const { page, errors } = await openStage(
    browser,
    design({
      // Low enough that the small menu over it leaves its top handle free.
      fixed: text('fixed', { y: 300, boxMode: 'fixed', height: 120 }),
      turned: text('turned', { y: 600, rotation: 20 }),
      centred: text('centred', { y: 850 }),
    }),
  )
  await select(page, ['fixed'])
  await dragHandle(page, 's', 0, 80)
  expect((await placed(page, 'fixed')).height).toBeCloseTo(200, 0)
  expect((await placed(page, 'fixed')).style.fontSize).toBe(40)
  await dragHandle(page, 'n', 0, -40)
  expect((await placed(page, 'fixed')).height).toBeCloseTo(240, 0)
  expect((await placed(page, 'fixed')).style.fontSize).toBe(40)
  // Turned, a corner still scales: its box keeps its shape and its turn.
  await select(page, ['turned'])
  const was = await placed(page, 'turned')
  await dragHandle(page, 'se', 120, 120)
  const turned = (await placed(page, 'turned')) as unknown as Props & { rotation: number }
  const factor = turned.style.fontSize / 40
  expect(factor).toBeGreaterThan(1.2)
  expect(turned.rotation).toBe(20)
  expect(turned.width).toBeCloseTo(was.width * factor, -1)
  // Alt keeps the centre where it was.
  await select(page, ['centred'])
  const before = await page.evaluate(() => window.dazbee?.boxOf('centred'))
  await dragHandle(page, 'se', 80, 80, ['Alt'])
  const after = await page.evaluate(() => window.dazbee?.boxOf('centred'))
  if (!before || !after) throw new Error('no box')
  expect((await placed(page, 'centred')).style.fontSize).toBeGreaterThan(40)
  expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2, 0)
  expect(errors).toEqual([])
})

for (const [width, height] of [
  [820, 1180],
  [390, 844],
] as const) {
  test(`at ${width}×${height} a corner scales text and the handles are a text's`, async ({ browser }) => {
    // Big enough on a phone's fitted stage to show its handles.
    const { page, errors } = await openStage(
      browser,
      design({ headline: text('headline', { width: 800, style: style(96) }) }),
    )
    await page.setViewportSize({ width, height })
    // The square's top start in view, the text across the screen.
    await page.evaluate(() => window.dazbee?.setCamera({ x: 10, y: 200, zoom: 0.4 }))
    await select(page, ['headline'])
    await expect(page.locator('.selection[data-layer="headline"]')).toBeVisible()
    expect(await handles(page)).toEqual(['e', 'ne', 'nw', 'se', 'sw', 'w'])
    await dragHandle(page, 'se', 100, 100)
    expect((await placed(page, 'headline')).style.fontSize).toBeGreaterThan(100)
    writeOutput(`text-handles-${width}.png`, await page.screenshot({ animations: 'disabled' }))
    expect(errors).toEqual([])
  })
}
