// The Position panel, the bar's last item and the one home of how a layer sits: W, H, X, Y and
// Rotate with no heading, Lock ratio, then Order, then for one layer Line up with the frame in two
// rows of three. Each control by mouse and keyboard, one undo step; a turned layer's Position
// button shows its angle; inside an auto layout box Line up is greyed saying why; the Order moves
// with nothing to do greyed; a locked layer's bar is Locked, Unlock and Position, its Position
// greyed but for Order; several layers have no Line up in Position, theirs being on the bar; a
// group has only X and Y. The screen sizes are in specs/top-bar/bar-screens.spec.ts.
import {
  barItems,
  control,
  type ControlId,
  CONTROLS,
  FRAME_LINE_UP,
  ORDER_MOVES,
  POSITION_NUMBERS,
} from '../../support/bar-homes.ts'
import { enter } from '../../support/fields.ts'
import { positionDesign } from '../../support/position-design.ts'
import { openStage, order, perform, props, selectLayers } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

/** Position's controls that a lock greys: its numbers, Lock ratio and Line up. */
const LOCKED_OFF: ControlId[] = [...POSITION_NUMBERS, 'lockRatio', ...FRAME_LINE_UP]

const panel = (page: Page) => barMenu(page, 'position')

/** The bar's controls Position shows, by their ids, in the order they show. */
const shownControls = (within: Locator) =>
  within.evaluate(
    (el, all) =>
      [...el.querySelectorAll('*')]
        .map((one) => Object.entries(all).find(([, c]) => one.matches(c.find))?.[0])
        .filter((id): id is string => id !== undefined && id !== 'position'),
    CONTROLS,
  )

/** The controls of the edit panel the tooltip showing now covers, by their names; empty while it covers none. */
const controlsUnderTooltip = (page: Page) =>
  page.evaluate(() => {
    const tip = document.querySelector('[role="tooltip"]')?.parentElement
    if (!tip) return []
    const t = tip.getBoundingClientRect()
    return [...document.querySelectorAll('#edit-panel :is(button, [data-scrub])')]
      .filter((one) => {
        const r = one.getBoundingClientRect()
        return (
          Math.min(r.right, t.right) - Math.max(r.left, t.left) > 0.5 &&
          Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top) > 0.5
        )
      })
      .map((one) => one.getAttribute('aria-label') ?? (one as HTMLElement).innerText)
  })

/** Undoes, then redoes, checking the value read goes back and comes again. */
async function undoRedo<T>(page: Page, value: () => Promise<T>, before: T, after: T) {
  await perform(page, 'undo')
  await expect.poll(value).toEqual(before)
  await perform(page, 'redo')
  await expect.poll(value).toEqual(after)
}

/** Where the turned layer's box, as drawn, starts on the left. */
async function drawnLeft(page: Page, id: string) {
  const { x, width, height, rotation = 0 } = await props(page, id)
  const turn = (rotation * Math.PI) / 180
  // Plus 0, so a left just under 0 that rounds to -0 reads as 0.
  return Math.round(x + width / 2 - (width * Math.abs(Math.cos(turn)) + height * Math.abs(Math.sin(turn))) / 2) + 0
}

test('one layer: Position ends the bar and holds W, H, X, Y and Rotate with no heading, Lock ratio, then Order, then Line up with the frame in two rows of three', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, positionDesign())
  await page.setViewportSize({ width: 1280, height: 760 })
  for (const id of ['words', 'shape', 'one']) {
    await selectLayers(page, [id], { bar: true })
    expect((await barItems(page)).at(-1), id).toBe('position')
    await expect(page.getByTestId('bar-arrange')).toHaveCount(0)
    const position = await panel(page)
    expect(await shownControls(position), id).toEqual([
      ...POSITION_NUMBERS,
      'lockRatio',
      ...ORDER_MOVES,
      ...FRAME_LINE_UP,
    ])
    const headings = position.locator('h3, h4')
    await expect(headings.first(), id).toHaveText('Order')
    await expect(position.getByText('Advanced', { exact: true })).toHaveCount(0)
    await expect(position.getByText('Arrange', { exact: true })).toHaveCount(0)
    await expect(headings.nth(1)).toHaveText('Line up with the frame')
    // Two rows of three: Left, Centre, Right over Top, Middle, Bottom.
    const boxes = await Promise.all(FRAME_LINE_UP.map(async (one) => control(position, one).boundingBox()))
    const [left, centre, right, top, middle, bottom] = boxes.map((box) => box ?? { x: 0, y: 0, width: 0, height: 0 })
    for (const box of [centre, right]) expect(box?.y).toBe(left?.y)
    for (const box of [middle, bottom]) expect(box?.y).toBe(top?.y)
    expect(top?.y ?? 0).toBeGreaterThan(left?.y ?? 0)
    expect([left?.x, centre?.x, right?.x]).toEqual([top?.x, middle?.x, bottom?.x])
    await expect(control(position, 'alignLeft')).toHaveText('Left')
    await page.keyboard.press('Escape')
    await expect(page.locator('#edit-panel')).toBeHidden()
  }
  expect(errors).toEqual([])
})

