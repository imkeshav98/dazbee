// Export lists frames at the three screen sizes: Export and a picked frame's ⋯ sit clear of
// everything, the frames list whole and its rows tall enough; and the PR's pictures in both themes.
import { writeOutput } from '../../support/editor.ts'
import { openExport } from '../../support/export.ts'
import { LISTED, names, openSized, rows } from '../../support/export-frames.ts'
import { clickLabel } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { EDITOR_CHROME, layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { drawn, nextFrame } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

/** What must not cover each other while Export is open, or a picked frame's ⋯. */
const PIECES = {
  ...EDITOR_CHROME,
  export: '[data-testid="export"]',
  'top bar': '[data-testid="top-bar-row"]',
  'frame menu': '[data-testid="bar-frame-more-menu"]',
}
/** The canvas's frame labels, which cut a long name short by design on a small frame. */
const LABELS = '.stage-overlay'
/**
 * The chrome a menu opened from the header may float over: on a phone the zoom, Pages and the top
 * bar sit under the header, and Export covers them while it is open, as the Share menu does.
 */
const UNDER_MENUS = '[data-zoom], [data-pages], [data-testid="top-bar"]'

/**
 * The layout problems while Export is open: the chrome it floats over is hidden while they are
 * measured, so what is left is Export's own and the rest of the chrome's.
 */
async function problemsWithExport(page: Page) {
  const hide = (hidden: boolean) =>
    page.evaluate(
      ([selector, hidden]) => {
        for (const el of document.querySelectorAll<HTMLElement>(selector)) el.style.visibility = hidden ? 'hidden' : ''
      },
      [UNDER_MENUS, hidden] as const,
    )
  await hide(true)
  try {
    return await layoutProblems(page, { pieces: PIECES, uncut: LABELS })
  } finally {
    await hide(false)
  }
}

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} Export and a picked frame’s ⋯ sit clear of everything, the frames list whole and its rows tall enough`, async ({
    browser,
  }) => {
    const { page, errors } = await openSized(browser, { width, height })
    const dialog = await openExport(page)
    await nextFrame(page)
    expect(await problemsWithExport(page)).toEqual([])
    expect(await names(dialog)).toEqual(['All frames', ...LISTED])
    // Inside the window, every row whole; on a phone each row 44 px tall for a finger.
    const box = await dialog.boundingBox()
    if (!box) throw new Error('no export')
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(box.y + box.height).toBeLessThanOrEqual(height)
    for (const row of await dialog.getByTestId('export-frames').locator('label').all()) {
      const at = await row.boundingBox()
      expect(at && at.height >= (width < 640 ? 44 : 28)).toBe(true)
    }
    // The page's five rows show whole, with no scrolling.
    expect(await dialog.getByTestId('export-frames').evaluate((list) => list.scrollHeight <= list.clientHeight)).toBe(
      true,
    )
    // A tap on a row unticks it, on every screen.
    await dialog.getByText('Banner', { exact: true }).click()
    await expect(page.getByTestId('export-run')).toHaveText('Export 3 files')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await clickLabel(page, 'sq')
    await barMenu(page, 'frame-more')
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES, uncut: LABELS })).toEqual([])
    await page.getByTestId('bar-frame-more-menu').getByRole('button', { name: 'Export', exact: true }).click()
    await expect(dialog).toBeVisible()
    await nextFrame(page)
    expect(await problemsWithExport(page)).toEqual([])
    expect((await rows(dialog)).filter((row) => row.on === true).map((row) => row.frame)).toEqual(['sq'])
    expect(errors).toEqual([])
  })
}

for (const [width, height] of SCREEN_SIZES) {
  for (const theme of THEMES) {
    test(
      `screenshots at ${width}×${height}, ${theme}: Export listing the page's frames, and a picked frame's ⋯ with Export`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const { page, errors } = await openSized(browser, { width, height }, theme)
        const dialog = await openExport(page)
        await dialog.getByText('Banner', { exact: true }).click()
        await page.mouse.move(0, height - 1)
        await drawn(page)
        writeOutput(`export-frames-${width}-${theme}-1-list.png`, await page.screenshot({ animations: 'disabled' }))
        await page.keyboard.press('Escape')
        await clickLabel(page, 'story')
        await barMenu(page, 'frame-more')
        await page.getByTestId('bar-frame-more-menu').getByRole('button', { name: 'Export', exact: true }).hover()
        await drawn(page)
        writeOutput(`export-frames-${width}-${theme}-2-menu.png`, await page.screenshot({ animations: 'disabled' }))
        await page.getByTestId('bar-frame-more-menu').getByRole('button', { name: 'Export', exact: true }).click()
        await expect(dialog).toBeVisible()
        await page.mouse.move(0, height - 1)
        await drawn(page)
        writeOutput(`export-frames-${width}-${theme}-3-one.png`, await page.screenshot({ animations: 'disabled' }))
        expect(errors).toEqual([])
      },
    )
  }
}
