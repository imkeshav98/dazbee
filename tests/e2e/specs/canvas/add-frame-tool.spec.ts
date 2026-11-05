// The Frame tool and what else is on the stage: a click on the canvas with it adds nothing and
// leaves the Add a frame card open with what was typed, while ✕ still puts it down; and picking it,
// by F or the dock, with layers selected lets them go, so the card is the only edit panel, its size
// of your own starting at the size of the frame they were in. A page holds a square, a story linked
// to it and a banner linked to nothing.
import { card, typeSize } from '../../support/add-frame.ts'
import { openFrames, picked } from '../../support/frames-on-canvas.ts'
import { copyIn } from '../../support/seed.ts'
import { click, drawn, press, read } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

const tool = (page: Page) => page.evaluate(() => window.dazbee?.tool())
const selected = (page: Page) => page.evaluate(() => window.dazbee?.selection() ?? [])
/** Selects layers as a click would, and waits for their top bar. */
async function selectLayers(page: Page, ids: string[]) {
  await page.evaluate((ids) => window.dazbee?.select(ids), ids)
  await drawn(page)
  await expect(page.getByTestId('top-bar')).toBeVisible()
  await expect(page.getByTestId('small-menu')).toBeVisible()
}

test('a click on the canvas with the Frame tool adds nothing and keeps the card open with what was typed; ✕ still puts the tool down', async ({
  browser,
}) => {
  const { a, errors } = await openFrames(browser)
  const frames = Object.keys((await read(a)).frames)
  await press(a, 'toolFrame')
  await expect(card(a)).toHaveAttribute('data-panel', 'addFrame')
  await typeSize(a, '1200', '628')
  // Empty canvas below the square, then on the square itself.
  await click(a, -300, 1400)
  await click(a, 500, 500)
  await expect(card(a)).toHaveAttribute('data-panel', 'addFrame')
  await expect(a.getByTestId('own-width')).toHaveValue('1200')
  await expect(a.getByTestId('own-height')).toHaveValue('628')
  expect(await tool(a)).toBe('frame')
  expect(Object.keys((await read(a)).frames)).toEqual(frames)
  expect(await picked(a)).toBeNull()
  expect(await a.evaluate(() => window.dazbee?.canUndo())).toBe(false)

  await a.getByTestId('edit-panel-close').click()
  await expect(card(a)).toHaveCount(0)
  expect(await tool(a)).toBe('select')
  expect(errors).toEqual([])
})

test('picking the Frame tool, by F or the dock, with layers selected lets them go: the card is the only edit panel, starting at the size of their frame', async ({
  browser,
}) => {
  const { a, errors } = await openFrames(browser)
  // F, with the story's headline selected: no layer's top bar or small menu stays beside the card.
  await selectLayers(a, [copyIn('story', 'headline')])
  await press(a, 'toolFrame')
  await expect(card(a)).toHaveAttribute('data-panel', 'addFrame')
  expect(await selected(a)).toEqual([])
  await expect(a.getByTestId('top-bar')).toHaveCount(0)
  await expect(a.getByTestId('small-menu')).toHaveCount(0)
  await expect(a.getByTestId('own-width')).toHaveValue('1080')
  await expect(a.getByTestId('own-height')).toHaveValue('1920')
  await a.getByTestId('edit-panel-close').click()

  // The dock's Frame button, with two of the square's layers selected.
  await selectLayers(a, ['tilt', 'locked'])
  await a.locator('[data-dock] [data-tool="frame"]').click()
  await expect(card(a)).toHaveAttribute('data-panel', 'addFrame')
  expect(await selected(a)).toEqual([])
  await expect(a.getByTestId('top-bar')).toHaveCount(0)
  await expect(a.getByTestId('small-menu')).toHaveCount(0)
  await expect(a.getByTestId('own-height')).toHaveValue('1080')
  expect(await tool(a)).toBe('frame')
  expect(errors).toEqual([])
})
