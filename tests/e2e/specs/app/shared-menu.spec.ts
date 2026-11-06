// The one menu every menu of the app is built on, in Chromium, through the full menu (the small
// menu's ⋯), which has every piece of it: a menu with its rows as menu items, the arrows round from
// the ends, Home, End and typing to jump; the focus as it opens and closes; Esc closing the top-most
// first; a greyed row that stays in the arrow order and says why beside itself, never over another
// row, and runs nothing; a menu beside its row on tablet and desktop, and on a phone in the menu's
// place under a back row; and all of it mirrored in Arabic.
import { photo, upload } from '../../support/assets.ts'
import { openSized } from '../../support/frames-on-canvas.ts'
import { boxOf } from '../../support/layout.ts'
import { focusedRow, openAt, PHONE } from '../../support/linked-menu.ts'
import { linkedMenuDesign } from '../../support/linked-menu-design.ts'
import { besideRows, fullMenuRows, rowName, rowsUnderTooltip } from '../../support/menu-rows.ts'
import { nextFrame, openStage, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { entered } from '../../support/top-bar.ts'
import { topBarDesign } from '../../support/top-bar-design.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

/** The test id of the element that has the focus. */
const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')

/** Opens the full menu from ⋯ by the keyboard, for the layer given, and gives it. */
async function fullMenuByKeys(page: Page, id: string) {
  await selectLayers(page, [id])
  await page.getByTestId('bar-more').focus()
  await page.keyboard.press('Enter')
  const menu = page.getByTestId('bar-more-menu')
  await expect(menu).toBeVisible()
  await entered(menu)
  await expect(menu.locator('[role^="menuitem"]').first()).toBeFocused()
  return menu
}

test('is a menu of menu items: the arrows go round from the ends, Home and End jump, and typing jumps to the next row starting so', async ({
  browser,
}) => {
  const { page, errors } = await openAt(browser)
  const menu = await fullMenuByKeys(page, 'headline')
  await expect(menu).toHaveAttribute('role', 'menu')
  await expect(menu.locator('[role^="menuitem"]')).toHaveCount(fullMenuRows().length)
  await expect(menu.getByTestId('more-copy')).toBeFocused()
  const rows = fullMenuRows()
  for (const [key, row] of [
    ['ArrowUp', rows.at(-1)],
    ['ArrowDown', rows[0]],
    ['End', rows.at(-1)],
    ['Home', rows[0]],
    // Typing jumps to the next row whose words start with what was typed, a second apart.
    ['h', rowName('hideLinked')],
    ['p', rowName('more-paste')],
    ['p', rowName('boxSelection')],
  ] as const) {
    if (key.length === 1) await page.waitForTimeout(1100)
    await page.keyboard.press(key)
    await expect.poll(() => focusedRow(page), key).toBe(row)
  }
  expect(errors).toEqual([])
})

test('a greyed row stays in the arrow order, says why beside itself over no other row, and runs nothing', async ({
  browser,
}) => {
  const { page, errors } = await openAt(browser)
  // A frame linked to no other: Copy to other frames has nothing to do.
  const menu = await fullMenuByKeys(page, 'fresh-title')
  // Down past Paste and Duplicate onto it, a key at a time as Radix moves the focus after each.
  for (const row of ['more-paste', 'duplicate', 'more-copy-to-frames'].map(rowName)) {
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focusedRow(page)).toBe(row)
  }
  const greyed = menu.getByTestId('more-copy-to-frames')
  await expect(greyed).toBeFocused()
  await expect(greyed).toHaveAttribute('aria-disabled', 'true')
  const why = 'No other frame on this page is linked to this one'
  const tip = page.getByRole('tooltip').filter({ hasText: why })
  await expect(tip).toBeVisible()
  expect(await rowsUnderTooltip(page)).toEqual([])
  // Beside the row: level with it, past its menu's end edge.
  const [row, said, box] = [await boxOf(greyed), await boxOf(tip), await boxOf(menu)]
  expect(said.left).toBeGreaterThanOrEqual(box.right)
  expect(said.bottom).toBeGreaterThan(row.top)
  expect(said.top).toBeLessThan(row.bottom)
  // Enter runs nothing and the menu stays, the focus on the row.
  await page.keyboard.press('Enter')
  await expect(menu).toBeVisible()
  await expect(greyed).toBeFocused()
  await expect(page.getByTestId('more-copy-to-frames-menu')).toHaveCount(0)
  // Esc closes the tooltip first, then the menu.
  await page.keyboard.press('Escape')
  await expect(tip).toBeHidden()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(page.getByTestId('bar-more')).toBeFocused()
  expect(errors).toEqual([])
})