test('by mouse, the numbers, Order and Line up each act on the layer as one undo step, and Lock ratio keeps its shape', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, positionDesign())
  await page.setViewportSize({ width: 1280, height: 760 })
  await selectLayers(page, ['shape'], { bar: true })
  const position = await panel(page)
  const shape = () => props(page, 'shape')
  await enter(control(position, 'width'), '300')
  await expect.poll(async () => (await shape()).width).toBe(300)
  await undoRedo(page, async () => (await shape()).width, 200, 300)
  await enter(control(position, 'x'), '40')
  await expect.poll(async () => (await shape()).x).toBe(40)
  await undoRedo(page, async () => (await shape()).x, 120, 40)
  await enter(control(position, 'rotation'), '45')
  await expect.poll(async () => (await shape()).rotation).toBe(45)
  await undoRedo(page, async () => (await shape()).rotation ?? 0, 0, 45)
  await enter(control(position, 'rotation'), '0')

  const lock = control(position, 'lockRatio')
  await lock.click()
  await expect(lock).toHaveAttribute('aria-checked', 'true')
  await enter(control(position, 'width'), '150')
  await expect.poll(shape).toMatchObject({ width: 150, height: 80 })
  await undoRedo(page, async () => [(await shape()).width, (await shape()).height], [300, 160], [150, 80])

  const before = await order(page)
  await control(position, 'sendToBack').click()
  const back = ['shape', ...before.filter((id) => id !== 'shape')]
  await expect.poll(() => order(page)).toEqual(back)
  await undoRedo(page, () => order(page), before, back)
  // Position stays open after a move, so several can be tried in a row.
  await expect(position).toBeVisible()

  await control(position, 'alignRight').click()
  await expect.poll(async () => (await shape()).x).toBe(1080 - 150)
  await undoRedo(page, async () => (await shape()).x, 40, 930)
  await control(position, 'alignMiddle').click()
  await expect.poll(async () => (await shape()).y).toBe(500)
  expect(errors).toEqual([])
})

test('by keyboard: End reaches Position and Enter opens it, Tab goes through its controls, a typed width lands as one undo step, Space runs a move, and the arrows inside never move the layer', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, positionDesign())
  await page.setViewportSize({ width: 1280, height: 760 })
  await selectLayers(page, ['words'], { bar: true })
  const words = () => props(page, 'words')
  const button = page.getByTestId('bar-position')
  await page.getByTestId('top-bar-row').locator('[data-bar-item]').first().focus()
  await page.keyboard.press('End')
  await expect(button).toBeFocused()
  await page.keyboard.press('Enter')
  const position = page.locator('#edit-panel')
  await expect(position).toBeVisible()
  const width = control(position, 'width')
  for (let i = 0; i < 8 && !(await width.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('Tab')
  await expect(width).toBeFocused()
  await page.keyboard.type('500')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await words()).width).toBe(500)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')
  expect(await words()).toMatchObject({ x: 80, y: 60 })
  await undoRedo(page, async () => (await words()).width, 600, 500)

  const toFront = control(position, 'bringToFront')
  await toFront.focus()
  const before = await order(page)
  await page.keyboard.press('Space')
  await expect.poll(() => order(page)).toEqual([...before.filter((id) => id !== 'words'), 'words'])
  const left = control(position, 'alignLeft')
  await left.focus()
  await expect(page.getByRole('tooltip')).toHaveText('Left (Alt+A)')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await words()).x).toBe(0)
  expect(errors).toEqual([])
})

