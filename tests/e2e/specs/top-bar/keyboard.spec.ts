// The top bar by keyboard (#287): Tab and the arrows along the bar, Esc giving the focus back and
// clearing the selection, Esc closing the second row, the size field's arrows, and Esc closing a
// panel first wherever the focus is, after what stands over it: a dialog, the Share menu or its
// card, the account menu, the zoom menu or the shape menu, a pop-up opened over one of those menus
// first; a field outside the panel, or a number field being typed in, throwing away what was typed
// and leaving the panel open; and the focus as a menu of the bar closes with the next input coming
// at once.
import type { DesignInput } from '@dazbee/schema'

import { photo, upload } from '../../support/assets.ts'
import { layoutProblems } from '../../support/layout.ts'
import { frameDesign } from '../../support/seed.ts'
import { nextFrame, openStage, read, selection, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { arrangeSubmenu, barMenu, PIECES, UNCUT } from '../../support/top-bar.ts'
import { topBarDesign } from '../../support/top-bar-design.ts'

test.describe.configure({ timeout: 240_000 })

/**
 * Narrows the window from a tablet's 820 px, 20 px at a time down to 640, until the bar of the
 * selection has more items than fit and so a second row behind its ⋯. Returns the width.
 */
async function narrowUntilSecondRow(page: Page) {
  for (let width = 820; width >= 640; width -= 20) {
    await page.setViewportSize({ width, height: 1180 })
    await nextFrame(page)
    if (await page.getByTestId('bar-overflow').isVisible()) return width
  }
  throw new Error('the bar fits in one row at every tablet width')
}

test('Tab reaches the top bar once and the arrows move along it, never the layer; a panel takes the focus, Esc gives it back, and a second Esc clears the selection', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await selectLayers(page, ['box'])
  const before = (await read(page)).nodes.box?.props
  const bar = page.getByTestId('top-bar')
  await expect(bar.locator('[data-bar-item][tabindex="0"]')).toHaveCount(1)
  const items = bar.locator('[data-bar-item]')
  await items.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(items.nth(1)).toBeFocused()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(items.nth(2)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(items.nth(1)).toBeFocused()
  // Up and down keep the focus where it is in the bar.
  for (const key of ['ArrowUp', 'ArrowDown', 'Shift+ArrowUp', 'Shift+ArrowDown']) {
    await page.keyboard.press(key)
    await expect(items.nth(1)).toBeFocused()
  }
  await page.keyboard.press('End')
  await expect(items.last()).toBeFocused()
  await page.keyboard.press('Home')
  await expect(items.first()).toBeFocused()
  // None of the arrows moved the layer.
  await nextFrame(page)
  expect((await read(page)).nodes.box?.props).toEqual(before)
  expect(await page.evaluate(() => window.dazbee?.canUndo())).toBe(false)

  await page.getByTestId('bar-effects').click()
  const panel = page.locator('#edit-panel')
  await expect(panel).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('#edit-panel') !== null)).toBe(true)
  // Keys pressed in the panel are its own: Delete there leaves the layer.
  await page.keyboard.press('Delete')
  expect(await page.evaluate(() => Boolean(window.dazbee?.design().nodes.box))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page.getByTestId('bar-effects')).toBeFocused()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['box'])
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => window.dazbee?.selection())).toEqual([])
  expect(errors).toEqual([])
})

test("Esc closes the bar's second row and keeps the selection; the arrows and End reach only the items that show", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await page.setViewportSize({ width: 820, height: 1180 })
  await selectLayers(page, ['headline'])
  await narrowUntilSecondRow(page)
  const more = page.getByTestId('bar-overflow')
  await expect(more).toBeVisible()
  const row = page.getByTestId('top-bar-row')
  await row.locator('[data-bar-item]').first().focus()
  // Arrange ends the first row, after More controls.
  await page.keyboard.press('End')
  await expect(page.getByTestId('bar-arrange')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(more).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(row.locator('[data-bar-item]').first()).toBeFocused()

  await more.click()
  await expect(page.getByTestId('top-bar-overflow')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('top-bar-overflow')).toBeHidden()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['headline'])
  expect(errors).toEqual([])
})

test("Esc closes the keyboard shortcuts dialog over the bar's second row first, and leaves the row open", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await page.setViewportSize({ width: 820, height: 1180 })
  await selectLayers(page, ['headline'])
  await narrowUntilSecondRow(page)
  await page.getByTestId('bar-overflow').click()
  const row = page.getByTestId('top-bar-overflow')
  await expect(row).toBeVisible()
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click()
  const dialog = page.getByTestId('shortcuts')
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(row).toBeVisible()
  expect(await selection(page)).toEqual(['headline'])
  // The next Esc closes the row.
  await page.keyboard.press('Escape')
  await expect(row).toBeHidden()
  expect(await selection(page)).toEqual(['headline'])
  expect(errors).toEqual([])
})

