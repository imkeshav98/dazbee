// The top bar's Arrange ⋯ at the three screen sizes. On a phone the bar wraps as the mock draws it:
// its first row holds the items that fit whole and ends with Arrange, the rest in a second card under
// it, always in view; Arrange opens as a sheet at the bottom with no keys, the menus beside its rows
// open in its place under a back row, Line up's buttons are a finger's size, and a tap on a greyed
// row says why. On a tablet or desktop too narrow for the bar, Arrange stays the last item of the first row.
// Nothing meets or is cut at any size; and the screenshots for the pull request.
import { arrangeDesign } from '../../support/arrange-design.ts'
import { editorPath, setCookies, writeOutput } from '../../support/editor.ts'
import { layoutProblems, rowHeights, SCREEN_SIZES } from '../../support/layout.ts'
import { rowIn, rowName, shownKeys, shownRows } from '../../support/menu-rows.ts'
import { seed } from '../../support/seed.ts'
import { fitSettled, nextFrame, openStage, order, selectLayers } from '../../support/stage.ts'
import { type Browser, expect, type Locator, type Page, test } from '../../support/test.ts'
import { arrangeMenu, arrangeSubmenu, barMenu, PIECES, UNCUT } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

/** The keys of the items in one row of the top bar, by its test id, in order. */
const keysIn = (page: Page, row: 'top-bar-row' | 'top-bar-overflow') =>
  page
    .getByTestId(row)
    .locator('[data-item]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.item))

/** Each item's button in a row of the top bar, with its box and the row's. */
const boxesIn = (page: Page, row: 'top-bar-row' | 'top-bar-overflow') =>
  page.getByTestId(row).evaluate((card) => {
    const of = (el: Element) => {
      const { left, right, top, bottom } = el.getBoundingClientRect()
      return { left, right, top, bottom }
    }
    return {
      card: of(card),
      items: [...card.querySelectorAll(':scope > [data-item] > *')].map(of),
    }
  })

/** The editor opened on a phone that takes touches, as a person holds one. */
async function openOnTouch(browser: Browser) {
  const designId = await seed(arrangeDesign())
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
  return { page, errors }
}

test('on a phone the bar wraps as the mock draws it: the first row holds the items that fit whole and ends with Arrange, the rest sit in a second card under it, always in view, and nothing scrolls sideways or is cut', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, arrangeDesign())
  await page.setViewportSize({ width: 390, height: 844 })
  await fitSettled(page)
  for (const id of ['words', 'shape', 'one']) {
    await selectLayers(page, [id], { bar: true })
    const first = await keysIn(page, 'top-bar-row')
    expect(first.at(-1), id).toBe('arrange')
    await expect(page.getByTestId('bar-overflow')).toHaveCount(0)
    for (const row of ['top-bar-row', 'top-bar-overflow'] as const) {
      const { card, items } = await boxesIn(page, row)
      for (const item of items) {
        expect(item.left >= card.left && item.right <= card.right, `${id} ${row}`).toBe(true)
        expect(item.left >= 0 && item.right <= 390, `${id} ${row}`).toBe(true)
      }
    }
    const row = page.getByTestId('top-bar-row')
    expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT }), id).toEqual([])
  }
  // A text's bar is the longest: its second card shows without a click, under the first row.
  await selectLayers(page, ['words'], { bar: true })
  const card = page.getByTestId('top-bar-overflow')
  await expect(card).toBeVisible()
  expect(await keysIn(page, 'top-bar-overflow')).toContain('position')
  const [rowBox, cardBox] = [await page.getByTestId('top-bar-row').boundingBox(), await card.boundingBox()]
  expect(rowBox && cardBox && cardBox.y >= rowBox.y + rowBox.height).toBe(true)
  // Arrange opens from the first row, and the second card stays.
  await arrangeMenu(page)
  await expect(card).toBeVisible()
  expect(errors).toEqual([])
})

test('at 760×900, too narrow for a text’s bar, Arrange stays the last item of the first row, after More controls, and only the other items that do not fit go to the second row', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, arrangeDesign())
  await page.setViewportSize({ width: 760, height: 900 })
  await fitSettled(page)
  await selectLayers(page, ['words'], { bar: true })
  const toggle = page.getByTestId('bar-overflow')
  await expect(toggle).toBeVisible()
  expect((await keysIn(page, 'top-bar-row')).at(-1)).toBe('arrange')
  expect(await keysIn(page, 'top-bar-overflow')).not.toContain('arrange')
  const ends = await page
    .getByTestId('top-bar-row')
    .locator('[data-bar-item]')
    .evaluateAll((els) => els.slice(-2).map((el) => (el as HTMLElement).dataset.testid))
  expect(ends).toEqual(['bar-overflow', 'bar-arrange'])
  await toggle.click()
  await expect(page.getByTestId('top-bar-overflow')).toBeVisible()
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  await arrangeMenu(page)
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  expect(errors).toEqual([])
})