test('a turned layer: the Position button reads ↻ and its angle, the bar has no rotation field, Rotate shows the turn and a typed one replaces it, and Line up lines up its turned box with the frame', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, positionDesign())
  await page.setViewportSize({ width: 1280, height: 760 })
  await selectLayers(page, ['turned'], { bar: true })
  const button = page.getByTestId('bar-position')
  await expect(button).toHaveText('Position↻ 30°')
  await expect(button).toHaveAccessibleName('Position, turned 30°')
  await expect(page.getByTestId('top-bar').locator(CONTROLS.rotation.find)).toHaveCount(0)
  const position = await panel(page)
  const field = control(position, 'rotation')
  await expect(field).toHaveValue('30')
  await enter(field, '-15')
  const rotation = async () => (await props(page, 'turned')).rotation
  await expect.poll(rotation).toBe(345)
  await expect(button).toHaveText('Position↻ 345°')
  await undoRedo(page, rotation, 30, 345)
  await perform(page, 'undo')

  await control(position, 'alignLeft').click()
  await expect.poll(() => drawnLeft(page, 'turned')).toBe(0)
  expect(await rotation()).toBe(30)
  await undoRedo(page, async () => (await props(page, 'turned')).x, 640, (await props(page, 'turned')).x)

  // Turned back to 0°, the button reads Position alone.
  await enter(field, '0')
  await expect(button).toHaveText('Position')
  expect(errors).toEqual([])
})

test('inside an auto layout box: Line up is greyed, saying why under the pointer, on focus and on a click, and does nothing; Order moves the layer along its row and Rotate turns it', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, positionDesign())
  await page.setViewportSize({ width: 1280, height: 760 })
  await selectLayers(page, ['one'], { bar: true })
  const position = await panel(page)
  const tip = page.getByRole('tooltip')
  const before = await props(page, 'one')
  for (const id of FRAME_LINE_UP) {
    const button = control(position, id)
    await expect(button, id).toHaveAttribute('aria-disabled', 'true')
    await expect(button).toHaveCSS('cursor', 'not-allowed')
  }
  const left = control(position, 'alignLeft')
  await left.hover()
  await expect(tip).toHaveText('Auto layout places this layer')
  await left.click({ force: true })
  await expect(tip).toHaveText('Auto layout places this layer')
  // Reached by the keyboard, it says why too.
  await page.mouse.move(2, 400)
  await control(position, 'alignMiddle').focus()
  await page.keyboard.press('Tab')
  await expect(control(position, 'alignBottom')).toBeFocused()
  await expect(tip).toHaveText('Auto layout places this layer')
  // Esc closes the tooltip first, then the panel.
  await page.keyboard.press('Escape')
  await expect(tip).toHaveCount(0)
  await expect(position).toBeVisible()
  expect(await props(page, 'one')).toEqual(before)
  expect(await page.evaluate(() => window.dazbee?.canUndo())).toBe(false)

  const row = () => order(page, 'stack')
  await control(position, 'bringForward').click()
  await expect.poll(row).toEqual(['two', 'one'])
  await undoRedo(page, row, ['one', 'two'], ['two', 'one'])
  const rotation = async () => (await props(page, 'one')).rotation ?? 0
  await enter(control(position, 'rotation'), '20')
  await expect.poll(rotation).toBe(20)
  await undoRedo(page, rotation, 0, 20)

  // Set to keep where it is, the layer lines up again.
  await page.evaluate(() => window.dazbee?.session.run('node.update', { ids: ['one'], patch: { absolute: true } }))
  await expect(control(position, 'alignLeft')).not.toHaveAttribute('aria-disabled')
  expect(errors).toEqual([])
})

test('the Order moves with nothing to do are greyed, saying why: to the front for the top layer, to the back for the bottom one, in the frame and in an auto layout box', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, positionDesign())
  await page.setViewportSize({ width: 1280, height: 760 })
  const tip = page.getByRole('tooltip')
  const toFront: ControlId[] = ['bringForward', 'bringToFront']
  const toBack: ControlId[] = ['sendBackward', 'sendToBack']
  const cases = [
    { id: 'group', off: toFront, on: toBack, why: 'Already at the front' },
    { id: 'under', off: toBack, on: toFront, why: 'Already at the back' },
    { id: 'two', off: toFront, on: toBack, why: 'Already at the front' },
  ]
  for (const { id, off, on, why } of cases) {
    await selectLayers(page, [id], { bar: true })
    const position = await panel(page)
    for (const move of on) await expect(control(position, move), `${id} ${move}`).not.toHaveAttribute('aria-disabled')
    for (const move of off) {
      await expect(control(position, move), `${id} ${move}`).toHaveAttribute('aria-disabled', 'true')
      await control(position, move).hover()
      await expect(tip).toHaveText(why)
    }
    const before = await order(page)
    await control(position, off[0] as ControlId).click({ force: true })
    await expect(tip).toHaveText(why)
    expect(await order(page)).toEqual(before)
    expect(await page.evaluate(() => window.dazbee?.canUndo())).toBe(false)
    await page.mouse.move(2, 400)
  }
  expect(errors).toEqual([])
})

