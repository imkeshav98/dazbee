// Add a frame and Add size: F or the dock's Frame button opens the Add a frame card in the edit
// panel, and ✕, Esc, another tool or another panel puts the tool down; its tiles, three across by
// channel, and a size of your own (checked against the size limits as it is typed) add an empty
// frame past the page's rightmost one, picked and shown; a drag with the tool still draws one. A
// picked frame's ⋯ › Add size opens the same card titled for it, which adds a frame of the size
// holding linked copies of its layers laid out to fit. Each by the mouse and by the keyboard, each
// one undo step that a second tab sees. A page holds a square, a story linked to it and a banner
// linked to nothing; the square holds a turned layer, a locked one and one under a mask.
import { addSize, card, frameButton, typeSize } from '../../support/add-frame.ts'
import { settle, writeOutput } from '../../support/editor.ts'
import { clickLabel, frameMenuItems, frameOf, openFrames, picked, tabToBar } from '../../support/frames-on-canvas.ts'
import { layersIn } from '../../support/seed.ts'
import { type Design, drag, drawn, press, read } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

/** The frames the design starts with; a new one goes 200 px past the banner, which ends at 3760. */
const START = ['banner', 'sq', 'story']
const NEW_X = 3960
/** The tiles in order, as each reads: its name, then its pixels. */
const TILES = [
  'Feed square1080 × 1080',
  'Feed portrait1080 × 1350',
  'Story and Reel1080 × 1920',
  'Medium rectangle300 × 250',
  'Leaderboard728 × 90',
  'Half page300 × 600',
  'Link image1200 × 628',
]

const tool = (page: Page) => page.evaluate(() => window.dazbee?.tool())
/** The frames added since the design opened. */
const added = async (page: Page) => Object.keys((await read(page)).frames).filter((id) => !START.includes(id))
/** The one frame added since the design opened. */
async function addedFrame(page: Page) {
  await expect.poll(() => added(page)).toHaveLength(1)
  const [id = ''] = await added(page)
  return id
}
/** The links of the layers a frame holds, however deep, sorted. */
const linksIn = (d: Design, frameId: string) =>
  layersIn(d, frameId)
    .map(([, layer]) => layer.link)
    .sort()
/** Whether the focus is inside the card. */
const focusInCard = (page: Page) => page.evaluate(() => document.activeElement?.closest('#edit-panel') !== null)
/** Whether a frame's label shows on the stage: it is in view. */
const inView = async (page: Page, frameId: string) => {
  const stage = await page.getByTestId('stage').boundingBox()
  const rect = await page.evaluate((id) => window.dazbee?.labelRect(id), frameId)
  return Boolean(stage && rect && rect.x >= 0 && rect.y >= 0 && rect.x < stage.width && rect.y < stage.height)
}