test("on a phone Arrange opens as a sheet at the bottom, hiding the dock and tab bar, with rows a finger can hit and no keys; the menus beside its rows open in the sheet's place under a back row naming the row, the sheet keeping its sides and bottom, and Line up's buttons are a finger's size with room between them", async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, arrangeDesign())
  await page.setViewportSize({ width: 390, height: 844 })
  await fitSettled(page)
  await selectLayers(page, ['words'], { bar: true })
  const more = page.getByTestId('bar-arrange')

  // A rail flyout open first is closed by the sheet, as an edit panel's sheet closes it.
  await page.locator('[data-panel="layers"]').click()
  await expect(page.getByTestId('flyout')).toBeVisible()
  await more.click()
  const sheet = page.getByTestId('bar-arrange-menu')
  await expect(sheet).toBeVisible()
  await expect(page.getByTestId('flyout')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  // As far from the screen's sides and bottom as an edit panel's sheet, once it has popped in; its
  // top is on a whole pixel, so its bottom may be half a pixel off.
  await barMenu(page, 'position')
  const panel = await page.locator('#edit-panel').boundingBox()
  const inset = Math.round(panel?.x ?? -1)
  expect(Math.round(844 - ((panel?.y ?? 0) + (panel?.height ?? 0)))).toBe(inset)
  await more.click()
  const place = async () => {
    const box = await sheet.boundingBox()
    return box && [Math.round(box.x), Math.round(box.width), Math.abs(box.y + box.height - (844 - inset)) <= 1]
  }
  await expect.poll(place).toEqual([inset, 390 - inset * 2, true])
  await expect(sheet).toHaveAttribute('data-sheet', 'true')
  await expect(page.getByTestId('rail')).toBeHidden()
  await expect(page.locator('[data-dock]')).toBeHidden()
  await expect(page.getByTestId('small-menu')).toBeHidden()
  for (const height of await rowHeights(sheet, ':scope > button, [data-scrub]'))
    expect(height).toBeGreaterThanOrEqual(44)
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])

  for (const id of ['text-direction', 'line-up', 'order']) {
    const name = rowName(`more-${id}`)
    const beside = await arrangeSubmenu(page, id)
    // In the sheet, its back row first; nothing else of Arrange shows, and there is no card of its own.
    await expect(sheet.getByTestId(`more-${id}-menu`)).toBeVisible()
    await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1)
    expect((await shownRows(sheet))[0], id).toBe(name)
    expect(await shownRows(sheet), id).toEqual([name, ...(await shownRows(beside))])
    await expect.poll(place, id).toEqual([inset, 390 - inset * 2, true])
    expect(await shownKeys(sheet)).toBe(0)
    for (const height of await rowHeights(
      sheet,
      `:scope [data-testid="more-${id}-back"], :scope [data-testid="more-${id}-menu"] > button`,
    ))
      expect(height, id).toBeGreaterThanOrEqual(44)
    for (const row of await beside.getByRole('button').all()) {
      const at = await row.boundingBox()
      expect(at && at.x >= 0 && at.x + at.width <= 390 && at.y >= 0 && at.y + at.height <= 844, id).toBe(true)
    }
    expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT }), id).toEqual([])
    if (id === 'line-up') {
      const boxes = await Promise.all((await beside.getByRole('button').all()).map((b: Locator) => b.boundingBox()))
      for (const box of boxes) expect(box && box.width >= 44 && box.height >= 44).toBe(true)
      for (let i = 1; i < boxes.length; i++)
        expect((boxes[i]?.x ?? 0) - ((boxes[i - 1]?.x ?? 0) + (boxes[i - 1]?.width ?? 0))).toBeGreaterThanOrEqual(6)
    }
    if (id === 'order') break
    // Esc goes back to Arrange, with the focus on the row the menu opened from.
    await page.keyboard.press('Escape')
    await expect(beside).toBeHidden()
    await expect(sheet.getByTestId(`more-${id}`)).toBeFocused()
  }
  const before = await order(page)
  await rowIn(page.getByTestId('more-order-menu'), 'sendToBack').click()
  await expect(sheet).toBeHidden()
  await expect.poll(() => order(page)).toEqual(['words', ...before.filter((id) => id !== 'words')])
  await expect(page.getByTestId('rail')).toBeVisible()
  await expect(page.locator('[data-dock]')).toBeVisible()
  expect(errors).toEqual([])
})

