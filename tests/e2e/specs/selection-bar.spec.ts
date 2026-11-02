// The bar by the selection in Chromium: where it sits (above, centred, below at the stage's top, at
// the top over a selection filling the stage, gone off the stage), out of the way during a drag,
// reached by keyboard as one toolbar, its popovers closed by Esc or a click on the canvas, and the
// right-click menu on a locked layer. For text it adds the font, size, colour, bold, align and effects.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { screenPoint } from '../support/editor.ts'
import { moreMenu, openStage } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

const rect = (name: string, index: string, x: number, y: number, color: string, extra: Record<string, unknown> = {}) => ({
  type: 'graphic' as const, parentId: 'p1', index, name,
  props: { x, y, width: 260, height: 200, shape: { kind: 'rect' as const }, fills: [{ type: 'solid' as const, color }], ...extra },
})

const design = (): DesignInput => ({
  meta: { schemaVersion: 3, designId: 'replaced-by-the-api', name: 'Bar', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    top: rect('Top', 'a0', 400, 0, '#FCA311FF'),
    a: rect('A', 'a1', 120, 380, '#14213DFF'),
    b: rect('B', 'a2', 440, 380, '#E0262BFF'),
    turned: rect('Turned', 'a3', 700, 700, '#2A9D8FFF', { rotation: 30 }),
    headline: { type: 'text', parentId: 'p1', index: 'a4', name: 'Headline', props: { x: 80, y: 900, width: 520, height: 90, boxMode: 'autoHeight', text: 'Summer sale', style: { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 400, color: '#111111FF' } } },
  },
  overrides: {},
})

/** Pixels between the selection and the bar. */
const GAP = 28

const select = (page: Page, ids: string[]) => page.evaluate((ids) => window.dazbee?.select(ids), ids)
const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
/** The selection's upright box and the bar, both in the stage's pixels. */
const geometry = async (page: Page) => {
  await page.evaluate(() => window.dazbee?.drawn())
  await frames(page)
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('[data-testid="selection-bar"]')
    if (!bar) throw new Error('no bar')
    const box = window.dazbee?.selectionRect()
    if (!box) throw new Error('no selection')
    return { box, left: bar.offsetLeft, top: bar.offsetTop, width: bar.offsetWidth, height: bar.offsetHeight, shown: getComputedStyle(bar).visibility === 'visible' }
  })
}

test('the bar sits centred above the selection, below it at the stage top, over a selection filling the stage, and goes once the selection is off the stage', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  for (const ids of [['a'], ['a', 'b'], ['turned']]) {
    await select(page, ids)
    const g = await geometry(page)
    expect(g.shown).toBe(true)
    expect(Math.abs(g.left + g.width / 2 - (g.box.x + g.box.width / 2))).toBeLessThanOrEqual(1)
    expect(Math.abs(g.top + g.height + GAP - g.box.y)).toBeLessThanOrEqual(1)
  }
  // Several layers add Combine, Group, Box and Stack: the bar grows and stays centred.
  await select(page, ['a'])
  const one = await geometry(page)
  await select(page, ['a', 'b'])
  const two = await geometry(page)
  expect(two.width).toBeGreaterThan(one.width)

  // At the stage's top there is no room above for the islands: the bar goes below.
  await page.evaluate(() => window.dazbee?.setCamera({ x: 100, y: 0, zoom: 0.8 }))
  await select(page, ['top'])
  const below = await geometry(page)
  expect(Math.abs(below.top - (below.box.y + below.box.height + GAP))).toBeLessThanOrEqual(1)

  // A selection filling the stage leaves no room above or below: the bar sits at the stage's top, over it.
  await select(page, ['a'])
  await page.evaluate(() => window.dazbee?.fitSelection())
  await page.evaluate(() => window.dazbee?.zoomTo(4))
  expect((await geometry(page)).top).toBe(64)

  // Off the stage it has nothing to sit by.
  await page.evaluate(() => window.dazbee?.setCamera({ x: 3000, y: 60, zoom: 0.8 }))
  expect((await geometry(page)).shown).toBe(false)
  await page.evaluate(() => window.dazbee?.setCamera({ x: 100, y: 60, zoom: 0.8 }))
  expect((await geometry(page)).shown).toBe(true)
  expect(errors).toEqual([])
})

test('the bar keeps out of the way during a drag and comes back by the layer where it lands', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const bar = page.getByTestId('selection-bar')
  const from = await screenPoint(page, 250, 480)
  await page.mouse.click(from.x, from.y)
  await expect(bar).toBeVisible()
  const before = await geometry(page)
  await page.mouse.down()
  await page.mouse.move(from.x + 40, from.y + 30, { steps: 5 })
  await expect(bar).toBeHidden()
  await page.mouse.move(from.x + 80, from.y + 60, { steps: 5 })
  await page.mouse.up()
  await expect(bar).toBeVisible()
  const after = await geometry(page)
  expect(after.left - before.left).toBeGreaterThan(40)
  expect(after.top - before.top).toBeGreaterThan(30)
  expect(errors).toEqual([])
})

