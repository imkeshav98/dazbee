// Add a frame and Add size at the three screen sizes: the cards sit clear of everything with
// nothing cut off, three tiles across, a sheet on a phone; and the PR's pictures of the card, a size
// past the limits, Add size in ⋯ and its card, and a frame drawn by a drag, in both themes.
import { addSize, card, frameButton, typeSize } from '../../support/add-frame.ts'
import { writeOutput } from '../../support/editor.ts'
import { clickLabel, openSized } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { EDITOR_CHROME, layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { dragScreen, nextFrame } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

const PIECES = { ...EDITOR_CHROME, 'top bar': '[data-testid="top-bar-row"]', 'edit panel': '#edit-panel' }

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