test('the size field steps with the arrows; a pop-up closes when the window changes size', async ({ browser }) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  const size = () =>
    page.evaluate(
      () => (window.dazbee?.design().nodes.headline?.props as { style: { fontSize: number } }).style.fontSize,
    )
  await selectLayers(page, ['headline'])
  await page.getByTestId('bar-size-field').click()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect.poll(size).toBe(66)
  await page.keyboard.press('Shift+ArrowDown')
  await expect.poll(size).toBe(56)

  await barMenu(page, 'align')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('bar-align-menu')).toBeHidden()
  expect(errors).toEqual([])
})

test('⋯ on the top bar leaves an open panel open, and Esc closes the panel first wherever the focus is', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await page.setViewportSize({ width: 820, height: 1180 })
  await selectLayers(page, ['headline'])
  await narrowUntilSecondRow(page)
  await barMenu(page, 'font')
  await page.getByTestId('bar-overflow').click()
  await expect(page.getByTestId('top-bar-overflow')).toBeVisible()
  await expect(page.locator('#edit-panel')).toBeVisible()
  await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Escape')
  await expect(page.locator('#edit-panel')).toHaveCount(0)
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['headline'])
  expect(errors).toEqual([])
})

test('Esc closes the keyboard shortcuts dialog over the Colour panel first, and leaves the panel open', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await selectLayers(page, ['box'])
  const panel = await barMenu(page, 'colour')
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click()
  const dialog = page.getByTestId('shortcuts')
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(panel).toBeVisible()
  expect(await selection(page)).toEqual(['box'])
  // The next Esc closes the panel.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect(errors).toEqual([])
})

test('the Share menu opens with the focus on its first item and the arrows move through it; Esc closes only it, over the Colour panel or not, and never clears the selection', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await selectLayers(page, ['headline'])
  const panel = await barMenu(page, 'colour')
  const share = page.getByTestId('share-open')
  const [exportItem, templateItem] = [page.getByTestId('export-open'), page.getByTestId('template-open')]
  await share.click()
  await expect(exportItem).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(templateItem).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(exportItem).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(templateItem).toBeFocused()
  await page.keyboard.press('Home')
  await expect(exportItem).toBeFocused()
  await page.keyboard.press('End')
  await expect(templateItem).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(exportItem).toBeHidden()
  await expect(share).toBeFocused()
  await expect(panel).toBeVisible()
  expect(await selection(page)).toEqual(['headline'])
  // The next Esc closes the panel, and keeps the selection.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect(await selection(page)).toEqual(['headline'])

  // With no panel under it, the menu's Esc still keeps the selection.
  await share.click()
  await expect(exportItem).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(exportItem).toBeHidden()
  await expect(share).toBeFocused()
  expect(await selection(page)).toEqual(['headline'])
  expect(errors).toEqual([])
})

test('Esc closes the Export card over the Position panel first, and the next Esc the panel', async ({ browser }) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await selectLayers(page, ['headline'])
  const panel = await barMenu(page, 'position')
  await page.getByTestId('share-open').click()
  await page.getByTestId('export-open').click()
  const card = page.getByTestId('export')
  await expect(card).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  await expect(page.getByTestId('share-open')).toBeFocused()
  await expect(panel).toBeVisible()
  expect(await selection(page)).toEqual(['headline'])
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect(await selection(page)).toEqual(['headline'])
  expect(errors).toEqual([])
})