for (const arabic of [false, true])
  test(`a menu beside a row opens by the arrow towards it, lines up beside its row, and Esc closes it alone${arabic ? ', mirrored in Arabic' : ''}`, async ({
    browser,
  }) => {
    const { page, errors } = await openAt(browser, undefined, arabic)
    const [toward, back] = arabic ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']
    const menu = await fullMenuByKeys(page, 'headline')
    const row = menu.getByTestId('more-copy')
    await expect(row).toHaveAttribute('aria-haspopup', 'menu')
    await page.keyboard.press(toward)
    const sub = page.getByTestId('more-copy-menu')
    await expect(sub).toBeVisible()
    await expect(sub).toHaveAttribute('role', 'menu')
    await entered(sub)
    await expect(sub.getByRole('menuitem').first()).toBeFocused()
    // Beside its row, towards the page's end where the window has room for it, its top level with the row's.
    const [at, beside] = [await boxOf(row), await boxOf(sub)]
    const room = arabic ? at.left : (page.viewportSize()?.width ?? 0) - at.right
    const towardEnd = arabic ? beside.right <= at.left : beside.left >= at.right
    const towardStart = arabic ? beside.left >= at.right : beside.right <= at.left
    expect(towardEnd || towardStart).toBe(true)
    if (room >= beside.right - beside.left + 8) expect(towardEnd).toBe(true)
    expect(Math.abs(beside.top - at.top)).toBeLessThanOrEqual(8)
    // The arrow back closes it, onto its row; the arrow towards it opens it again.
    await page.keyboard.press(back)
    await expect(sub).toBeHidden()
    await expect(row).toBeFocused()
    await page.keyboard.press(toward)
    await expect(sub).toBeVisible()
    // Esc closes it alone, the focus back on its row; a second Esc closes the menu, onto ⋯.
    await page.keyboard.press('Escape')
    await expect(sub).toBeHidden()
    await expect(menu).toBeVisible()
    await expect(row).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(page.getByTestId('bar-more')).toBeFocused()
    expect(errors).toEqual([])
  })

for (const arabic of [false, true])
  test(`on a phone a menu beside a row opens in its menu's place under a back row, and the back row, the arrow back and Esc go back${arabic ? ', mirrored in Arabic' : ''}`, async ({
    browser,
  }) => {
    const { page, errors } = await openAt(browser, PHONE, arabic)
    const [toward, back] = arabic ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']
    const menu = await fullMenuByKeys(page, 'headline')
    // A sheet along the screen's bottom edge.
    const sheet = await boxOf(menu)
    expect(sheet.left).toBeLessThanOrEqual(8)
    expect(sheet.right).toBeGreaterThanOrEqual(PHONE.width - 8)
    expect(sheet.bottom).toBeGreaterThanOrEqual(PHONE.height - 8)

    const backRow = menu.getByTestId('more-copy-back')
    const shownWords = () =>
      menu
        .locator('[role^="menuitem"]')
        .evaluateAll((rows) =>
          rows.filter((row) => row.checkVisibility()).map((row) => row.firstChild?.textContent?.trim() ?? ''),
        )
    for (const how of ['back row', 'arrow', 'Esc'] as const) {
      await menu.getByTestId('more-copy').focus()
      await page.keyboard.press(toward)
      await expect(backRow).toBeFocused()
      // The back row, which shows its row's words, then the menu's own rows.
      await expect.poll(shownWords).toHaveLength(1 + besideRows('copy').length)
      if (!arabic) expect(await shownWords()).toEqual(['', ...besideRows('copy')])
      await expect(backRow).toHaveAccessibleName(arabic ? /^رجوع من/ : `Back from ${rowName('more-copy')}`)
      if (how === 'back row') await page.keyboard.press('Enter')
      else await page.keyboard.press(how === 'arrow' ? back : 'Escape')
      await expect(menu.getByTestId('more-copy')).toBeFocused()
      await expect.poll(shownWords).toHaveLength(fullMenuRows().length)
    }
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect.poll(() => focused(page)).toBe('bar-more')
    expect(errors).toEqual([])
  })

