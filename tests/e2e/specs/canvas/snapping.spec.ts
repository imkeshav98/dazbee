// Snapping, smart guides, rulers, align and distribute (#42), with real pointer and keyboard input:
// a drag near another layer snaps and shows a guide, Ctrl turns snapping off, the inspector's
// buttons align and distribute three layers in one undo step each, the rulers mark the selection,
// and a drag among 300 layers works out what it can snap to once, then measures each pointer move
// against every layer once.
import type { DesignInput } from '@dazbee/schema'

import { screenPoint, writeOutput } from '../../support/editor.ts'
import { PERF, report, spread } from '../../support/perf.ts'
import { liveDesign } from '../../support/seed.ts'
import { click, openStage, press, props, selection } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, zoomMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const rect = (x: number, y: number, width: number, height: number, color: string) => ({
  x,
  y,
  width,
  height,
  shape: { kind: 'rect' as const, cornerRadius: 12 },
  fills: [{ type: 'solid' as const, color }],
})

/** The live design plus a tag between the box and the dot. */
const design = (): DesignInput => {
  const base = liveDesign()
  return {
    ...base,
    meta: { ...base.meta, name: 'Snapping' },
    nodes: {
      ...base.nodes,
      tag: {
        type: 'graphic',
        parentId: 'sq',
        link: 'tag',
        index: 'a4',
        name: 'Tag',
        props: rect(470, 150, 120, 60, '#00A889FF'),
      },
    },
  }
}

/** The snapping design and 300 more layers in rows under it. */
const threeHundred = (): DesignInput => {
  const base = design()
  const nodes: DesignInput['nodes'] = { ...base.nodes }
  for (let i = 0; i < 300; i++) {
    const x = 20 + (i % 20) * 52
    const y = 420 + Math.floor(i / 20) * 42
    nodes[`r${i}`] = {
      type: 'graphic',
      parentId: 'sq',
      link: `r${i}`,
      index: `b${String(i).padStart(3, '0')}`,
      name: `R${i}`,
      props: rect(x, y, 40, 30, '#9AA4B2FF'),
    }
  }
  return { ...base, meta: { ...base.meta, name: '300 layers' }, nodes }
}

const guides = (page: Page) =>
  page.locator('.stage-overlay .guide').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.axis))

/** Presses on a design pixel and moves to another in steps, leaving the button down. */
async function hold(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, keys: string[] = []) {
  const a = await screenPoint(page, from.x, from.y)
  const b = await screenPoint(page, to.x, to.y)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (const key of keys) await page.keyboard.down(key)
  await page.mouse.move(b.x, b.y, { steps: 8 })
  await page.evaluate(() => window.dazbee?.drawn())
}
async function release(page: Page, keys: string[] = []) {
  await page.mouse.up()
  for (const key of keys) await page.keyboard.up(key)
  await page.evaluate(() => window.dazbee?.drawn())
}

/** Drags the dot with the mouse in 60 steps, waiting for the redraw after each. */
async function dragDot(page: Page) {
  const a = await screenPoint(page, 820, 240)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let i = 1; i <= 60; i++) {
    await page.mouse.move(a.x - i * 4, a.y + i * 5)
    await page.evaluate(() => window.dazbee?.drawn())
  }
  await page.mouse.up()
}

test('a drag snaps to another layer with a guide, and not with Ctrl held or Snap off', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  // The dot's top is at 120; dragged up 37 it comes 3 px from the box's top at 80, within reach.
  await hold(page, { x: 820, y: 240 }, { x: 820, y: 203 })
  expect(await guides(page)).toContain('y')
  writeOutput('snapping-0-guide.png', await page.screenshot())
  await release(page)
  expect(await props(page, 'dot')).toMatchObject({ x: 700, y: 80 })
  expect(await page.locator('.stage-overlay .guide').count()).toBe(0)

  // Ctrl held: it lands exactly where the pointer puts it.
  await hold(page, { x: 820, y: 200 }, { x: 820, y: 203 }, ['Control'])
  expect(await guides(page)).toEqual([])
  await release(page, ['Control'])
  expect(await props(page, 'dot')).toMatchObject({ y: 83 })

  // Snap off in the zoom menu: no drag snaps until it is back on.
  const snap = async () => (await zoomMenu(page)).getByRole('menuitemcheckbox', { name: 'Snap' })
  await (await snap()).click()
  await expect(await snap()).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Escape')
  // 2 px up from 83 would snap to the box's top at 80; with Snap off it stops at 81.
  await hold(page, { x: 820, y: 203 }, { x: 820, y: 201 })
  expect(await guides(page)).toEqual([])
  await release(page)
  expect(await props(page, 'dot')).toMatchObject({ y: 81 })
  await (await snap()).click()
  await expect(await snap()).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')

  // Equal spacing: the tag between the box (right edge 380) and the dot (left edge 700), 3 px
  // off centre, snaps to 100 px from each, with both gaps marked.
  await hold(page, { x: 530, y: 180 }, { x: 533, y: 180 })
  const gaps = await page.locator('.stage-overlay .gap span').allTextContents()
  writeOutput('snapping-1-equal-gaps.png', await page.screenshot())
  await release(page)
  expect(await props(page, 'tag')).toMatchObject({ x: 480 })
  expect(gaps).toEqual(['100', '100'])
  expect(errors).toEqual([])
})

