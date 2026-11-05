// Add a frame and Add size at the three screen sizes: the cards sit clear of everything with
// nothing cut off, three tiles across, a sheet on a phone; a frame added from a tile, W × H, Add
// size or a drag shows whole with its label clear of the chrome, as does the first frame on an
// empty page; and the PR's pictures of the card, a size past the limits, Add size in ⋯ and its card,
// and a frame drawn by a drag, in both themes.
import { addSize, card, chromeOver, frameButton, labelsUnderIslands, typeSize } from '../../support/add-frame.ts'
import { writeOutput } from '../../support/editor.ts'
import { clickLabel, openSized, picked } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { EDITOR_CHROME, layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { dragScreen, drawn, nextFrame, press, read } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

const PIECES = { ...EDITOR_CHROME, 'top bar': '[data-testid="top-bar-row"]', 'edit panel': '#edit-panel' }
/** A design of one page with no frames. */
const EMPTY_PAGE = {
  meta: { designId: 'replaced-by-the-api', name: 'Empty page' },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  frames: {},
  nodes: {},
}

/** The zoom, 1 at 100%. */
const zoomOf = (page: Page) => page.evaluate(() => window.dazbee?.camera().zoom ?? 0)
/** Waits for a frame to be added and picked, and gives its id. */
async function pickedNew(page: Page, before: string[]) {
  await expect.poll(async () => Object.keys((await read(page)).frames).length).toBe(before.length + 1)
  const id = Object.keys((await read(page)).frames).find((frameId) => !before.includes(frameId)) ?? ''
  expect(await picked(page)).toBe(id)
  await drawn(page)
  return id
}
/** The frames the design holds now, by id. */
const framesNow = async (page: Page) => Object.keys((await read(page)).frames)

/** Whether the card's body, which scrolls, is scrolled to its end, the size issue's line last in it. */
const scrolledToEnd = (page: Page) =>
  page.getByTestId('own-size-issue').evaluate((line) => {
    let body = line.parentElement
    while (body && getComputedStyle(body).overflowY !== 'auto') body = body.parentElement
    return body !== null && body.scrollTop + body.clientHeight >= body.scrollHeight - 1
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
  test(`at ${width}×${height} a frame added from a tile, W × H, Add size or a drag shows whole with its label clear of the chrome, zoomed out only when it doesn't fit`, async ({
    browser,
  }) => {
    const { page, errors } = await openSized(browser, { width, height })
    // At 100% a story is taller than the stage: the view zooms out to show it whole.
    await press(page, 'zoomTo100')
    let before = await framesNow(page)
    await frameButton(page)
    await card(page).locator('[data-preset="story"]').click()
    const story = await pickedNew(page, before)
    expect(await chromeOver(page, story)).toEqual([])
    const fitted = await zoomOf(page)
    expect(fitted).toBeLessThan(1)
    // No other frame's label is cut by the header pill or the end island.
    expect(await labelsUnderIslands(page)).toEqual([])
    writeOutput(`add-frame-shown-${width}.png`, await page.screenshot({ animations: 'disabled' }))

    // A medium rectangle fits at this zoom: the view pans to it and keeps the zoom.
    before = await framesNow(page)
    await frameButton(page)
    await card(page).locator('[data-preset="medium-rectangle"]').click()
    const mpu = await pickedNew(page, before)
    expect(await chromeOver(page, mpu)).toEqual([])
    expect(await zoomOf(page)).toBeCloseTo(fitted, 6)
    expect(await labelsUnderIslands(page)).toEqual([])

    // W × H and Add.
    before = await framesNow(page)
    await frameButton(page)
    await typeSize(page, '1200', '628')
    await card(page).getByRole('button', { name: 'Add', exact: true }).click()
    expect(await chromeOver(page, await pickedNew(page, before))).toEqual([])

    // Add size from the square, which is off the stage by now.
    await page.evaluate(() => window.dazbee?.pickFrame('sq'))
    before = await framesNow(page)
    await addSize(page)
    await card(page).locator('[data-preset="half-page"]').click()
    expect(await chromeOver(page, await pickedNew(page, before))).toEqual([])

    // A frame drawn up under the header, above the card's sheet on a phone: the view brings it clear.
    const stage = await page.getByTestId('stage').boundingBox()
    if (!stage) throw new Error('no stage')
    before = await framesNow(page)
    await press(page, 'toolFrame')
    const from = { x: stage.x + stage.width / 2, y: stage.y + stage.height * 0.3 }
    await dragScreen(page, from, { x: from.x - 100, y: stage.y + 30 })
    expect(await chromeOver(page, await pickedNew(page, before))).toEqual([])
    expect(errors).toEqual([])
  })
}

test('on a phone, from an empty page at 100%: W × H starts at 1080 × 1080, and Feed square lands at 0, 0, shown whole with its label', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 390, height: 844 }, { input: EMPTY_PAGE })
  expect(await zoomOf(page)).toBe(1)
  await frameButton(page)
  await expect(page.getByTestId('own-width')).toHaveValue('1080')
  await expect(page.getByTestId('own-height')).toHaveValue('1080')
  await card(page).locator('[data-preset="feed-square"]').click()
  const square = await pickedNew(page, [])
  expect((await read(page)).frames[square]).toMatchObject({
    name: 'Feed square',
    x: 0,
    y: 0,
    width: 1080,
    height: 1080,
  })
  expect(await chromeOver(page, square)).toEqual([])
  expect(await zoomOf(page)).toBeLessThan(1)
  writeOutput('add-frame-empty-page-390.png', await page.screenshot({ animations: 'disabled' }))
  expect(errors).toEqual([])
})

for (const [width, height] of SCREEN_SIZES) {
  for (const theme of THEMES) {
    test(
      `screenshots at ${width}×${height}, ${theme}: Add a frame, a size past the limits, Add size in ⋯ and its card, and a frame drawn by a drag`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const { page, errors } = await openSized(browser, { width, height }, { theme })
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