test('F and the Frame button open Add a frame; ✕, Esc, another tool and another panel close it and put the tool down', async ({
  browser,
}) => {
  const { a, errors } = await openFrames(browser)
  // F on the stage: the card opens, the focus stays on the stage so the tool keys still work.
  await press(a, 'toolFrame')
  await expect(card(a)).toHaveAttribute('data-panel', 'addFrame')
  await expect(a.locator('[data-dock] [data-tool="frame"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(card(a).locator('#edit-panel-title')).toHaveText('Add a frame')
  await expect(a.getByTestId('add-frame-note')).toHaveText(
    'A new frame starts empty. Or drag on the canvas with the Frame tool for any size.',
  )
  await expect(card(a).locator('h3')).toHaveText(['Meta', 'Google', 'LinkedIn and X', 'Your own size'])
  await expect(card(a).locator('[data-preset]')).toHaveText(TILES)
  // Three across: the Meta row's tiles share a top and a width.
  const meta = await Promise.all(
    (await a.getByTestId('sizes-meta').locator('[data-preset]').all()).map((tile) => tile.boundingBox()),
  )
  expect(new Set(meta.map((box) => Math.round(box?.y ?? -1))).size).toBe(1)
  expect(new Set(meta.map((box) => Math.round(box?.width ?? -1))).size).toBe(1)
  // Each tile's shape is its size's outline: the leaderboard's is wide, the story's tall.
  const shape = (id: string) =>
    card(a)
      .locator(`[data-preset="${id}"] span[style]`)
      .evaluate((el) => [(el as HTMLElement).offsetWidth, (el as HTMLElement).offsetHeight])
  expect(await shape('leaderboard')).toEqual([40, 5])
  expect(await shape('story')).toEqual([23, 40])
  // A size of your own starts at the size of the frame you are on: the page's first.
  await expect(a.getByTestId('own-width')).toHaveValue('1080')
  await expect(a.getByTestId('own-height')).toHaveValue('1080')
  expect(await focusInCard(a)).toBe(false)
  // T picks the text tool: the card closes.
  await press(a, 'toolText')
  await expect(card(a)).toHaveCount(0)
  expect(await tool(a)).toBe('text')

  // The dock's Frame button: the card takes the focus, and ✕ gives it back to the button.
  await frameButton(a)
  expect(await focusInCard(a)).toBe(true)
  await a.getByTestId('edit-panel-close').click()
  await expect(card(a)).toHaveCount(0)
  expect(await tool(a)).toBe('select')
  await expect(a.locator('[data-dock] [data-tool="frame"]')).toBeFocused()

  // Esc closes it, by the keyboard from the button: Enter opens it.
  await a.keyboard.press('Enter')
  await expect(card(a)).toHaveAttribute('data-panel', 'addFrame')
  await a.keyboard.press('Escape')
  await expect(card(a)).toHaveCount(0)
  expect(await tool(a)).toBe('select')
  await expect(a.locator('[data-dock] [data-tool="frame"]')).toBeFocused()

  // Another panel opening in its place puts the tool down too.
  await press(a, 'toolFrame')
  await expect(card(a)).toHaveAttribute('data-panel', 'addFrame')
  await a.getByTestId('pages-button').click()
  await expect(card(a)).toHaveAttribute('data-panel', 'pages')
  expect(await tool(a)).toBe('select')
  expect(await added(a)).toEqual([])
  expect(errors).toEqual([])
})

test('a tile adds an empty white frame named after its size past the rightmost frame, picked and shown, one undo step a second tab sees; by the mouse and the keyboard', async ({
  browser,
}) => {
  const { a, b, tabs, errors } = await openFrames(browser, 2)
  const layers = Object.keys((await read(a)).nodes).length
  await frameButton(a)
  await card(a).locator('[data-preset="story"]').click()
  const story = await addedFrame(a)
  expect((await read(a)).frames[story]).toMatchObject({
    pageId: 'p1',
    name: 'Story and Reel',
    width: 1080,
    height: 1920,
    x: NEW_X,
    y: 0,
    fills: [{ type: 'solid', color: '#FFFFFFFF' }],
  })
  expect(Object.keys((await read(a)).nodes)).toHaveLength(layers)
  // Picked and shown, the select tool back and the card closed.
  await expect(card(a)).toHaveCount(0)
  expect(await picked(a)).toBe(story)
  await expect(a.getByTestId('top-bar')).toHaveAttribute('data-frame', story)
  expect(await tool(a)).toBe('select')
  await drawn(a)
  expect(await inView(a, story)).toBe(true)
  writeOutput('add-frame-1-tile.png', await a.screenshot({ animations: 'disabled' }))
  await settle(tabs)
  expect(await frameOf(b, story)).toMatchObject({ name: 'Story and Reel', width: 1080, height: 1920 })

  // One undo step takes it away, in both tabs; redo brings it back.
  await press(a, 'undo')
  expect(await added(a)).toEqual([])
  await settle(tabs)
  expect(await frameOf(b, story)).toBeUndefined()
  await press(a, 'redo')
  expect(await frameOf(a, story)).toMatchObject({ name: 'Story and Reel', x: NEW_X })
  await press(a, 'undo')

  // By the keyboard: Enter on the dock's Frame button, Tab to the first tile, Enter.
  await a.locator('[data-dock] [data-tool="frame"]').focus()
  await a.keyboard.press('Enter')
  await expect(card(a)).toHaveAttribute('data-panel', 'addFrame')
  const square = card(a).locator('[data-preset="feed-square"]')
  for (let i = 0; i < 3 && !(await square.evaluate((el) => el === document.activeElement)); i++)
    await a.keyboard.press('Tab')
  await expect(square).toBeFocused()
  await a.keyboard.press('Enter')
  const feed = await addedFrame(a)
  expect(await frameOf(a, feed)).toMatchObject({ name: 'Feed square', width: 1080, height: 1080, x: NEW_X, y: 0 })
  expect(await picked(a)).toBe(feed)
  await expect(card(a)).toHaveCount(0)
  // The keys act on it now: Esc lets it go.
  await a.keyboard.press('Escape')
  expect(await picked(a)).toBeNull()
  await press(a, 'undo')
  expect(await added(a)).toEqual([])
  expect(errors).toEqual([])
})

test('W × H adds a size of your own: at the limits it adds; past them the side at fault alone is outlined and named, and Add waits; Enter adds as Add does', async ({
  browser,
}) => {
  const { a, errors } = await openFrames(browser)
  await frameButton(a)
  const add = card(a).getByRole('button', { name: 'Add', exact: true })
  const issue = a.getByTestId('own-size-issue')
  /** Each field's border colour, width then height. */
  const borders = () =>
    a.evaluate(() =>
      ['width', 'height'].map((axis) => {
        const field = document.querySelector(`[data-testid="own-${axis}"]`)?.closest('[data-knob]')
        return field ? getComputedStyle(field).borderColor : ''
      }),
    )
  const plain = await borders()
  for (const [width, height, says, wrong] of [
    ['49', '600', 'Width is at least 50 px.', [true, false]],
    ['600', '8001', 'Height is at most 8000 px.', [false, true]],
    ['50', '601', 'Height is at most 12 times the width.', [false, true]],
    ['300.5', '250', 'Width is in whole pixels.', [true, false]],
    ['300', 'tall', 'Height is in whole pixels.', [false, true]],
    // Digits only: an exponent or a hex number is refused as letters are.
    ['1e3', '0x64', 'Width is in whole pixels.Height is in whole pixels.', [true, true]],
  ] as const) {
    await typeSize(a, width, height)
    await expect(issue).toHaveText(says)
    await expect(add).toBeDisabled()
    await expect(a.getByTestId('own-width')).toHaveAttribute('aria-invalid', String(wrong[0]))
    await expect(a.getByTestId('own-height')).toHaveAttribute('aria-invalid', String(wrong[1]))
    // Each side at fault, and only it, has the danger outline, seen with the focus out of the fields.
    await a.getByTestId('own-size').click({ position: { x: 1, y: 1 } })
    expect((await borders()).map((now, i) => now !== plain[i])).toEqual(wrong)
    // Enter adds nothing either.
    await a.getByTestId('own-height').press('Enter')
  }
  // An empty side says nothing and waits.
  await typeSize(a, '', '600')
  await expect(issue).toHaveCount(0)
  await expect(add).toBeDisabled()
  expect(await added(a)).toEqual([])
  writeOutput('add-frame-2-past-limits.png', await a.screenshot({ animations: 'disabled' }))

  // At the limits: 50 px on the short side and 12 times as long, named Frame.
  await typeSize(a, '50', '600')
  await expect(issue).toHaveCount(0)
  await expect(a.getByTestId('own-width')).toHaveAttribute('aria-invalid', 'false')
  await add.click()
  const thin = await addedFrame(a)
  expect(await frameOf(a, thin)).toMatchObject({ name: 'Frame', width: 50, height: 600, x: NEW_X, y: 0 })
  expect(await picked(a)).toBe(thin)
  await expect(card(a)).toHaveCount(0)
  // One undo step takes it away; redo brings it back.
  await press(a, 'undo')
  expect(await added(a)).toEqual([])
  await press(a, 'redo')
  expect(await frameOf(a, thin)).toMatchObject({ name: 'Frame', width: 50, height: 600, x: NEW_X, y: 0 })
  await press(a, 'undo')

  // 8000 px long, by Enter in a field.
  await press(a, 'toolFrame')
  await typeSize(a, '8000', '667')
  await a.getByTestId('own-height').press('Enter')
  expect(await frameOf(a, await addedFrame(a))).toMatchObject({ name: 'Frame', width: 8000, height: 667 })
  await press(a, 'undo')

  // A preset's size typed in takes the preset's name.
  await press(a, 'toolFrame')
  await typeSize(a, '300', '250')
  await add.click()
  expect(await frameOf(a, await addedFrame(a))).toMatchObject({ name: 'Medium rectangle', width: 300, height: 250 })
  expect(errors).toEqual([])
})

test('a drag with the Frame tool, the card open, draws an empty frame of the dragged size, picked at once as the card closes and the select tool comes back; undo and redo', async ({
  browser,
}) => {
  const { a, errors } = await openFrames(browser)
  await press(a, 'toolFrame')
  await expect(card(a)).toHaveAttribute('data-panel', 'addFrame')
  // Below the square, on empty canvas.
  await drag(a, { x: -400, y: 1100 }, { x: 100, y: 1300 })
  const drawnFrame = await addedFrame(a)
  const at = { name: 'Frame', x: -400, y: 1100, width: 500, height: 200 }
  expect(await frameOf(a, drawnFrame)).toMatchObject(at)
  expect(layersIn(await read(a), drawnFrame)).toEqual([])
  await expect(card(a)).toHaveCount(0)
  expect(await tool(a)).toBe('select')
  // Picked, as a frame added from a tile is: its label lit and its top bar showing.
  expect(await picked(a)).toBe(drawnFrame)
  await expect(a.locator(`.stage-overlay .frame-label[data-frame="${drawnFrame}"]`)).toHaveAttribute('data-active', '')
  await expect(a.getByTestId('top-bar')).toHaveAttribute('data-frame', drawnFrame)
  await press(a, 'undo')
  expect(await added(a)).toEqual([])
  await press(a, 'redo')
  expect(await frameOf(a, drawnFrame)).toMatchObject(at)
  expect(errors).toEqual([])
})

test("Add size in a picked frame's ⋯ opens “Add a size to Square”: a tile adds a frame of that size holding linked copies of every layer laid out to fit, picked, one undo step a second tab sees", async ({
  browser,
}) => {
  const { a, b, tabs, errors } = await openFrames(browser, 2)
  await clickLabel(a, 'sq')
  await barMenu(a, 'frame-more')
  await frameMenuItems(a)
  await addSize(a)
  await expect(card(a).locator('#edit-panel-title')).toHaveText('Add a size to Square')
  await expect(a.getByTestId('add-frame-note')).toHaveText(
    "The new frame holds linked copies of Square's layers, laid out to fit.",
  )
  await expect(card(a).locator('[data-preset]')).toHaveText(TILES)
  await expect(a.getByTestId('own-width')).toHaveValue('1080')
  expect(await focusInCard(a)).toBe(true)
  // The square stays picked meanwhile.
  expect(await picked(a)).toBe('sq')

  await card(a).locator('[data-preset="medium-rectangle"]').click()
  const mpu = await addedFrame(a)
  const now = await read(a)
  expect(now.frames[mpu]).toMatchObject({ pageId: 'p1', name: 'Square', width: 300, height: 250, x: NEW_X, y: 0 })
  expect(linksIn(now, mpu)).toEqual(linksIn(now, 'sq'))
  // Laid out to fit: sizes scale by the smaller ratio, 250 / 1080; the turned layer stays turned,
  // the locked one locked and the photo under its mask.
  const copy = (link: string) => layersIn(now, mpu).find(([, layer]) => layer.link === link)?.[1]
  const k = 250 / 1080
  expect(copy('headline')?.props.width).toBeCloseTo(600 * k, 0)
  expect((copy('headline')?.props.style as { fontSize: number }).fontSize).toBeCloseTo(96 * k, 0)
  expect(copy('tilt')?.props.rotation).toBe(30)
  expect(copy('locked')?.lock).toEqual(now.nodes.locked?.lock)
  expect(copy('locked')?.lock).toMatchObject({ move: true, style: true, content: true })
  expect(copy('disc')?.props.mask).toBe('alpha')
  expect(await picked(a)).toBe(mpu)
  await expect(card(a)).toHaveCount(0)
  await drawn(a)
  expect(await inView(a, mpu)).toBe(true)
  writeOutput('add-frame-3-add-size.png', await a.screenshot({ animations: 'disabled' }))
  await settle(tabs)
  expect(await frameOf(b, mpu)).toMatchObject({ name: 'Square', width: 300, height: 250 })
  expect(linksIn(await read(b), mpu)).toEqual(linksIn(now, 'sq'))

  // One undo step takes the frame and its copies away; redo brings them back.
  await press(a, 'undo')
  expect(await added(a)).toEqual([])
  expect(layersIn(await read(a), mpu)).toEqual([])
  await press(a, 'redo')
  expect(linksIn(await read(a), mpu)).toEqual(linksIn(now, 'sq'))
  await press(a, 'undo')
  await settle(tabs)
  expect(await frameOf(b, mpu)).toBeUndefined()

  // Picking another frame closes the card: it was for the square.
  await a.evaluate(() => window.dazbee?.setCamera({ x: 300, y: 180, zoom: 0.5 }))
  await drawn(a)
  await clickLabel(a, 'sq')
  await addSize(a)
  await clickLabel(a, 'story')
  await expect(card(a)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Add size by the keyboard: Tab to the bar, ⋯, the down arrow to Add size; Esc gives the focus back to ⋯, and a size of your own adds with Enter', async ({
  browser,
}) => {
  const { a, errors } = await openFrames(browser)
  await clickLabel(a, 'sq')
  expect(await tabToBar(a)).toBe('bar-background')
  await a.keyboard.press('ArrowRight')
  await expect(a.getByTestId('bar-frame-more')).toBeFocused()
  await a.keyboard.press('Enter')
  await frameMenuItems(a, 'Add size')
  await a.keyboard.press('Enter')
  await expect(card(a)).toHaveAttribute('data-panel', 'addSize')
  expect(await focusInCard(a)).toBe(true)
  await a.keyboard.press('Escape')
  await expect(card(a)).toHaveCount(0)
  await expect(a.getByTestId('bar-frame-more')).toBeFocused()
  expect(await picked(a)).toBe('sq')

  await a.keyboard.press('Enter')
  await frameMenuItems(a, 'Add size')
  await a.keyboard.press('Enter')
  await expect(card(a)).toHaveAttribute('data-panel', 'addSize')
  const width = a.getByTestId('own-width')
  for (let i = 0; i < 12 && !(await width.evaluate((el) => el === document.activeElement)); i++)
    await a.keyboard.press('Tab')
  await expect(width).toBeFocused()
  await a.keyboard.press('ControlOrMeta+A')
  await a.keyboard.type('1200')
  await a.keyboard.press('Tab')
  await a.keyboard.press('ControlOrMeta+A')
  await a.keyboard.type('628')
  await a.keyboard.press('Enter')
  const banner = await addedFrame(a)
  const now = await read(a)
  expect(now.frames[banner]).toMatchObject({ name: 'Square', width: 1200, height: 628, x: NEW_X })
  expect(linksIn(now, banner)).toEqual(linksIn(now, 'sq'))
  expect(await picked(a)).toBe(banner)
  await press(a, 'undo')
  expect(await added(a)).toEqual([])
  expect(errors).toEqual([])
})