test("the bar's Line up aligns and distributes three layers, one undo step each", async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const arrange = page.getByTestId('bar-line-up-menu')

  await click(page, 230, 180)
  await click(page, 530, 180, ['Shift'])
  await click(page, 820, 240, ['Shift'])
  expect(await selection(page)).toEqual(['box', 'tag', 'dot'])
  await barMenu(page, 'line-up')
  await expect(arrange.locator('[data-action="distributeHorizontal"]')).toBeEnabled()

  await arrange.locator('[data-action="alignTop"]').click()
  await page.evaluate(() => window.dazbee?.drawn())
  expect([(await props(page, 'box')).y, (await props(page, 'tag')).y, (await props(page, 'dot')).y]).toEqual([
    80, 80, 80,
  ])
  // Box 80–380, tag 120 wide, dot 700–940: 860 across, 660 of it layers, so 100 between each.
  await arrange.locator('[data-action="distributeHorizontal"]').click()
  await page.evaluate(() => window.dazbee?.drawn())
  expect([(await props(page, 'box')).x, (await props(page, 'tag')).x, (await props(page, 'dot')).x]).toEqual([
    80, 480, 700,
  ])
  writeOutput('snapping-2-aligned-distributed.png', await page.screenshot())

  await press(page, 'undo')
  expect((await props(page, 'tag')).x).toBe(470)
  expect((await props(page, 'tag')).y).toBe(80)
  await press(page, 'undo')
  expect((await props(page, 'tag')).y).toBe(150)

  // One layer lines up with its frame: Alt+H centres the dot in the square.
  await click(page, 820, 240)
  await press(page, 'alignCentre')
  expect((await props(page, 'dot')).x).toBe(420)
  expect(errors).toEqual([])
})

test('rulers are off until asked for, count design pixels from the frame, mark the selection, and hide with Shift+R', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  const top = page.locator('.stage-overlay .ruler[data-axis="x"]')
  // Off as the editor opens, as in the final mock; Rulers in the zoom menu turns them on.
  await expect(top).toHaveCount(0)
  const chip = (await zoomMenu(page)).getByRole('menuitemcheckbox', { name: 'Rulers' })
  await expect(chip).toHaveAttribute('aria-checked', 'false')
  await chip.click()
  await expect(chip).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(top).toBeVisible()
  // At 80% numbered ticks are 100 design pixels apart.
  const ticks = await top.locator('.ruler-tick').allTextContents()
  expect(ticks).toEqual(expect.arrayContaining(['0', '100', '500', '1000']))
  await click(page, 820, 240)
  expect(await top.locator('.ruler-end').allTextContents()).toEqual(['700', '940'])
  expect(await page.locator('.stage-overlay .ruler[data-axis="y"] .ruler-end').allTextContents()).toEqual([
    '120',
    '360',
  ])
  writeOutput('snapping-3-rulers.png', await page.screenshot())
  await press(page, 'toggleRulers')
  await expect(top).toHaveCount(0)
  // The menu follows the shortcut.
  await expect((await zoomMenu(page)).getByRole('menuitemcheckbox', { name: 'Rulers' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  expect(errors).toEqual([])
})

test('dragging among 300 layers works out what to snap to once, and each move measures against every layer once', async ({
  browser,
}) => {
  const content = threeHundred()
  const { page, errors } = await openStage(browser, content)
  await click(page, 820, 240)
  // The pointer moves the stage gets with the button down.
  await page.evaluate(() => {
    const moves = { pressed: 0 }
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.buttons & 1) moves.pressed++
      },
      { capture: true },
    )
    ;(window as unknown as { moves: typeof moves }).moves = moves
  })
  const before = await page.evaluate(() => window.dazbee?.snapWork())
  await dragDot(page)
  const after = await page.evaluate(() => window.dazbee?.snapWork())
  const moves = await page.evaluate(() => (window as unknown as { moves: { pressed: number } }).moves.pressed)
  if (!before || !after) throw new Error('no editor')
  expect(moves).toBeGreaterThanOrEqual(60)
  // Gathered once at the press, each pointer move snapping once against what was gathered: every
  // layer in the frame but the dot, and the frame.
  const boxes = Object.keys(content.nodes).filter((id) => id !== 'dot').length + 1
  expect({
    gathered: after.gathered - before.gathered,
    moves: after.moves - before.moves,
    targets: after.targets,
  }).toEqual({ gathered: 1, moves, targets: boxes })
  expect(errors).toEqual([])
})

test('dragging among 300 layers: what a pointer move takes', PERF, async ({ browser }) => {
  const { page } = await openStage(browser, threeHundred())
  await click(page, 820, 240)
  // Time every pointer move from its capture to the end of its handling, and every redraw.
  await page.evaluate(() => {
    const times = { handle: [] as number[], draw: [] as number[] }
    let started = 0
    window.addEventListener(
      'pointermove',
      () => {
        started = performance.now()
      },
      { capture: true },
    )
    window.addEventListener('pointermove', () => {
      times.handle.push(performance.now() - started)
    })
    window.dazbee?.onDraw((_design, _at, info) => times.draw.push(info.ms))
    ;(window as unknown as { times: typeof times }).times = times
  })
  await dragDot(page)
  const times = await page.evaluate(() => (window as unknown as { times: { handle: number[]; draw: number[] } }).times)
  report('Snapping, a drag among 300 layers', {
    'pointer move (command and snapping)': spread(times.handle),
    redraw: spread(times.draw),
  })
})
