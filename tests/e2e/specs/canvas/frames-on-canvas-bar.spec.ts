// The picked frame's top bar: it is one Tab stop, and the arrows inside it move the focus between
// Background and ⋯, never the frame, as they move between the rows of its ⋯ menu; Rename in its ⋯
// with the frame's label off screen, zoomed in or above the view, pans at the same zoom to show the
// label first, then opens the field focused. The rest of frames on the canvas is in
// frames-on-canvas.spec.ts.
import { writeOutput } from '../../support/editor.ts'
import {
  clickLabel,
  frameMenuItems,
  frameOf,
  labelRow,
  openFrames,
  picked,
  tabToBar,
} from '../../support/frames-on-canvas.ts'
import { drawn, press, zoomOf } from '../../support/stage.ts'
import { expect, type Locator, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

test('the picked frame’s bar is one Tab stop, and the arrows inside it move the focus between Background and ⋯, never the frame', async ({
  browser,
}) => {
  const { a: page, errors } = await openFrames(browser)
  await clickLabel(page, 'sq')
  const bar = page.getByTestId('top-bar')
  await expect(bar.locator('[data-bar-item][tabindex="0"]')).toHaveCount(1)
  expect(await tabToBar(page)).toBe('bar-background')
  const background = page.getByTestId('bar-background')
  const more = page.getByTestId('bar-frame-more')
  await page.keyboard.press('ArrowRight')
  await expect(more).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(background).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(more).toBeFocused()
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(background).toBeFocused()
  // Up and down keep the focus where it is in the bar.
  for (const key of ['ArrowUp', 'ArrowDown', 'Shift+ArrowUp', 'Shift+ArrowDown']) {
    await page.keyboard.press(key)
    await expect(background).toBeFocused()
  }
  // None of the arrows moved the frame, and it is still picked.
  await drawn(page)
  expect(await frameOf(page, 'sq')).toMatchObject({ x: 0, y: 0 })
  expect(await page.evaluate(() => window.dazbee?.canUndo())).toBe(false)
  expect(await picked(page)).toBe('sq')
  // Tab leaves the bar from either item; the arrows on the canvas move the frame again.
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="top-bar"]') ?? null)).toBeNull()
  await page.keyboard.press('Shift+Tab')
  await expect(background).toBeFocused()
  await page.locator('body').focus()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('ArrowRight')
  await drawn(page)
  expect(await frameOf(page, 'sq')).toMatchObject({ x: 1, y: 0 })
  expect(errors).toEqual([])
})

test('the picked frame’s ⋯ menu opens on Duplicate from the keyboard, and up, down, Home and End move between its rows, never the frame; Esc gives the focus back to ⋯', async ({
  browser,
}) => {
  const { a: page, errors } = await openFrames(browser)
  await clickLabel(page, 'sq')
  expect(await tabToBar(page)).toBe('bar-background')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  const menu = page.getByTestId('bar-frame-more-menu')
  const rows = ['duplicate', 'add-size', 'rename', 'export', 'delete'].map((action) =>
    menu.locator(`[data-action="${action}"]`),
  )
  await expect(rows[0] as Locator).toBeFocused()
  for (const [key, row] of [
    ['ArrowDown', 1],
    ['ArrowDown', 2],
    ['ArrowDown', 3],
    ['ArrowDown', 4],
    ['ArrowDown', 0],
    ['ArrowUp', 4],
    ['Home', 0],
    ['End', 4],
    ['ArrowUp', 3],
  ] as const) {
    await page.keyboard.press(key)
    await expect(rows[row] as Locator, key).toBeFocused()
  }
  await drawn(page)
  expect(await frameOf(page, 'sq')).toMatchObject({ x: 0, y: 0 })
  expect(await page.evaluate(() => window.dazbee?.canUndo())).toBe(false)
  expect(await picked(page)).toBe('sq')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(page.getByTestId('bar-frame-more')).toBeFocused()
  expect(errors).toEqual([])
})

test('Rename in ⋯ with the picked frame’s label off screen, zoomed in to 375% or above the view, pans at the same zoom to show the label, then opens the field focused: typing names the frame and picks no tool', async ({
  browser,
}) => {
  const { a: page, errors } = await openFrames(browser)
  const stage = await page.getByTestId('stage').boundingBox()
  if (!stage) throw new Error('no stage')
  const field = page.getByTestId('frame-rename').locator('input')
  /** Whether the field shows whole on the stage, with nothing over the start of its text. */
  const fieldInView = async () => {
    const box = await field.boundingBox()
    if (!box) return false
    const inside =
      box.x >= stage.x &&
      box.y >= stage.y &&
      box.y + box.height <= stage.y + stage.height &&
      box.x < stage.x + stage.width
    const onTop = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="frame-rename"]') !== null,
      [box.x + 6, box.y + box.height / 2] as const,
    )
    return inside && onTop
  }
  /** Names the frame by typing into the focused field, then checks no key went to the stage. */
  const typeName = async (name: string) => {
    await page.keyboard.type(name)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('frame-rename')).toHaveCount(0)
    expect(await page.evaluate(() => window.dazbee?.tool())).toBe('select')
    expect((await frameOf(page, 'sq'))?.name).toBe(name)
  }

  // 375%, centred on the square: its label is far above the stage.
  await clickLabel(page, 'sq')
  await page.evaluate(
    ([w, h]) => window.dazbee?.setCamera({ x: w / 2 - 540 * 3.75, y: h / 2 - 540 * 3.75, zoom: 3.75 }),
    [stage.width, stage.height] as const,
  )
  await drawn(page)
  expect((await labelRow(page, 'sq')).y).toBeLessThan(stage.y)
  const menu = await barMenu(page, 'frame-more')
  await menu.getByRole('button', { name: 'Rename' }).click()
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('Square')
  expect(await zoomOf(page)).toBe(3.75)
  expect(await fieldInView()).toBe(true)
  writeOutput('frames-6-rename-zoomed.png', await page.screenshot({ animations: 'disabled' }))
  // Letters that are tool shortcuts on the stage: rectangle, ellipse, text, pen and hand.
  await typeName('rotph')
  await press(page, 'undo')
  expect((await frameOf(page, 'sq'))?.name).toBe('Square')

  // At half size, with the square's top 300 px above the stage: by the keyboard this time.
  await page.evaluate(() => window.dazbee?.setCamera({ x: 300, y: -300, zoom: 0.5 }))
  await drawn(page)
  expect((await labelRow(page, 'sq')).y).toBeLessThan(stage.y)
  expect(await picked(page)).toBe('sq')
  await page.getByTestId('bar-frame-more').focus()
  await page.keyboard.press('Enter')
  await frameMenuItems(page, 'Rename')
  await page.keyboard.press('Enter')
  await expect(field).toBeFocused()
  expect(await zoomOf(page)).toBe(0.5)
  expect(await fieldInView()).toBe(true)
  await typeName('photo')
  await expect(page.getByTestId('bar-frame-more')).toBeFocused()
  expect(errors).toEqual([])
})