test('Esc closes the account menu over the Colour panel first, wherever the focus is, and never clears the selection; over the Share menu, it closes first', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await selectLayers(page, ['box'])
  const panel = await barMenu(page, 'colour')
  const avatar = page.getByTestId('account-open')
  const account = page.getByTestId('account')

  // Opened with a click, the focus is on the avatar.
  await avatar.click()
  await expect(account).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(account).toBeHidden()
  await expect(panel).toBeVisible()
  await expect(avatar).toBeFocused()
  expect(await selection(page)).toEqual(['box'])

  // With the focus in the menu, Esc gives it back to the avatar.
  await avatar.click()
  await account.getByRole('radio', { name: 'English', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(account).toBeHidden()
  await expect(panel).toBeVisible()
  await expect(avatar).toBeFocused()
  expect(await selection(page)).toEqual(['box'])
  // The next Esc closes the panel.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect(await selection(page)).toEqual(['box'])

  // Opened from the keyboard over the Share menu, with the focus in it, it closes first, then the Share menu.
  const share = page.getByTestId('share-open')
  const exportItem = page.getByTestId('export-open')
  await share.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Tab')
  await expect(avatar).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(account).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(account.getByRole('radio', { name: 'English', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(account).toBeHidden()
  await expect(exportItem).toBeVisible()
  await expect(avatar).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(exportItem).toBeHidden()
  expect(await selection(page)).toEqual(['box'])
  expect(errors).toEqual([])
})

test('a zoom or shape pop-up opened from the keyboard over the Share or account menu closes first on Esc, then the menu, then the Colour panel', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await selectLayers(page, ['box'])
  const panel = await barMenu(page, 'colour')
  const exportItem = page.getByTestId('export-open')
  const account = page.getByTestId('account')
  const zoom = page.getByTestId('zoom-menu')
  const shapes = page.getByRole('menu', { name: 'Shapes' })

  await page.getByTestId('share-open').click()
  await expect(exportItem).toBeFocused()
  await page.getByTestId('zoom').focus()
  await page.keyboard.press('Enter')
  await expect(zoom).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(zoom).toBeHidden()
  await expect(exportItem).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(exportItem).toBeHidden()
  await expect(panel).toBeVisible()

  await page.getByTestId('account-open').click()
  await expect(account).toBeVisible()
  await page.getByTestId('shape-menu').focus()
  await page.keyboard.press('Enter')
  await expect(shapes).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(shapes).toBeHidden()
  await expect(account).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(account).toBeHidden()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect(await selection(page)).toEqual(['box'])
  expect(errors).toEqual([])
})

test("Esc in a field outside the panel, the design's name or the bar's size, throws away what was typed and leaves the field, and the next Esc closes the panel", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  const fontSize = () =>
    page.evaluate(
      () => (window.dazbee?.design().nodes.headline?.props as { style: { fontSize: number } }).style.fontSize,
    )
  await selectLayers(page, ['headline'])
  const name = page.getByTestId('island-start').locator('h1 button')
  const nameField = page.locator('input[name="design-name"]')
  let panel = await barMenu(page, 'colour')
  await name.click()
  await nameField.fill('Never kept')
  await page.keyboard.press('Escape')
  await expect(nameField).toHaveCount(0)
  await expect(name).toHaveText('Top bar')
  await expect(name).toBeFocused()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect(await selection(page)).toEqual(['headline'])

  panel = await barMenu(page, 'colour')
  const size = page.getByTestId('bar-size-field')
  await size.fill('99')
  await page.keyboard.press('Escape')
  await expect(size).toHaveValue('64')
  await expect(size).not.toBeFocused()
  await expect(panel).toBeVisible()
  expect(await fontSize()).toBe(64)
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect(await fontSize()).toBe(64)
  expect(await selection(page)).toEqual(['headline'])
  expect(errors).toEqual([])
})

test('the zoom menu and the shape menu keep closing on their own Esc over the Colour panel, which stays open with the selection', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await selectLayers(page, ['box'])
  const panel = await barMenu(page, 'colour')
  await page.getByTestId('zoom').click()
  const zoom = page.getByTestId('zoom-menu')
  await expect(zoom).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(zoom).toBeHidden()
  await expect(panel).toBeVisible()
  expect(await selection(page)).toEqual(['box'])

  await page.getByTestId('shape-menu').click()
  const shapes = page.getByRole('menu', { name: 'Shapes' })
  await expect(shapes).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(shapes).toBeHidden()
  await expect(panel).toBeVisible()
  expect(await selection(page)).toEqual(['box'])
  // The next Esc closes the panel.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect(await selection(page)).toEqual(['box'])
  expect(errors).toEqual([])
})

// The focus as a menu of the bar by the selection closes, with the next input coming at once: Esc
// in one popover and a click opening another, Esc twice in the menu beside a row of ⋯ More, and the
// arrow back out of that menu then Esc. Both inputs are sent inside one page script that waits only
// on microtasks, so they land before any timer of the page runs, as they do for a person when the
// page is busy. Esc in a field of a menu still throws away what was typed.
test.describe('the focus as a menu of the bar closes', () => {
  test.describe.configure({ timeout: 120_000 })

  /** One frame holding the layer A. */
  const oneLayer = (): DesignInput =>
    frameDesign({
      name: 'Bar menu focus',
      nodes: {
        a: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a0',
          name: 'A',
          props: {
            x: 300,
            y: 400,
            width: 300,
            height: 300,
            shape: { kind: 'rect' },
            fills: [{ type: 'solid', color: '#14213DFF' }],
          },
        },
      },
    })

  /** Lets the page's timers run: one set now runs after every timer set before it. */
  const timers = (page: Page) => page.evaluate(() => new Promise((r) => setTimeout(r, 50)))

  /**
   * Runs in the page: presses `key` where the focus is, waits on microtasks only until `closed` is
   * gone, then presses Esc where the focus is then (`next: 'esc'`) or clicks the button with the test
   * id `next`, and waits the same way until `then` is there (or gone, with a leading `!`). It throws
   * if React needs a timer to get there.
   */
  const keyThen = (page: Page, step: { key: 'Escape' | 'ArrowLeft'; closed: string; next: string; then: string }) =>
    page.evaluate(async ({ key, closed, next, then }) => {
      const there = (id: string) => document.querySelector(`[data-testid="${id}"]`) !== null
      const until = async (done: () => boolean, what: string) => {
        for (let i = 0; i < 1000 && !done(); i++) await Promise.resolve()
        if (!done()) throw new Error(`${what} without a timer`)
      }
      const press = (name: string) =>
        (document.activeElement ?? document.body).dispatchEvent(
          new KeyboardEvent('keydown', { key: name, code: name, bubbles: true, cancelable: true }),
        )
      press(key)
      await until(() => !there(closed), `${closed} did not close`)
      if (next === 'esc') press('Escape')
      else (document.querySelector(`[data-testid="${next}"]`) as HTMLElement).click()
      await until(() => (then.startsWith('!') ? !there(then.slice(1)) : there(then)), `${then} did not come`)
    }, step)

  test('Esc in one popover of the bar and a click on another at once: the new one stays open with the focus', async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, oneLayer())
    await selectLayers(page, ['a'])
    await barMenu(page, 'colour')

    await keyThen(page, { key: 'Escape', closed: 'bar-colour-menu', next: 'bar-outline', then: 'bar-outline-menu' })
    await timers(page)

    const outline = page.getByTestId('bar-outline-menu')
    await expect(outline).toBeVisible()
    expect(await outline.evaluate((menu) => menu.contains(document.activeElement))).toBe(true)
    await expect(page.getByTestId('bar-colour-menu')).toBeHidden()
    expect(errors).toEqual([])
  })

  test("Esc twice at once in the menu beside Order: the first closes it, the second the top bar's ⋯, and the layer stays selected", async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, oneLayer())
    await selectLayers(page, ['a'])
    const order = await arrangeSubmenu(page, 'order')
    expect(await order.evaluate((menu) => menu.contains(document.activeElement))).toBe(true)

    await keyThen(page, { key: 'Escape', closed: 'more-order-menu', next: 'esc', then: '!bar-arrange-menu' })
    await timers(page)

    expect(await selection(page)).toEqual(['a'])
    await expect(page.getByTestId('bar-arrange-menu')).toBeHidden()
    await expect(page.getByTestId('bar-arrange')).toBeVisible()
    await expect(page.getByTestId('bar-arrange')).toBeFocused()
    expect(errors).toEqual([])
  })

  test("the arrow back out of the menu beside Order, then Esc at once: the top bar's ⋯ closes and the layer stays selected", async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, oneLayer())
    await selectLayers(page, ['a'])
    const order = await arrangeSubmenu(page, 'order')
    expect(await order.evaluate((menu) => menu.contains(document.activeElement))).toBe(true)

    await keyThen(page, { key: 'ArrowLeft', closed: 'more-order-menu', next: 'esc', then: '!bar-arrange-menu' })
    await timers(page)

    expect(await selection(page)).toEqual(['a'])
    await expect(page.getByTestId('bar-arrange')).toBeVisible()
    await expect(page.getByTestId('bar-arrange')).toBeFocused()
    expect(errors).toEqual([])
  })

  for (const where of ['arrange', 'position'] as const)
    test(`Esc in ${where === 'arrange' ? "Arrange's" : "the Position panel's"} rotation field while typing throws away what was typed and keeps the focus there, the ${where === 'arrange' ? 'menu' : 'panel'} open; the next Esc closes it, and the layer keeps its rotation`, async ({
      browser,
    }) => {
      const { page, errors } = await openStage(browser, oneLayer())
      await selectLayers(page, ['a'])
      const holder = await barMenu(page, where)
      const rotation = holder.getByRole('spinbutton', { name: 'Rotation in degrees' })
      await rotation.fill('45')
      await expect(rotation).toBeFocused()

      // The field being typed in is the top-most thing: the first Esc is its own.
      await page.keyboard.press('Escape')
      await expect(rotation).toHaveValue('0')
      await expect(rotation).toBeFocused()
      await timers(page)
      await expect(holder).toBeVisible()
      expect((await read(page)).nodes.a?.props.rotation).toBe(0)

      // With nothing typed, Esc closes what the field is in, and the focus goes back to its item.
      await page.keyboard.press('Escape')
      await expect(holder).toBeHidden()
      await timers(page)
      expect((await read(page)).nodes.a?.props.rotation).toBe(0)
      expect(await selection(page)).toEqual(['a'])
      await expect(page.getByTestId(`bar-${where}`)).toBeFocused()
      expect(errors).toEqual([])
    })
})
