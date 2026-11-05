// Export lists frames at the three screen sizes: Export and a picked frame's ⋯ sit clear of
// everything, the frames list whole and its rows tall enough; a page of more frames than the list
// shows scrolls in it, the form still on screen; and the PR's pictures in both themes.
import { writeOutput } from '../../support/editor.ts'
import { openExport } from '../../support/export.ts'
import { adsDesign, LISTED, names, openSized, rows } from '../../support/export-frames.ts'
import { clickLabel } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { EDITOR_CHROME, layoutProblems, rowHeights, SCREEN_SIZES, scrolling } from '../../support/layout.ts'
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
    for (const tall of await rowHeights(dialog.getByTestId('export-frames'), 'label'))
      expect(tall).toBeGreaterThanOrEqual(width < 640 ? 44 : 28)
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
  test(`at ${width}×${height} a page of nine frames scrolls in the list, part of the next row showing, with JPG’s Quality the whole form on screen`, async ({
    browser,
  }) => {
    const phone = width < 640
    const { page, errors } = await openSized(browser, { width, height }, { input: adsDesign(9) })
    // A frame's ⋯ menu's rows, which the list's rows are as tall as.
    await clickLabel(page, 'ad1')
    const menu = await barMenu(page, 'frame-more')
    const [menuRow = 0] = await rowHeights(menu, 'button')
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()

    const dialog = await openExport(page)
    await dialog.locator('[data-type="jpg"]').click()
    await expect(dialog.getByTestId('export-quality')).toBeVisible()
    await page.mouse.move(0, height - 1)
    await nextFrame(page)
    const list = dialog.getByTestId('export-frames')
    const heights = await rowHeights(list, 'label')
    expect(heights).toHaveLength(10)
    expect(new Set(heights)).toEqual(new Set([phone ? Math.max(44, menuRow) : menuRow]))
    // About eight rows show, five on a phone, and part of the next at the bottom edge, so the list
    // never looks whole; its bar stays shown on a phone, where no pointer brings it up.
    const shown = (await list.evaluate((el) => el.clientHeight)) / (heights[0] ?? 1)
    expect(Math.floor(shown)).toBe(phone ? 5 : 8)
    expect(shown % 1).toBeGreaterThan(0.3)
    expect(shown % 1).toBeLessThan(0.7)
    const state = await scrolling(list)
    expect(state.scrolls).toBe(true)
    if (phone) expect(state.bar).toBe(true)
    // The whole form, Quality and Export too, stays on screen.
    const box = await dialog.boundingBox()
    if (!box) throw new Error('no export')
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(box.y + box.height).toBeLessThanOrEqual(height)
    expect(await problemsWithExport(page)).toEqual([])
    expect(errors).toEqual([])
  })
}

test('on a phone with a coarse pointer every control of Export is at least 44 px tall, as its frame rows are', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 390, height: 844 }, { touch: true })
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  const dialog = await openExport(page)
  await dialog.locator('[data-type="jpg"]').click()
  await expect(dialog.getByTestId('export-quality')).toBeVisible()
  const heights = await dialog.evaluate((form) =>
    Object.fromEntries(
      Object.entries({
        page: '[data-testid="export-page"]',
        png: '[data-type="png"]',
        jpg: '[data-type="jpg"]',
        pdf: '[data-type="pdf"]',
        svg: '[data-type="svg"]',
        quality: '[data-scrub]',
        'file names': '[data-testid="export-name"]',
        export: '[data-testid="export-run"]',
        row: '[data-testid="export-frames"] label',
      }).map(([control, selector]) => [control, form.querySelector<HTMLElement>(selector)?.offsetHeight ?? 0]),
    ),
  )
  for (const [control, tall] of Object.entries(heights)) expect(tall, control).toBeGreaterThanOrEqual(44)
  expect(errors).toEqual([])
})

for (const [width, height] of SCREEN_SIZES) {
  for (const theme of THEMES) {
    test(
      `screenshots at ${width}×${height}, ${theme}: Export listing the page's frames, and a picked frame's ⋯ with Export`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const { page, errors } = await openSized(browser, { width, height }, { theme })
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
