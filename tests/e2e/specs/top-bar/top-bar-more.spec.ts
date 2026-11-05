// The top bar's ⋯ for the selected layers (#457): its last item, holding how they sit. Order ▸, Line
// up ▸, the rotation field and, for text, Text direction ▸, by mouse and keyboard, each one undo
// step; a rotated layer and one inside an auto layout box; locked; at the three screen sizes, where
// on a phone it is a sheet at the bottom and stays at the bar's end.
import type { DesignInput } from '@dazbee/schema'

import { setCookies, writeOutput } from '../../support/editor.ts'
import { enter } from '../../support/fields.ts'
import { layoutProblems, rowHeights, SCREEN_SIZES } from '../../support/layout.ts'
import { frameDesign } from '../../support/seed.ts'
import { fitSettled, nextFrame, openStage, order, perform, props, read, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { layerMore, layerMoreSubmenu, moreMenu, PIECES, UNCUT } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

const solid = (color: string) => [{ type: 'solid' as const, color }]
const rect = (
  name: string,
  index: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
  parentId = 'sq',
) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name,
  props: { x, y, width: 200, height: 160, shape: { kind: 'rect' as const }, fills: solid('#14213DFF'), ...extra },
})

/** A text, a shape over another, a turned shape, and two shapes in an auto layout row, in one frame. */
const design = (): DesignInput =>
  frameDesign({
    name: 'Top bar more',
    fills: solid('#FFF8F0FF'),
    nodes: {
      under: rect('Under', 'a0', 160, 340, { fills: solid('#FCA311FF') }),
      shape: rect('Shape', 'a1', 120, 300),
      words: {
        type: 'text',
        parentId: 'sq',
        index: 'a2',
        name: 'Words',
        props: {
          x: 80,
          y: 60,
          width: 600,
          height: 90,
          boxMode: 'autoHeight',
          text: 'Weekend sale',
          style: { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 400, color: '#111111FF' },
        },
      },
      turned: rect('Turned', 'a3', 640, 300, { width: 160, height: 100, rotation: 30, fills: solid('#E0262BFF') }),
      stack: {
        type: 'box',
        parentId: 'sq',
        index: 'a4',
        name: 'Stack',
        props: {
          x: 120,
          y: 680,
          width: 420,
          height: 140,
          fills: solid('#2A9D8FFF'),
          layout: { direction: 'row', gap: 12, padding: { top: 12, right: 12, bottom: 12, left: 12 } },
        },
      },
      one: rect('One', 'a0', 0, 0, { width: 100, height: 100 }, 'stack'),
      two: rect('Two', 'a1', 0, 0, { width: 100, height: 100, fills: solid('#FFFFFFFF') }, 'stack'),
    },
  })

/** The top bar's items, by their keys, in order. */
const barItems = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="top-bar"] [data-item]')].map((el) => el.dataset.item),
  )

/** Clicks an Order move in the menu beside Order in the top bar's ⋯, and waits as the ⋯ closes. */
async function orderMove(page: Page, name: string) {
  await (await layerMoreSubmenu(page, 'order')).getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await expect(page.getByTestId('bar-layer-more-menu')).toBeHidden()
}

/** Undoes, then redoes, checking the value read goes back and comes again. */
async function undoRedo<T>(page: Page, value: () => Promise<T>, before: T, after: T) {
  await perform(page, 'undo')
  await expect.poll(value).toEqual(before)
  await perform(page, 'redo')
  await expect.poll(value).toEqual(after)
}

