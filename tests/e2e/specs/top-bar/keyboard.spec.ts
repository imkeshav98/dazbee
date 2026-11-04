// The top bar by keyboard (#287): Tab and the arrows along the bar, Esc giving the focus back and
// clearing the selection, Esc closing the second row, the size field's arrows, and Esc closing a
// panel first wherever the focus is; and the focus as a menu of the bar closes with the next input
// coming at once.
import type { DesignInput } from '@dazbee/schema'

import { photo, upload } from '../../support/assets.ts'
import { layoutProblems } from '../../support/layout.ts'
import { openStage, read, selection, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, moreMenu, moreSubmenu, PIECES, UNCUT } from '../../support/top-bar.ts'
import { design } from '../../support/top-bar-design.ts'

test.describe.configure({ timeout: 240_000 })

test('Tab reaches the top bar once and the arrows move along it; a panel takes the focus, Esc gives it back, and a second Esc clears the selection', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await selectLayers(page, ['box'])
  const bar = page.getByTestId('top-bar')
  await expect(bar.locator('[data-bar-item][tabindex="0"]')).toHaveCount(1)
  const items = bar.locator('[data-bar-item]')
  await items.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(items.nth(1)).toBeFocused()
  await page.keyboard.press('End')
  await expect(items.last()).toBeFocused()
  await page.keyboard.press('Home')
  await expect(items.first()).toBeFocused()

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
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.setViewportSize({ width: 820, height: 1180 })
  await selectLayers(page, ['headline'])
  const more = page.getByTestId('bar-overflow')
  await expect(more).toBeVisible()
  const row = page.getByTestId('top-bar-row')
  await row.locator('[data-bar-item]').first().focus()
  await page.keyboard.press('End')
  await expect(more).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(row.locator('[data-bar-item]').first()).toBeFocused()

  await more.click()
  await expect(page.getByTestId('top-bar-overflow')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('top-bar-overflow')).toBeHidden()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['headline'])
  expect(errors).toEqual([])
})

test('the size field steps with the arrows; a pop-up closes when the window changes size; a new selection shows the phone bar from its start', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  const size = () =>
    page.evaluate(() => {
      const d = window.dazbee?.design()
      return (
        { ...d?.nodes.headline?.props, ...d?.overrides['format:sq']?.headline } as { style: { fontSize: number } }
      ).style.fontSize
    })
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

  const row = page.getByTestId('top-bar-row')
  await row.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
  await selectLayers(page, ['box'])
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBe(0)
  expect(errors).toEqual([])
})

test('⋯ on the top bar leaves an open panel open, and Esc closes the panel first wherever the focus is', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await page.setViewportSize({ width: 820, height: 1180 })
  await selectLayers(page, ['headline'])
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

// The focus as a menu of the bar by the selection closes, with the next input coming at once: Esc
// in one popover and a click opening another, Esc twice in the menu beside a row of ⋯ More, and the
// arrow back out of that menu then Esc. Both inputs are sent inside one page script that waits only
// on microtasks, so they land before any timer of the page runs, as they do for a person when the
// page is busy. Esc in a field of a menu still throws away what was typed.
test.describe('the focus as a menu of the bar closes', () => {
  test.describe.configure({ timeout: 120_000 })

  /** One page in one format, holding the layer A. */
  const oneLayer = (): DesignInput => ({
    meta: {
      schemaVersion: 5,
      designId: 'replaced-by-the-api',
      name: 'Bar menu focus',
      kind: 'single',
      primaryFormatId: 'sq',
    },
    formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
    pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
    nodes: {
      a: {
        type: 'graphic',
        parentId: 'p1',
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
    overrides: {},
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

  test('Esc twice at once in the menu beside Order: the first closes it, the second ⋯ More, and the layer stays selected', async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, oneLayer())
    await selectLayers(page, ['a'])
    const order = await moreSubmenu(page, 'order')
    expect(await order.evaluate((menu) => menu.contains(document.activeElement))).toBe(true)

    await keyThen(page, { key: 'Escape', closed: 'more-order-menu', next: 'esc', then: '!bar-more-menu' })
    await timers(page)

    expect(await selection(page)).toEqual(['a'])
    await expect(page.getByTestId('bar-more-menu')).toBeHidden()
    await expect(page.getByTestId('bar-more')).toBeVisible()
    await expect(page.getByTestId('bar-more')).toBeFocused()
    expect(errors).toEqual([])
  })

  test('the arrow back out of the menu beside Order, then Esc at once: ⋯ More closes and the layer stays selected', async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, oneLayer())
    await selectLayers(page, ['a'])
    const order = await moreSubmenu(page, 'order')
    expect(await order.evaluate((menu) => menu.contains(document.activeElement))).toBe(true)

    await keyThen(page, { key: 'ArrowLeft', closed: 'more-order-menu', next: 'esc', then: '!bar-more-menu' })
    await timers(page)

    expect(await selection(page)).toEqual(['a'])
    await expect(page.getByTestId('bar-more')).toBeVisible()
    await expect(page.getByTestId('bar-more')).toBeFocused()
    expect(errors).toEqual([])
  })

  test('Esc in a number field of ⋯ More throws away what was typed: the menu closes and the layer keeps its rotation', async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, oneLayer())
    await selectLayers(page, ['a'])
    const more = await moreMenu(page)
    const rotation = more.getByRole('spinbutton', { name: 'Rotation in degrees' })
    await rotation.fill('45')
    await expect(rotation).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(more).toBeHidden()
    await timers(page)

    expect((await read(page)).nodes.a?.props.rotation).toBe(0)
    expect(await selection(page)).toEqual(['a'])
    await expect(page.getByTestId('bar-more')).toBeFocused()
    expect(errors).toEqual([])
  })
})
