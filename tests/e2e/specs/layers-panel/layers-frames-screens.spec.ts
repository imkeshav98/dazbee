// The layers panel's frames at the three screen sizes, in Chromium: the frame rows, a deep group and a
// picked frame clear of the rest of the editor with nothing cut short, and screenshots of each in both
// themes.
import { writeOutput } from '../../support/editor.ts'
import { THEMES } from '../../support/glass.ts'
import { layerRow, openSized, picked } from '../../support/layers-frames.ts'
import { frameRow, row, tabIntoTree } from '../../support/layers-panel.ts'
import { EDITOR_CHROME, layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { copyIn } from '../../support/seed.ts'
import { nextFrame } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

/** The pieces that must not cover each other with the panel open. */
const PIECES = { ...EDITOR_CHROME, flyout: '[data-testid="flyout"]' }

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} the frame rows, a deep group and a picked frame sit clear of everything, nothing cut short`, async ({
    browser,
  }) => {
    const { page, errors } = await openSized(browser, { width, height })
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES })).toEqual([])
    await page.evaluate(() => window.dazbee?.select(['picture']))
    await expect(row(page, 'Picture')).toBeInViewport()
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES })).toEqual([])
    // Every frame row shows its whole name and size.
    for (const name of ['Sale square', 'Sale story', 'Fresh square']) {
      const fits = await frameRow(page, name).evaluate((el) =>
        [...el.querySelectorAll('[data-testid="frame-name"], [data-testid="frame-size"]')].every(
          (part) => part.scrollWidth <= part.clientWidth,
        ),
      )
      expect(fits, `${name} shows whole`).toBe(true)
    }
    await frameRow(page, 'Fresh square').click()
    expect(await picked(page)).toBe('fresh')
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES })).toEqual([])
    expect(errors).toEqual([])
  })
}

for (const [width, height] of SCREEN_SIZES) {
  for (const theme of THEMES) {
    test(
      `screenshots at ${width}×${height}, ${theme}: the frames listed, a frame open to a deep group, a picked frame, hidden and locked rows, the focus on a frame row`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const { page, errors } = await openSized(browser, { width, height }, theme)
        const shot = async (name: string) => {
          await nextFrame(page)
          writeOutput(`layers-frames-${width}-${theme}-${name}.png`, await page.screenshot({ animations: 'disabled' }))
        }
        await shot('1-frames')
        await page.evaluate(() => window.dazbee?.select(['picture']))
        await expect(row(page, 'Picture')).toBeInViewport()
        // The rows' pictures are drawn once the panel is still.
        await expect(row(page, 'Badge').getByTestId('layer-picture').locator('img')).toHaveCount(1)
        await shot('2-deep-group')
        await frameRow(page, 'Sale square').click()
        await expect(frameRow(page, 'Sale square')).toHaveAttribute('aria-selected', 'true')
        await page.mouse.move(0, height / 2)
        await shot('3-picked-frame')
        await frameRow(page, 'Sale story').getByRole('button', { name: 'Expand Sale story' }).click()
        await expect(layerRow(page, copyIn('story', 'logo')).getByTestId('layer-picture').locator('img')).toHaveCount(1)
        await row(page, 'Logo').first().hover()
        await shot('4-hidden-locked')
        await page.mouse.move(0, height / 2)
        await tabIntoTree(page)
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Home')
        await expect(frameRow(page, 'Sale square')).toBeFocused()
        await shot('5-focus')
        expect(errors).toEqual([])
      },
    )
  }
}