test.describe('at 1280×760', () => {
  test("the ⋯ is the bar's last item: a shape's holds Order, Line up and the rotation field, a text's Text direction too, and the full menu none of them", async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, design())
    await page.setViewportSize({ width: 1280, height: 760 })
    await selectLayers(page, ['shape'], { bar: true })
    expect((await barItems(page)).at(-1)).toBe('layer-more')
    const menu = await layerMore(page)
    await expect(page.getByTestId('bar-layer-more')).toHaveAccessibleName('Arrange')
    await expect(menu.getByTestId('more-order')).toBeVisible()
    await expect(menu.getByTestId('more-line-up')).toBeVisible()
    await expect(menu.getByRole('spinbutton', { name: 'Rotation in degrees' })).toBeVisible()
    await expect(menu.getByTestId('more-text-direction')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()

    // The small menu's ⋯ no longer holds how a layer sits.
    const full = await moreMenu(page)
    for (const id of ['more-order', 'more-line-up', 'more-text-direction'])
      await expect(full.getByTestId(id)).toHaveCount(0)
    await expect(full.locator('[data-scrub]')).toHaveCount(0)
    await page.keyboard.press('Escape')

    await selectLayers(page, ['words'], { bar: true })
    expect((await barItems(page)).at(-1)).toBe('layer-more')
    const text = await layerMore(page)
    await expect(text.locator('[data-testid^="more-"], [data-scrub]')).toHaveCount(4)
    await expect(text.getByTestId('more-text-direction')).toBeVisible()
    await page.keyboard.press('Escape')

    // Several layers line up from the bar's own Line up, so their ⋯ has no Line up.
    await selectLayers(page, ['shape', 'turned'], { bar: true })
    expect((await barItems(page)).at(-1)).toBe('layer-more')
    const several = await layerMore(page)
    await expect(several.getByTestId('more-order')).toBeVisible()
    await expect(several.getByTestId('more-line-up')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('by mouse, Order, Line up, the rotation field and Text direction each act on the layer as one undo step', async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, design())
    await page.setViewportSize({ width: 1280, height: 760 })
    await selectLayers(page, ['shape'], { bar: true })
    const top = () => order(page)
    const before = await top()
    await orderMove(page, 'Send to back')
    const back = ['shape', ...before.filter((id) => id !== 'shape')]
    await expect.poll(top).toEqual(back)
    await undoRedo(page, top, before, back)

    const x = async () => (await props(page, 'shape')).x
    await (await layerMoreSubmenu(page, 'line-up')).getByRole('button', { name: 'Align left' }).click()
    await expect.poll(x).toBe(0)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('bar-layer-more-menu')).toBeHidden()
    await undoRedo(page, x, 120, 0)

    const rotation = async () => (await props(page, 'shape')).rotation ?? 0
    await enter((await layerMore(page)).getByRole('spinbutton', { name: 'Rotation in degrees' }), '45')
    await expect.poll(rotation).toBe(45)
    await page.keyboard.press('Escape')
    await undoRedo(page, rotation, 0, 45)

    await selectLayers(page, ['words'], { bar: true })
    const direction = async () => (await read(page)).nodes.words?.props.direction ?? 'auto'
    const directions = await layerMoreSubmenu(page, 'text-direction')
    await expect(directions.locator('[data-direction="auto"]')).toHaveAttribute('aria-pressed', 'true')
    await directions.getByRole('button', { name: 'Right to left' }).click()
    await expect(page.getByTestId('bar-layer-more-menu')).toBeHidden()
    await expect.poll(direction).toBe('rtl')
    await undoRedo(page, direction, 'auto', 'rtl')
    expect(errors).toEqual([])
  })

  test('by keyboard: End reaches ⋯ in the bar, Enter opens it on Order, the arrow opens Order and Enter runs a move; the arrows never move the layer, and Esc gives the focus back to ⋯', async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, design())
    await page.setViewportSize({ width: 1280, height: 760 })
    await selectLayers(page, ['shape'], { bar: true })
    const where = async () => {
      const { x, y } = await props(page, 'shape')
      return { x, y }
    }
    const at = await where()
    const more = page.getByTestId('bar-layer-more')
    await page.getByTestId('top-bar-row').locator('[data-bar-item]').first().focus()
    await page.keyboard.press('End')
    await expect(more).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    await expect(more).toBeFocused()
    expect(await where()).toEqual(at)

    await page.keyboard.press('Enter')
    const menu = page.getByTestId('bar-layer-more-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('more-order')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    const moves = page.getByTestId('more-order-menu')
    await expect(moves).toBeVisible()
    await expect(moves.getByRole('button', { name: /^Bring to front/ })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    expect(await where()).toEqual(at)
    const before = await order(page)
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
    await expect.poll(() => order(page)).toEqual([...before.filter((id) => id !== 'shape'), 'shape'])
    await expect(more).toBeFocused()

    // Tab goes down the menu to the rotation field, which takes a typed turn.
    await page.keyboard.press('Enter')
    await expect(menu.getByTestId('more-order')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(menu.getByTestId('more-line-up')).toBeFocused()
    await page.keyboard.press('Tab')
    const field = menu.getByRole('spinbutton', { name: 'Rotation in degrees' })
    await expect(field).toBeFocused()
    await page.keyboard.type('90')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await props(page, 'shape')).rotation).toBe(90)
    expect(await where()).toEqual(at)

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(more).toBeFocused()
    expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['shape'])
    await undoRedo(page, async () => (await props(page, 'shape')).rotation ?? 0, 0, 90)
    expect(errors).toEqual([])
  })

  test('a rotated layer: the field shows its turn and a typed one replaces it, and Line up lines up its turned box with the frame', async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, design())
    await page.setViewportSize({ width: 1280, height: 760 })
    await selectLayers(page, ['turned'], { bar: true })
    const field = (await layerMore(page)).getByRole('spinbutton', { name: 'Rotation in degrees' })
    await expect(field).toHaveValue('30')
    await enter(field, '-15')
    const rotation = async () => (await props(page, 'turned')).rotation
    await expect.poll(rotation).toBe(345)
    await page.keyboard.press('Escape')
    await undoRedo(page, rotation, 30, 345)
    await perform(page, 'undo')

    // The left of the turned box, as drawn, comes to the frame's left edge.
    const drawnLeft = async () => {
      const { x, width, height, rotation = 0 } = await props(page, 'turned')
      const turn = (rotation * Math.PI) / 180
      // Plus 0, so a left just under 0 that rounds to -0 reads as 0.
      return Math.round(x + width / 2 - (width * Math.abs(Math.cos(turn)) + height * Math.abs(Math.sin(turn))) / 2) + 0
    }
    await (await layerMoreSubmenu(page, 'line-up')).getByRole('button', { name: 'Align left' }).click()
    await expect.poll(drawnLeft).toBe(0)
    expect(await rotation()).toBe(30)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await undoRedo(page, async () => (await props(page, 'turned')).x, 640, (await props(page, 'turned')).x)
    expect(errors).toEqual([])
  })

  test('inside an auto layout box: Line up is greyed out with its reason and opens nothing; Order moves the layer along its row and the field turns it', async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, design())
    await page.setViewportSize({ width: 1280, height: 760 })
    await selectLayers(page, ['one'], { bar: true })
    const menu = await layerMore(page)
    const lineUp = menu.getByTestId('more-line-up')
    await expect(lineUp).toHaveAttribute('aria-disabled', 'true')
    await expect(lineUp).toHaveAttribute('title', 'Auto layout places this layer')
    // Clicked as a person would, though the row says it is disabled.
    await lineUp.click({ force: true })
    await expect(page.getByTestId('more-line-up-menu')).toHaveCount(0)
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')

    const row = () => order(page, 'stack')
    await orderMove(page, 'Bring forward')
    await expect.poll(row).toEqual(['two', 'one'])
    await undoRedo(page, row, ['one', 'two'], ['two', 'one'])

    const rotation = async () => (await props(page, 'one')).rotation ?? 0
    await enter((await layerMore(page)).getByRole('spinbutton', { name: 'Rotation in degrees' }), '20')
    await expect.poll(rotation).toBe(20)
    await page.keyboard.press('Escape')
    await undoRedo(page, rotation, 0, 20)

    // Set to keep where it is, the layer lines up again.
    await page.evaluate(() => window.dazbee?.session.run('node.update', { ids: ['one'], patch: { absolute: true } }))
    await expect((await layerMore(page)).getByTestId('more-line-up')).not.toHaveAttribute('aria-disabled')
    expect(errors).toEqual([])
  })

  test("a locked layer's bar keeps its ⋯ with Order alone, which still moves it", async ({ browser }) => {
    const { page, errors } = await openStage(browser, design())
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.evaluate(() => window.dazbee?.setLocked(['shape'], true))
    await selectLayers(page, ['shape'], { bar: true })
    await expect(page.getByTestId('bar-locked')).toBeVisible()
    expect(await barItems(page)).toEqual(['locked', 'layer-more'])
    const menu = await layerMore(page)
    await expect(menu.locator('[data-testid^="more-"], [data-scrub]')).toHaveCount(1)
    const before = await order(page)
    await orderMove(page, 'Bring to front')
    await expect.poll(() => order(page)).toEqual([...before.filter((id) => id !== 'shape'), 'shape'])
    expect(errors).toEqual([])
  })
})