test('Tab reaches the bar once, the arrows move along it, Enter opens a popover and Esc or a canvas click closes it', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['a', 'b'])
  const bar = page.getByTestId('selection-bar')
  const items = bar.locator('[data-bar-item]')
  // Colour, Outline, Effects, Line up, Combine, Group, Box, Stack and ⋯ More.
  await expect(items).toHaveCount(9)
  // One stop for Tab: only one button is in the tab order.
  await expect(bar.locator('[data-bar-item][tabindex="0"]')).toHaveCount(1)
  await items.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(items.nth(1)).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByTestId('bar-more')).toBeFocused()
  await expect(bar.locator('[data-bar-item][tabindex="0"]')).toHaveAttribute('data-testid', 'bar-more')
  await page.keyboard.press('Home')
  await expect(items.first()).toBeFocused()

  // Enter opens Colour, the first; Esc closes it and leaves the selection as it was.
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('bar-colour-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('bar-colour-menu')).toBeHidden()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['a', 'b'])

  // A click on the canvas closes it too.
  await page.getByTestId('bar-line-up').click()
  await expect(page.getByTestId('bar-line-up-menu')).toBeVisible()
  const empty = await screenPoint(page, 1000, 100)
  await page.mouse.click(empty.x, empty.y)
  await expect(page.getByTestId('bar-line-up-menu')).toBeHidden()
  expect(errors).toEqual([])
})

test('Hide and Lock turn back from the same row; a right-click on a locked layer opens its menu with Unlock', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  // Hide, like the eye in Layers, goes to the format shown.
  const visible = () => page.evaluate(() => {
    const d = window.dazbee?.design()
    return ({ ...d?.nodes.a?.props, ...d?.overrides['format:sq']?.a } as { visible?: boolean }).visible !== false
  })
  const locked = () => page.evaluate(() => Object.values(window.dazbee?.design().nodes.a?.lock ?? {}).some(Boolean))
  await select(page, ['a'])
  await (await moreMenu(page)).getByRole('button', { name: 'Hide' }).click()
  await expect.poll(visible).toBe(false)
  await (await moreMenu(page)).getByRole('button', { name: 'Show' }).click()
  await expect.poll(visible).toBe(true)

  await (await moreMenu(page)).getByRole('button', { name: 'Lock' }).click()
  await expect.poll(locked).toBe(true)
  await select(page, [])
  const at = await screenPoint(page, 250, 480)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  const menu = page.getByTestId('stage-menu')
  await menu.getByRole('button', { name: 'Unlock' }).click()
  await expect.poll(locked).toBe(false)
  await expect(menu).toBeHidden()

  // Right-clicking another layer while the menu is open opens it for that one.
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await expect(menu).toBeVisible()
  const other = await screenPoint(page, 570, 480)
  await page.mouse.click(other.x, other.y, { button: 'right' })
  await expect(menu).toBeVisible()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['b'])
  expect(errors).toEqual([])
})

test('text adds the font, size, colour, bold, align and effects; bold turns on and off, one undo step each', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const weight = () => page.evaluate(() => (window.dazbee?.design().nodes.headline?.props as { style: { fontWeight: number } }).style.fontWeight)
  await select(page, ['headline'])
  const bar = page.getByTestId('selection-bar')
  for (const id of ['font', 'size', 'colour', 'align', 'effects']) await expect(bar.getByTestId(`bar-${id}`)).toBeVisible()
  await expect(bar.getByTestId('bar-font')).toHaveText('Noto Sans')
  await expect(bar.getByTestId('bar-size')).toHaveText('64')

  const bold = bar.getByTestId('bar-bold')
  await expect(bold).toHaveAttribute('aria-pressed', 'false')
  await bold.click()
  await expect.poll(weight).toBe(700)
  await expect(bold).toHaveAttribute('aria-pressed', 'true')
  await bold.click()
  await expect.poll(weight).toBe(400)
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(weight).toBe(700)
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(weight).toBe(400)

  // One popover at a time: opening Align closes Size.
  await bar.getByTestId('bar-size').click()
  await expect(page.getByTestId('bar-size-menu')).toBeVisible()
  await bar.getByTestId('bar-align').click()
  await expect(page.getByTestId('bar-align-menu')).toBeVisible()
  await expect(page.getByTestId('bar-size-menu')).toBeHidden()
  // The focus stays in the new popover, so it stays open.
  const focusIn = (id: string) => page.evaluate((id) => document.activeElement?.closest(`[data-testid="${id}"]`) !== null, id)
  await expect.poll(() => focusIn('bar-align-menu')).toBe(true)
  await expect(page.getByTestId('bar-align-menu')).toBeVisible()
  await bar.getByTestId('bar-more').click()
  await expect.poll(() => focusIn('bar-more-menu')).toBe(true)
  await expect(page.getByTestId('bar-more-menu')).toBeVisible()
  await page.keyboard.press('Escape')

  // Text with another layer offers the text's font only; bold is mixed over bold and regular text.
  await select(page, ['headline', 'a'])
  await expect(bar.getByTestId('bar-font')).toHaveText('Noto Sans')
  await expect(bar.getByTestId('bar-size')).toHaveCount(0)
  await select(page, ['headline'])
  await page.evaluate(() => window.dazbee?.perform('duplicate'))
  const copy = (await page.evaluate(() => window.dazbee?.selection() ?? []))[0] ?? ''
  await select(page, ['headline'])
  await bold.click()
  await select(page, ['headline', copy])
  await expect(bold).toHaveAttribute('aria-pressed', 'mixed')
  expect(errors).toEqual([])
})
