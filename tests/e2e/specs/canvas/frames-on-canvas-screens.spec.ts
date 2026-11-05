// Frames on the canvas at the three screen sizes: the picked frame's bar, ⋯ menu, Background panel
// and rename field sit clear of the chrome and of each other; and the PR's pictures of them, and of a
// frame mid-drag, in both themes.
import { writeOutput } from '../../support/editor.ts'
import { clickLabel, labelPoint, openSized, picked } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { EDITOR_CHROME, layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { drawn, nextFrame } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

const PIECES = {
  ...EDITOR_CHROME,
  'top bar': '[data-testid="top-bar-row"]',
  'edit panel': '#edit-panel',
  'frame menu': '[data-testid="bar-frame-more-menu"]',
  'rename field': '[data-testid="frame-rename"]',
}

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} the picked frame’s bar, ⋯ menu, Background panel and rename field sit clear of everything`, async ({
    browser,
  }) => {
    const { page, errors } = await openSized(browser, { width, height })
    // Picked by a click on its label, then on its empty area once its label is known.
    await clickLabel(page, 'sq')
    expect(await picked(page)).toBe('sq')
    await expect(page.getByTestId('top-bar')).toHaveAttribute('data-frame', 'sq')
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES })).toEqual([])
    await barMenu(page, 'frame-more')
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES })).toEqual([])
    await page.getByTestId('bar-frame-more-menu').getByRole('button', { name: 'Rename' }).click()
    const field = page.getByTestId('frame-rename').locator('input')
    await expect(field).toBeFocused()
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES })).toEqual([])
    // The field keeps to the square's label row, short of the story's label beside it.
    const stage = await page.getByTestId('stage').boundingBox()
    const row = await page.evaluate(() => window.dazbee?.labelRect('sq'))
    const story = await page.locator('.stage-overlay .frame-label[data-frame="story"]').boundingBox()
    const at = await field.boundingBox()
    if (!stage || !row || !at) throw new Error('no rename field')
    expect(at.x + at.width).toBeLessThanOrEqual(stage.x + row.x + row.width + 0.5)
    if (story) expect(at.x + at.width).toBeLessThanOrEqual(story.x)
    await page.keyboard.press('Escape')
    await barMenu(page, 'background')
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES, uncut: '[data-testid="edit-panel-note"]' })).toEqual([])
    writeOutput(`frames-5-${width}.png`, await page.screenshot({ animations: 'disabled' }))
    expect(errors).toEqual([])
  })
}

for (const [width, height] of SCREEN_SIZES) {
  for (const theme of THEMES) {
    test(
      `screenshots at ${width}×${height}, ${theme}: a picked frame, its Background, its ⋯ menu, its label renamed and a frame mid-drag`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const { page, errors } = await openSized(browser, { width, height }, theme)
        const shot = async (name: string) => {
          await nextFrame(page)
          writeOutput(`frames-${width}-${theme}-${name}.png`, await page.screenshot({ animations: 'disabled' }))
        }
        await clickLabel(page, 'sq')
        await shot('1-picked')
        await barMenu(page, 'background')
        await shot('2-background')
        await page.keyboard.press('Escape')
        await expect(page.locator('#edit-panel')).toHaveCount(0)
        await barMenu(page, 'frame-more')
        await shot('3-menu')
        await page.getByTestId('bar-frame-more-menu').getByRole('button', { name: 'Rename' }).click()
        await expect(page.getByTestId('frame-rename').locator('input')).toBeFocused()
        await page.keyboard.type('Weekend sale')
        await shot('4-renaming')
        await page.keyboard.press('Enter')
        // Mid-drag on the label: the frame follows the pointer, outlined, its label lit.
        const from = await labelPoint(page, 'story', 20)
        await page.mouse.move(from.x, from.y)
        await page.mouse.down()
        await page.mouse.move(from.x + 30, from.y + 40, { steps: 4 })
        await drawn(page)
        await shot('5-dragging')
        await page.mouse.up()
        expect(errors).toEqual([])
      },
    )
  }
}