test("on a phone the ⋯ stays at the bar's end and opens as a sheet at the bottom, hiding the dock and tab bar, with rows a finger can hit; a menu beside a row opens inside the screen", async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await page.setViewportSize({ width: 390, height: 844 })
  await fitSettled(page)
  // A text's bar, the longest, scrolls sideways under its ⋯, which shows whole at its end.
  await selectLayers(page, ['words'], { bar: true })
  const more = page.getByTestId('bar-layer-more')
  const bar = await page.getByTestId('top-bar-row').boundingBox()
  const button = await more.boundingBox()
  expect(bar && button && button.x + button.width <= bar.x + bar.width && button.x >= bar.x).toBe(true)
  const scroll = page.getByTestId('top-bar-scroll')
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  await scroll.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  expect(await more.boundingBox()).toEqual(button)

  // A rail flyout open first is closed by the sheet, as an edit panel's sheet closes it.
  await page.locator('[data-panel="layers"]').click()
  await expect(page.getByTestId('flyout')).toBeVisible()
  await more.click()
  const sheet = page.getByTestId('bar-layer-more-menu')
  await expect(sheet).toBeVisible()
  await expect(sheet).toHaveAttribute('data-sheet', 'true')
  await expect(page.getByTestId('flyout')).toHaveCount(0)
  await expect(page.getByTestId('rail')).toBeHidden()
  await expect(page.locator('[data-dock]')).toBeHidden()
  await expect(page.getByTestId('small-menu')).toBeHidden()
  // 8 px from the screen's sides and bottom, once it has popped in; its top is on a whole pixel, so
  // its bottom may be half a pixel off.
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox()
      return box && [Math.round(box.x), Math.round(box.width), Math.abs(box.y + box.height - 836) <= 1]
    })
    .toEqual([8, 374, true])
  for (const height of await rowHeights(sheet, ':scope > button, [data-scrub]'))
    expect(height).toBeGreaterThanOrEqual(44)
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])

  const moves = await layerMoreSubmenu(page, 'order')
  for (const row of await moves.getByRole('button').all()) {
    const at = await row.boundingBox()
    expect(at && at.x >= 0 && at.x + at.width <= 390 && at.y >= 0 && at.y + at.height <= 844).toBe(true)
  }
  const before = await order(page)
  await moves.getByRole('button', { name: /^Send to back/ }).click()
  await expect(sheet).toBeHidden()
  await expect.poll(() => order(page)).toEqual(['words', ...before.filter((id) => id !== 'words')])
  await expect(page.getByTestId('rail')).toBeVisible()
  await expect(page.locator('[data-dock]')).toBeVisible()
  expect(errors).toEqual([])
})

