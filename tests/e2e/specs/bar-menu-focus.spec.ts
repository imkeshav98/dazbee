// The focus as a menu of the bar by the selection closes, with the next input coming at once: Esc
// in one popover and a click opening another, and Esc twice in the menu beside a row of ⋯ More.
// Both inputs are sent inside one page script that waits only on microtasks, so they land before
// any timer of the page runs, as they do for a person when the page is busy.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { barMenu, moreSubmenu, openStage, selection } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Bar menu focus', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    a: { type: 'graphic', parentId: 'p1', index: 'a0', name: 'A', props: { x: 300, y: 400, width: 300, height: 300, shape: { kind: 'rect' }, fills: [{ type: 'solid', color: '#14213DFF' }] } },
  },
  overrides: {},
})

const select = (page: Page, ids: string[]) => page.evaluate((ids) => window.dazbee?.select(ids), ids)
/** Lets the page's timers run: one set now runs after every timer set before it. */
const timers = (page: Page) => page.evaluate(() => new Promise((r) => setTimeout(r, 50)))

/**
 * Runs in the page: presses Esc where the focus is, waits on microtasks only until `closed` is gone,
 * then does `next`, and waits the same way until `then` holds. It throws if React needs a timer to get there.
 */
const escThen = (page: Page, step: { closed: string; next: 'esc' | string; then: string }) =>
  page.evaluate(async ({ closed, next, then }) => {
    const there = (id: string) => document.querySelector(`[data-testid="${id}"]`) !== null
    const until = async (done: () => boolean, what: string) => {
      for (let i = 0; i < 1000 && !done(); i++) await Promise.resolve()
      if (!done()) throw new Error(`${what} without a timer`)
    }
    const esc = () => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
    esc()
    await until(() => !there(closed), `${closed} did not close`)
    if (next === 'esc') esc()
    else (document.querySelector(`[data-testid="${next}"]`) as HTMLElement).click()
    await until(() => (then.startsWith('!') ? !there(then.slice(1)) : there(then)), `${then} did not come`)
  }, step)

test('Esc in one popover of the bar and a click on another at once: the new one stays open with the focus', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['a'])
  await barMenu(page, 'colour')

  await escThen(page, { closed: 'bar-colour-menu', next: 'bar-outline', then: 'bar-outline-menu' })
  await timers(page)

  const outline = page.getByTestId('bar-outline-menu')
  await expect(outline).toBeVisible()
  expect(await outline.evaluate((menu) => menu.contains(document.activeElement))).toBe(true)
  await expect(page.getByTestId('bar-colour-menu')).toBeHidden()
  expect(errors).toEqual([])
})

test('Esc twice at once in the menu beside Order: the first closes it, the second ⋯ More, and the layer stays selected', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['a'])
  const order = await moreSubmenu(page, 'order')
  expect(await order.evaluate((menu) => menu.contains(document.activeElement))).toBe(true)

  await escThen(page, { closed: 'more-order-menu', next: 'esc', then: '!bar-more-menu' })
  await timers(page)

  expect(await selection(page)).toEqual(['a'])
  await expect(page.getByTestId('bar-more-menu')).toBeHidden()
  await expect(page.getByTestId('bar-more')).toBeVisible()
  await expect(page.getByTestId('bar-more')).toBeFocused()
  expect(errors).toEqual([])
})