test('on a phone a tap on a greyed row of the sheet says why, and opens nothing', async ({ browser }) => {
  const { page, errors } = await openOnTouch(browser)
  await selectLayers(page, ['one'], { bar: true })
  await page.getByTestId('bar-arrange').tap()
  const sheet = page.getByTestId('bar-arrange-menu')
  await expect(sheet).toBeVisible()
  // Tapped as a person would, though the row says it is disabled.
  await sheet.getByTestId('more-line-up').tap({ force: true })
  await expect(page.getByRole('tooltip')).toHaveText('Auto layout places this layer')
  await expect(page.getByTestId('more-line-up-menu')).toHaveCount(0)
  await expect(sheet).toBeVisible()
  expect(errors).toEqual([])
  await page.context().close()
})

test('at each screen size Arrange and the menus beside its rows meet nothing and cut nothing, for a text and a shape', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, arrangeDesign())
  for (const [width, height] of SCREEN_SIZES) {
    await page.setViewportSize({ width, height })
    await fitSettled(page)
    for (const id of ['words', 'shape']) {
      await selectLayers(page, [id], { bar: true })
      await arrangeMenu(page)
      await nextFrame(page)
      expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT }), `${width} ${id} ⋯`).toEqual([])
      for (const sub of ['order', 'line-up']) {
        await arrangeSubmenu(page, sub)
        await nextFrame(page)
        expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT }), `${width} ${id} ${sub}`).toEqual([])
        await page.keyboard.press('Escape')
        await expect(page.getByTestId(`more-${sub}-menu`)).toBeHidden()
      }
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('bar-arrange-menu')).toBeHidden()
    }
  }
  expect(errors).toEqual([])
})

for (const theme of ['dark', 'light'] as const)
  test(
    `screenshots in the ${theme} theme: the bar, Arrange open for a shape and a text, Order and Line up open, a locked layer's greyed rows with a tooltip, at each size; the bar wrapped at 760×900`,
    { tag: '@evidence' },
    async ({ browser }) => {
      const { page, errors } = await openStage(browser, arrangeDesign())
      await setCookies(page, { theme })
      await page.reload()
      await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
      const shot = async (name: string) => {
        await page.mouse.move(2, 400)
        await nextFrame(page)
        writeOutput(`top-bar-more-${name}-${theme}.png`, await page.screenshot({ animations: 'disabled' }))
      }
      for (const [width, height] of SCREEN_SIZES) {
        await page.setViewportSize({ width, height })
        await fitSettled(page)
        // A text's bar, the longest: on a phone in two cards.
        await selectLayers(page, ['words'], { bar: true })
        await shot(`bar-${width}`)
        for (const id of ['shape', 'words']) {
          await selectLayers(page, [id], { bar: true })
          // Opened by a mouse with no focus left from the keys before, as a person clicking it sees it.
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
          await page.getByTestId('bar-arrange').click()
          await expect(page.getByTestId('bar-arrange-menu')).toBeVisible()
          await shot(`${id === 'words' ? 'text' : 'shape'}-${width}`)
          await page.keyboard.press('Escape')
          await expect(page.getByTestId('bar-arrange-menu')).toBeHidden()
        }
        await selectLayers(page, ['words'], { bar: true })
        for (const sub of ['order', 'line-up']) {
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
          await arrangeSubmenu(page, sub)
          await shot(`${sub}-${width}`)
          await page.keyboard.press('Escape')
          await page.keyboard.press('Escape')
          await expect(page.getByTestId('bar-arrange-menu')).toBeHidden()
        }
        // A locked text: Line up reached by the keyboard says in a tooltip that the layer is locked.
        await page.evaluate(() => window.dazbee?.setLocked(['words'], true))
        await selectLayers(page, ['words'], { bar: true })
        await page.getByTestId('top-bar-row').locator('[data-bar-item]').first().focus()
        await page.keyboard.press('End')
        await page.keyboard.press('Enter')
        await expect(page.getByTestId('bar-arrange-menu').getByTestId('more-order')).toBeFocused()
        await page.keyboard.press('ArrowDown')
        await expect(page.getByRole('tooltip')).toHaveText('The layer is locked')
        await shot(`locked-${width}`)
        await page.keyboard.press('Escape')
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('bar-arrange-menu')).toBeHidden()
        await page.evaluate(() => window.dazbee?.setLocked(['words'], false))
      }
      // Too narrow for a text's bar: Arrange ends the first row, after More controls, and the second
      // row opens under it.
      await page.setViewportSize({ width: 760, height: 900 })
      await fitSettled(page)
      await selectLayers(page, ['words'], { bar: true })
      await page.getByTestId('bar-overflow').click()
      await expect(page.getByTestId('top-bar-overflow')).toBeVisible()
      await shot('wrapped-760')
      expect(errors).toEqual([])
    },
  )