test('at each screen size the ⋯ and the menus beside its rows meet nothing and cut nothing, for a text and a shape', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  for (const [width, height] of SCREEN_SIZES) {
    await page.setViewportSize({ width, height })
    await fitSettled(page)
    for (const id of ['words', 'shape']) {
      await selectLayers(page, [id], { bar: true })
      await layerMore(page)
      await nextFrame(page)
      expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT }), `${width} ${id} ⋯`).toEqual([])
      for (const sub of ['order', 'line-up']) {
        await layerMoreSubmenu(page, sub)
        await nextFrame(page)
        expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT }), `${width} ${id} ${sub}`).toEqual([])
        await page.keyboard.press('Escape')
        await expect(page.getByTestId(`more-${sub}-menu`)).toBeHidden()
      }
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('bar-layer-more-menu')).toBeHidden()
    }
  }
  expect(errors).toEqual([])
})

for (const theme of ['dark', 'light'] as const)
  test(
    `screenshots in the ${theme} theme: the ⋯ open for a shape and a text, Order and Line up open, the phone's sheet`,
    { tag: '@evidence' },
    async ({ browser }) => {
      const { page, errors } = await openStage(browser, design())
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
        for (const id of ['shape', 'words']) {
          await selectLayers(page, [id], { bar: true })
          // Opened by a mouse with no focus left from the keys before, as a person clicking it sees it.
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
          await page.getByTestId('bar-layer-more').click()
          await expect(page.getByTestId('bar-layer-more-menu')).toBeVisible()
          await shot(`${id === 'words' ? 'text' : 'shape'}-${width}`)
          await page.keyboard.press('Escape')
          await expect(page.getByTestId('bar-layer-more-menu')).toBeHidden()
        }
        await selectLayers(page, ['words'], { bar: true })
        for (const sub of ['order', 'line-up']) {
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
          await layerMoreSubmenu(page, sub)
          await shot(`${sub}-${width}`)
          await page.keyboard.press('Escape')
          await page.keyboard.press('Escape')
          await expect(page.getByTestId('bar-layer-more-menu')).toBeHidden()
        }
      }
      expect(errors).toEqual([])
    },
  )
