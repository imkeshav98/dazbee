// Add a frame and Add size: F or the dock's Frame button opens the Add a frame card in the edit
// panel, and ✕, Esc, another tool or another panel puts the tool down; its tiles, three across by
// channel, and a size of your own (checked against the size limits as it is typed) add an empty
// frame past the page's rightmost one, picked and shown; a drag with the tool still draws one. A
// picked frame's ⋯ › Add size opens the same card titled for it, which adds a frame of the size
// holding linked copies of its layers laid out to fit. Each by the mouse and by the keyboard, each
// one undo step that a second tab sees, and at the three screen sizes. A page holds a square, a
// story linked to it and a banner linked to nothing; the square holds a turned layer, a locked one
// and one under a mask.
import { editorPath, setCookies, settle, writeOutput } from '../../support/editor.ts'
import { clickLabel, design, frameOf, openFrames, picked, tabToBar } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { EDITOR_CHROME, layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { layersIn, seed } from '../../support/seed.ts'
import { type Design, drag, dragScreen, drawn, fitSettled, nextFrame, press, read } from '../../support/stage.ts'
import { type Browser, expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

/** The frames the design starts with; a new one goes 200 px past the banner, which ends at 3760. */
const START = ['banner', 'sq', 'story']
const NEW_X = 3960
const PIECES = { ...EDITOR_CHROME, 'top bar': '[data-testid="top-bar-row"]', 'edit panel': '#edit-panel' }
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

/** The card in the edit panel, Add a frame or Add size. */
const card = (page: Page) => page.locator('#edit-panel')
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
/** Whether the card's body, which scrolls, is scrolled to its end, the size issue's line last in it. */
const scrolledToEnd = (page: Page) =>
  page.getByTestId('own-size-issue').evaluate((line) => {
    let body = line.parentElement
    while (body && getComputedStyle(body).overflowY !== 'auto') body = body.parentElement
    return body !== null && body.scrollTop + body.clientHeight >= body.scrollHeight - 1
  })
/** Whether a frame's label shows on the stage: it is in view. */
const inView = async (page: Page, frameId: string) => {
  const stage = await page.getByTestId('stage').boundingBox()
  const rect = await page.evaluate((id) => window.dazbee?.labelRect(id), frameId)
  return Boolean(stage && rect && rect.x >= 0 && rect.y >= 0 && rect.x < stage.width && rect.y < stage.height)
}

/** Picks the Frame tool by the dock's button and waits for the card. */
async function frameButton(page: Page) {
  await page.locator('[data-dock] [data-tool="frame"]').click()
  await expect(card(page)).toHaveAttribute('data-panel', 'addFrame')
}
/** Opens the picked frame's ⋯ and its Add size, and waits for the card. */
async function addSize(page: Page) {
  const menu = await barMenu(page, 'frame-more')
  await menu.getByRole('button', { name: 'Add size' }).click()
  await expect(card(page)).toHaveAttribute('data-panel', 'addSize')
}
/** Types a size of your own into the card's fields. */
async function typeSize(page: Page, width: string, height: string) {
  await page.getByTestId('own-width').fill(width)
  await page.getByTestId('own-height').fill(height)
}
/** Opens the design alone in a tab of a theme at a screen size, fitted, with its fonts loaded. */
async function openSized(browser: Browser, viewport: { width: number; height: number }, theme = 'dark') {
  const designId = await seed(design())
  const page = await (await browser.newContext({ viewport })).newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await setCookies(page, { theme })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
  await page.evaluate(() => window.dazbee?.loaded())
  await fitSettled(page)
  return { page, errors }
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

test('W × H adds a size of your own: at the limits it adds, past them a line says why and Add waits; Enter adds as Add does', async ({
  browser,
}) => {
  const { a, errors } = await openFrames(browser)
  await frameButton(a)
  const add = card(a).getByRole('button', { name: 'Add', exact: true })
  const issue = a.getByTestId('own-size-issue')
  for (const [width, height, says] of [
    ['49', '600', 'Each side is at least 50 px.'],
    ['8001', '1000', 'Each side is at most 8000 px.'],
    ['50', '601', 'A frame is at most 12 times as long as it is wide.'],
    ['300.5', '250', 'A size is in whole pixels.'],
    ['300', 'tall', 'A size is in whole pixels.'],
  ] as const) {
    await typeSize(a, width, height)
    await expect(issue).toHaveText(says)
    await expect(add).toBeDisabled()
    await expect(a.getByTestId('own-width')).toHaveAttribute('aria-invalid', 'true')
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
  await press(a, 'undo')
  expect(await added(a)).toEqual([])

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

test('a drag with the Frame tool, the card open, draws an empty frame of the dragged size, and the card closes as the select tool comes back', async ({
  browser,
}) => {
  const { a, errors } = await openFrames(browser)
  await press(a, 'toolFrame')
  await expect(card(a)).toHaveAttribute('data-panel', 'addFrame')
  // Below the square, on empty canvas.
  await drag(a, { x: -400, y: 1100 }, { x: 100, y: 1300 })
  const drawnFrame = await addedFrame(a)
  expect(await frameOf(a, drawnFrame)).toMatchObject({ name: 'Frame', x: -400, y: 1100, width: 500, height: 200 })
  expect(layersIn(await read(a), drawnFrame)).toEqual([])
  await expect(card(a)).toHaveCount(0)
  expect(await tool(a)).toBe('select')
  await press(a, 'undo')
  expect(await added(a)).toEqual([])
  expect(errors).toEqual([])
})

test("Add size in a picked frame's ⋯ opens “Add a size to Square”: a tile adds a frame of that size holding linked copies of every layer laid out to fit, picked, one undo step a second tab sees", async ({
  browser,
}) => {
  const { a, b, tabs, errors } = await openFrames(browser, 2)
  await clickLabel(a, 'sq')
  // Add size ▸ sits after Duplicate.
  const menu = await barMenu(a, 'frame-more')
  await expect(menu.getByRole('button')).toHaveText(['DuplicateCtrl+D', 'Add size', 'Rename', 'DeleteDelete'])
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

test('Add size by the keyboard: Tab to the bar, ⋯, Add size; Esc gives the focus back to ⋯, and a size of your own adds with Enter', async ({
  browser,
}) => {
  const { a, errors } = await openFrames(browser)
  await clickLabel(a, 'sq')
  expect(await tabToBar(a)).toBe('bar-background')
  await a.keyboard.press('ArrowRight')
  await expect(a.getByTestId('bar-frame-more')).toBeFocused()
  await a.keyboard.press('Enter')
  const menu = a.getByTestId('bar-frame-more-menu')
  await expect(menu.getByRole('button', { name: /Duplicate/ })).toBeFocused()
  await a.keyboard.press('Tab')
  await expect(menu.getByRole('button', { name: 'Add size' })).toBeFocused()
  await a.keyboard.press('Enter')
  await expect(card(a)).toHaveAttribute('data-panel', 'addSize')
  expect(await focusInCard(a)).toBe(true)
  await a.keyboard.press('Escape')
  await expect(card(a)).toHaveCount(0)
  await expect(a.getByTestId('bar-frame-more')).toBeFocused()
  expect(await picked(a)).toBe('sq')

  await a.keyboard.press('Enter')
  await a.keyboard.press('Tab')
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

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} the Add a frame and Add size cards sit clear of everything, nothing cut off`, async ({
    browser,
  }) => {
    const { page, errors } = await openSized(browser, { width, height })
    const phone = width < 640
    await frameButton(page)
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES, uncut: 'h2' })).toEqual([])
    // Three tiles across at every size.
    const tops = await page
      .getByTestId('sizes-meta')
      .locator('[data-preset]')
      .evaluateAll((tiles) => tiles.map((tile) => Math.round(tile.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(1)
    // On a phone the card is a sheet at the bottom, the dock and the tab bar hidden under it.
    const panel = await card(page).boundingBox()
    if (!panel) throw new Error('no card')
    if (phone) {
      // Measured as laid out, not as the pop-in animation scales it; offsets round to whole pixels.
      const below = await card(page).evaluate((el) => {
        const sheet = el as HTMLElement
        return (sheet.offsetParent?.clientHeight ?? 0) - sheet.offsetTop - sheet.offsetHeight
      })
      expect(Math.abs(below - 8)).toBeLessThanOrEqual(1)
      await expect(page.locator('[data-dock]')).toBeHidden()
    }
    // Scrolled to the end, a size past the limits says why under the fields, in view and whole.
    await page.getByTestId('own-width').scrollIntoViewIfNeeded()
    await typeSize(page, '9000', '1000')
    await expect(page.getByTestId('own-size-issue')).toBeVisible()
    // The line comes into view as it shows, clear of the faded edge: the card's body is scrolled to its end.
    await expect.poll(() => scrolledToEnd(page)).toBe(true)
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES, uncut: 'h2' })).toEqual([])
    const fields = await page.getByTestId('own-size').boundingBox()
    const grown = await card(page).boundingBox()
    if (!fields || !grown) throw new Error('no fields')
    expect(fields.y + fields.height).toBeLessThanOrEqual(grown.y + grown.height)
    await page.getByTestId('edit-panel-close').click()

    await clickLabel(page, 'sq')
    await addSize(page)
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES, uncut: 'h2' })).toEqual([])
    expect(errors).toEqual([])
  })
}

for (const [width, height] of SCREEN_SIZES) {
  for (const theme of THEMES) {
    test(
      `screenshots at ${width}×${height}, ${theme}: Add a frame, a size past the limits, Add size in ⋯ and its card, and a frame drawn by a drag`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const { page, errors } = await openSized(browser, { width, height }, theme)
        const shot = async (name: string) => {
          // The pointer rests off the card, so no tile shows the hover tint.
          await page.mouse.move(1, 1)
          await nextFrame(page)
          writeOutput(`add-frame-${width}-${theme}-${name}.png`, await page.screenshot({ animations: 'disabled' }))
        }
        await frameButton(page)
        await shot('1-card')
        await page.getByTestId('own-width').scrollIntoViewIfNeeded()
        await typeSize(page, '9000', '1000')
        await expect.poll(() => scrolledToEnd(page)).toBe(true)
        await shot('2-past-limits')
        await page.getByTestId('edit-panel-close').click()
        await clickLabel(page, 'sq')
        await barMenu(page, 'frame-more')
        await shot('3-menu')
        await page.getByTestId('bar-frame-more-menu').getByRole('button', { name: 'Add size' }).click()
        await expect(card(page)).toHaveAttribute('data-panel', 'addSize')
        await shot('4-add-size')
        await page.keyboard.press('Escape')
        await page.keyboard.press('Escape')
        // A frame drawn with the tool on empty canvas: clear of the rail, and on a phone above the card's sheet.
        await page.locator('[data-dock] [data-tool="frame"]').click()
        const stage = await page.getByTestId('stage').boundingBox()
        if (!stage) throw new Error('no stage')
        const phone = width < 640
        const from = { x: stage.x + (phone ? 40 : 140), y: stage.y + stage.height * (phone ? 0.42 : 0.62) }
        await dragScreen(page, from, { x: from.x + 120, y: from.y + 80 })
        await expect(card(page)).toHaveCount(0)
        await shot('5-drawn')
        expect(errors).toEqual([])
      },
    )
  }
}