test('on a phone a tap on ⋯ that its sheet then covers opens the menu and runs no row under the finger', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await page.setViewportSize({ width: 390, height: 600 })
  await selectLayers(page, ['box'], { bar: true })
  const before = await page.evaluate(() => JSON.stringify(window.dazbee?.design()))
  const more = await page.getByTestId('bar-more').boundingBox()
  if (!more) throw new Error('no ⋯')
  await page.mouse.click(more.x + more.width / 2, more.y + more.height / 2)
  const menu = page.getByTestId('bar-more-menu')
  await expect(menu).toBeVisible()
  await entered(menu)
  // The whole sheet shows, and the finger let go where ⋯ was, over its Copy ▸ row, opened nothing.
  await expect(menu.locator('[data-menu-in-place]')).toHaveCount(0)
  await expect(menu.locator('[role^="menuitem"]')).toHaveCount(fullMenuRows().length)
  expect(await page.evaluate(() => JSON.stringify(window.dazbee?.design()))).toBe(before)
  expect(errors).toEqual([])
})

test('Esc that closes a menu goes no further: the full menu and the right-click menu close and the layer stays selected', async ({
  browser,
}) => {
  const { page, errors } = await openAt(browser)
  const selection = () => page.evaluate(() => window.dazbee?.selection())
  await selectLayers(page, ['badge'])
  await page.getByTestId('bar-more').click()
  await expect(page.getByTestId('bar-more-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('bar-more-menu')).toBeHidden()
  expect(await selection()).toEqual(['badge'])
  const at = await page.evaluate(() => {
    const box = window.dazbee?.boxOf('badge')
    return window.dazbee?.screenPoint((box?.x ?? 0) + 100, (box?.y ?? 0) + 100, 'sq')
  })
  await page.mouse.click(at?.x ?? 0, at?.y ?? 0, { button: 'right' })
  const right = page.getByTestId('stage-menu')
  await expect(right).toBeVisible()
  await entered(right)
  await page.keyboard.press('Escape')
  await expect(right).toBeHidden()
  expect(await selection()).toEqual(['badge'])
  // The next Esc is the stage's: it lets the selection go.
  await page.keyboard.press('Escape')
  await expect.poll(selection).toEqual([])
  expect(errors).toEqual([])
})

test('a row the pointer moves onto is lit and never ringed, in a menu beside a row too; the keyboard rings it', async ({
  browser,
}) => {
  const { page, errors } = await openAt(browser)
  await selectLayers(page, ['headline'])
  await page.getByTestId('bar-more').click()
  await page.getByTestId('more-paste').click()
  const sub = page.getByTestId('more-paste-menu')
  await expect(sub).toBeVisible()
  await entered(sub)
  const outline = (id: string) =>
    sub.locator(`[data-action="${id}"]`).evaluate((row) => getComputedStyle(row).outlineStyle)
  for (const id of ['paste', 'pasteStyle']) {
    await sub.locator(`[data-action="${id}"]`).hover()
    await expect(sub.locator(`[data-action="${id}"]`)).toBeFocused()
    expect(await outline(id), id).toBe('none')
  }
  await page.keyboard.press('ArrowUp')
  await expect(sub.locator('[data-action="paste"]')).toBeFocused()
  expect(await outline('paste')).toBe('solid')
  expect(errors).toEqual([])
})

for (const how of ['full menu', 'right-click menu'])
  test(`a menu beside a row of the ${how} opened by a click stays open when the pointer leaves the menus, and closes for another row`, async ({
    browser,
  }) => {
    const { page, errors } = await openAt(browser)
    let menu = page.getByTestId('bar-more-menu')
    if (how === 'full menu') {
      await selectLayers(page, ['headline'])
      await page.getByTestId('bar-more').click()
    } else {
      const at = await page.evaluate(() => {
        const box = window.dazbee?.boxOf('badge')
        return window.dazbee?.screenPoint((box?.x ?? 0) + 100, (box?.y ?? 0) + 100, 'sq')
      })
      await page.mouse.click(at?.x ?? 0, at?.y ?? 0, { button: 'right' })
      menu = page.getByTestId('stage-menu')
    }
    await expect(menu).toBeVisible()
    await menu.getByTestId('more-copy-to-frames').click()
    const sub = page.getByTestId('more-copy-to-frames-menu')
    await expect(sub).toBeVisible()
    // Off both menus in one move, onto the window's corner: it stays, its row lit.
    await page.mouse.move(2, 2)
    await page.waitForTimeout(400)
    await expect(sub).toBeVisible()
    await expect(menu.getByTestId('more-copy-to-frames')).toHaveAttribute('data-state', 'open')
    // Onto another row of the menu: this one closes.
    await menu.locator('[data-action="duplicate"]').hover()
    await expect(sub).toBeHidden()
    expect(errors).toEqual([])
  })

test('on a touch phone a tap on ⋯ opens the sheet wherever ⋯ sits, and runs no row the sheet brings under the finger', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openSized(browser, PHONE, {
    input: linkedMenuDesign(asset.id),
    touch: true,
    mobile: true,
  })
  const layers = () => page.evaluate(() => Object.keys(window.dazbee?.design().nodes ?? {}).length)
  await selectLayers(page, ['fresh-title'])
  const count = await layers()
  for (const lift of [0, 60, 120, 180, 240]) {
    // ⋯ lower on the screen each time, where the sheet's rows will come up under the finger.
    await page.evaluate(
      (dy) => {
        const camera = window.dazbee?.camera()
        if (camera) window.dazbee?.setCamera({ ...camera, y: camera.y + dy })
      },
      lift === 0 ? 0 : 60,
    )
    await nextFrame(page)
    const more = page.getByTestId('bar-more')
    if (!(await more.isVisible())) continue
    await more.tap()
    const menu = page.getByTestId('bar-more-menu')
    await expect(menu, `${lift}`).toBeVisible()
    await entered(menu)
    await expect(menu.locator('[data-menu-in-place]'), `${lift}`).toHaveCount(0)
    expect(await layers(), `${lift}`).toBe(count)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  }
  expect(errors).toEqual([])
})

for (const [row, steps] of [
  ['copy', 1],
  ['copyStyle', 1],
  ['copyStyle', 2],
] as const)
  test(`in Arabic a menu beside a row opened by a click takes a pointer moved onto its ${row} row in ${steps} step(s), and the row runs`, async ({
    browser,
  }) => {
    const { page, errors } = await openAt(browser, undefined, true)
    await selectLayers(page, ['headline'])
    const count = () => page.evaluate(() => Object.keys(window.dazbee?.design().nodes ?? {}).length)
    const before = await count()
    await page.getByTestId('bar-more').click()
    const menu = page.getByTestId('bar-more-menu')
    await expect(menu).toBeVisible()
    await entered(menu)
    await menu.getByTestId('more-copy').click()
    const sub = page.getByTestId('more-copy-menu')
    await expect(sub).toBeVisible()
    await entered(sub)
    const target = await sub.locator(`[data-action="${row}"]`).boundingBox()
    if (!target) throw new Error(`no ${row} row`)
    await page.evaluate(() => localStorage.removeItem('dazbee.copiedLayers'))
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps })
    await page.waitForTimeout(300)
    await expect(sub).toBeVisible()
    await page.mouse.down()
    await page.mouse.up()
    await expect(menu).toBeHidden()
    expect(await count()).toBe(before)
    expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['headline'])
    expect(errors).toEqual([])
  })
