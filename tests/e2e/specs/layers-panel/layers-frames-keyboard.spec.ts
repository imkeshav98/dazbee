// The layers panel's frames by the keyboard alone, in Chromium: Tab into the tree, the arrows, Home
// and End through frames and layers, opening and closing them and picking a frame, and renaming it;
// the focus following a duplicated frame to its copy.
import { writeOutput } from '../../support/editor.ts'
import { openDesign, picked } from '../../support/layers-frames.ts'
import { frameRow, row, tabIntoTree, tree } from '../../support/layers-panel.ts'
import { nextFrame, read, selection } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

/** The id of the row the focus is on, a frame's or a layer's, or null off the rows. */
const focusedRow = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-row') ?? null)

test('keyboard only: through frames and layers, opening and closing them, picking a frame and renaming it', async ({
  browser,
}) => {
  const {
    tabs: [page],
    errors,
  } = await openDesign(browser)
  if (!page) throw new Error('no tab')
  const before = (await read(page)).frames.sq
  // Tab lands on the first frame's row: the focus alone picks nothing.
  await tabIntoTree(page)
  await expect(frameRow(page, 'Sale square')).toBeFocused()
  expect(await picked(page)).toBeNull()
  // Right opens it, Right again goes to its top layer and selects it.
  await page.keyboard.press('ArrowRight')
  await expect(frameRow(page, 'Sale square')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'Badge')).toBeFocused()
  expect(await selection(page)).toEqual(['badge'])
  // Down through its layers; Right opens Photo, and Down goes into it.
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown')
  await expect(row(page, 'Photo')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'Mount')).toBeFocused()
  expect(await selection(page)).toEqual(['mount'])
  // Left goes up to Photo, then to the frame's row, which picks the frame; Left again closes it.
  await page.keyboard.press('ArrowLeft')
  await expect(row(page, 'Photo')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(frameRow(page, 'Sale square')).toBeFocused()
  expect(await picked(page)).toBe('sq')
  await expect(frameRow(page, 'Sale square')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(frameRow(page, 'Sale square')).toHaveAttribute('aria-expanded', 'false')
  await nextFrame(page)
  await expect(frameRow(page, 'Sale square')).toHaveAttribute('aria-expanded', 'false')
  // Down to the next frame picks it, which opens it; End goes to the last row, Home to the first.
  await page.keyboard.press('ArrowDown')
  await expect(frameRow(page, 'Sale story')).toBeFocused()
  expect(await picked(page)).toBe('story')
  await expect(frameRow(page, 'Sale story')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('End')
  await expect(frameRow(page, 'Fresh square')).toBeFocused()
  expect(await picked(page)).toBe('fresh')
  await page.keyboard.press('Home')
  await expect(frameRow(page, 'Sale square')).toBeFocused()
  expect(await picked(page)).toBe('sq')
  // The arrows moved the focus, never the picked frame.
  expect((await read(page)).frames.sq).toEqual(before)

  // Enter renames the frame; Enter again keeps the name, and the focus is back on its row.
  await page.keyboard.press('Enter')
  await expect(tree(page).getByRole('textbox', { name: 'Name of Sale square' })).toBeFocused()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Weekend square')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await read(page)).frames.sq?.name).toBe('Weekend square')
  await expect(frameRow(page, 'Weekend square')).toBeFocused()
  expect(await focusedRow(page)).toBe('sq')
  writeOutput('layers-frames-keyboard.png', await page.screenshot())
  // Undo from the row puts the old name back.
  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(async () => (await read(page)).frames.sq?.name).toBe('Sale square')
  expect(errors).toEqual([])
})

test('keyboard: Ctrl+D on a frame’s row takes the focus to the copy’s row, picked', async ({ browser }) => {
  const {
    tabs: [page],
    errors,
  } = await openDesign(browser)
  if (!page) throw new Error('no tab')
  const frames = async () => Object.keys((await read(page)).frames).sort()
  // End picks Fresh square; Ctrl+D there picks its copy, and the copy's row takes the focus.
  await tabIntoTree(page)
  await page.keyboard.press('End')
  await expect(frameRow(page, 'Fresh square')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+D')
  await expect.poll(() => picked(page)).not.toBe('fresh')
  const copy = await picked(page)
  expect(copy).not.toBeNull()
  await expect.poll(() => focusedRow(page)).toBe(copy)
  await expect(tree(page).locator(`[data-frame="${copy}"]`)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(frames).toEqual(['banner', 'fresh', 'sq', 'story'])
  expect(errors).toEqual([])
})