test("a locked layer's bar is Locked, Unlock and Position; its Position greys the numbers, Lock ratio and Line up, each saying the layer is locked, and Order still moves it", async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, positionDesign())
  await page.setViewportSize({ width: 1280, height: 760 })
  await page.evaluate(() => window.dazbee?.setLocked(['words'], true))
  await selectLayers(page, ['words'], { bar: true })
  expect(await barItems(page)).toEqual(['locked', 'unlock', 'position'])
  const position = await panel(page)
  const tip = page.getByRole('tooltip')
  const before = await props(page, 'words')
  for (const id of LOCKED_OFF) {
    const greyed = control(position, id)
    await expect(greyed, id).toHaveAttribute('aria-disabled', 'true')
    await expect(greyed, id).toHaveCSS('cursor', 'not-allowed')
    await greyed.hover()
    await expect(tip, id).toHaveText('The layer is locked')
    expect(await controlsUnderTooltip(page), id).toEqual([])
    await greyed.click({ force: true })
    await expect(tip, id).toHaveText('The layer is locked')
  }
  await expect(control(position, 'rotation')).toHaveAttribute('aria-valuetext', '0°')
  // The keyboard reaches a greyed field, which says why and takes no typing.
  await page.mouse.move(2, 400)
  await control(position, 'width').focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(control(position, 'x')).toBeFocused()
  await expect(tip).toHaveText('The layer is locked')
  await page.keyboard.type('45')
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowUp')
  expect(await props(page, 'words')).toEqual(before)

  const stack = await order(page)
  const front = [...stack.filter((id) => id !== 'words'), 'words']
  await control(position, 'bringToFront').click()
  await expect.poll(() => order(page)).toEqual(front)
  await undoRedo(page, () => order(page), stack, front)

  // Unlock from the bar: the bar and Position come back whole.
  await page.getByTestId('bar-unlock').click()
  await expect.poll(() => barItems(page)).toContain('font')
  expect(errors).toEqual([])
})

test("several layers: the bar ends with Line up then Position; Position has the numbers and Order, and no Line up; the bar's Line up lines them up as one undo step", async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, positionDesign())
  await page.setViewportSize({ width: 1280, height: 760 })
  await selectLayers(page, ['shape', 'turned'], { bar: true })
  expect((await barItems(page)).slice(-2)).toEqual(['line-up', 'position'])
  const position = await panel(page)
  expect(await shownControls(position)).toEqual([...POSITION_NUMBERS, 'lockRatio', ...ORDER_MOVES])
  await expect(position.getByText('Line up', { exact: false })).toHaveCount(0)
  await enter(control(position, 'y'), '100')
  await expect.poll(async () => [(await props(page, 'shape')).y, (await props(page, 'turned')).y]).toEqual([100, 100])
  // With nothing typed, one Esc closes the panel; the layers stay selected.
  await page.keyboard.press('Escape')
  await expect(position).toBeHidden()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['shape', 'turned'])

  const lineUp = await barMenu(page, 'line-up')
  await control(lineUp, 'alignLeft').click()
  await expect.poll(async () => (await props(page, 'turned')).x).not.toBe(640)
  await undoRedo(page, async () => (await props(page, 'turned')).x, 640, (await props(page, 'turned')).x)
  expect(errors).toEqual([])
})

test('a group takes its size and turn from what it holds, so its Position has only X and Y, then Order and Line up', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, positionDesign())
  await page.setViewportSize({ width: 1280, height: 760 })
  await selectLayers(page, ['group'], { bar: true })
  const position = await panel(page)
  expect(await shownControls(position)).toEqual(['x', 'y', ...ORDER_MOVES, ...FRAME_LINE_UP])
  await enter(control(position, 'x'), '200')
  await expect.poll(async () => (await props(page, 'g1')).x).toBe(200)
  expect(errors).toEqual([])
})
