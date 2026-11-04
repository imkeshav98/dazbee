// The focus as a menu of the bar by the selection closes, with the next input coming at once: Esc
// in one popover and a click opening another, Esc twice in the menu beside a row of ⋯ More, and the
// arrow back out of that menu then Esc. Both inputs are sent inside one page script that waits only
// on microtasks, so they land before any timer of the page runs, as they do for a person when the
// page is busy. Esc in a field of a menu still throws away what was typed.
import type { DesignInput } from '@dazbee/schema'

import { openStage, read, selection } from '../support/stage.ts'
import { expect, type Page, test } from '../support/test.ts'
import { barMenu, moreMenu, moreSubmenu } from '../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput => ({
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

const select = (page: Page, ids: string[]) => page.evaluate((ids) => window.dazbee?.select(ids), ids)
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
  const { page, errors } = await openStage(browser, design())
  await select(page, ['a'])
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
  const { page, errors } = await openStage(browser, design())
  await select(page, ['a'])
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
  const { page, errors } = await openStage(browser, design())
  await select(page, ['a'])
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
  const { page, errors } = await openStage(browser, design())
  await select(page, ['a'])
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
