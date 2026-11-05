// The layers panel lists the page's frames, in Chromium with the real mouse and keyboard: the
// frames as top-level rows with their sizes, a click on one picking and opening it, a selection on
// the canvas opening its frame and the groups it is in and showing its row, "only here" on a layer
// none of its frame's linked frames holds; a frame renamed from its row in one undo step, which a
// second tab sees; hide and lock on a row acting on that layer alone, never its linked copy; a layer
// dragged onto its own frame's row going to the top and onto another frame's going nowhere; the
// keyboard through frames and layers.
import { openTabs, screenPoint, writeOutput } from '../../support/editor.ts'
import { framesDesign, layerRow, picked } from '../../support/layers-frames.ts'
import { frameRow, listed, node, openLayers, row, tabIntoTree, tree } from '../../support/layers-panel.ts'
import { copyIn, seed } from '../../support/seed.ts'
import { drawn, fitSettled, nextFrame, perform, read, selection } from '../../support/stage.ts'
import { type Browser, expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

/** The rows of Sale square, open with its deep group open, as `listed` gives them. */
const SQUARE_OPEN = [
  'Sale square 1080×1080',
  '  Badgeonly here',
  '  Button',
  '  Logo',
  '  Headline',
  '  Photo',
  '    Mount',
  '      Inner',
  '        Picture',
]

/** The names of the rows marked "only here". */
const onlyHere = (page: Page) =>
  tree(page)
    .getByRole('treeitem')
    .filter({ has: page.getByTestId('layer-only-here') })
    .getByTestId('layer-name')
    .allTextContents()
/** The id of the row the focus is on, a frame's or a layer's, or null off the rows. */
const focusedRow = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-row') ?? null)

/** Opens the design in one tab or two, 1440×1000, the panel open in each. */
async function openDesign(browser: Browser, count = 1) {
  const { tabs, errors } = await openTabs(browser, count, await seed(framesDesign()))
  for (const tab of tabs) {
    await tab.setViewportSize({ width: 1440, height: 1000 })
    await tab.evaluate(() => window.dazbee?.loaded())
    await fitSettled(tab)
    await openLayers(tab)
  }
  return { tabs, errors }
}

test('the page’s frames are the top rows; a click on one picks and opens it; a selection on the canvas opens its frame and groups and shows its row', async ({
  browser,
}) => {
  const {
    tabs: [page],
    errors,
  } = await openDesign(browser)
  if (!page) throw new Error('no tab')
  // The panel names the page, and lists its three frames, closed, with their sizes.
  await expect(page.getByTestId('flyout-note')).toHaveText('Summer sale')
  await expect(tree(page)).toHaveAttribute('aria-label', 'Frames and layers of Summer sale')
  expect(await listed(page)).toEqual(['Sale square 1080×1080', 'Sale story 1080×1920', 'Fresh square 1080×1080'])
  await expect(frameRow(page, 'Fresh square').getByTestId('frame-swatch')).toHaveCSS(
    'background-color',
    'rgb(33, 138, 92)',
  )

  // A click on the unlinked frame's row picks it and opens it: its layer is not "only here".
  await frameRow(page, 'Fresh square').click()
  expect(await picked(page)).toBe('fresh')
  expect(await selection(page)).toEqual([])
  await expect(frameRow(page, 'Fresh square')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.stage-overlay .frame-label[data-frame="fresh"]')).toBeVisible()
  await expect
    .poll(() => listed(page))
    .toEqual(['Sale square 1080×1080', 'Sale story 1080×1920', 'Fresh square 1080×1080', '  Fresh roast'])
  expect(await onlyHere(page)).toEqual([])

  // A layer deep in groups selected on the canvas: its frame and every group it is in open, and
  // its row shows, selected; the picked frame lets go.
  await page.evaluate(() => window.dazbee?.select(['picture']))
  await expect(row(page, 'Picture')).toHaveAttribute('aria-selected', 'true')
  await expect(row(page, 'Picture')).toBeInViewport()
  await expect
    .poll(() => listed(page))
    .toEqual([...SQUARE_OPEN, 'Sale story 1080×1920', 'Fresh square 1080×1080', '  Fresh roast'])
  expect(await picked(page)).toBeNull()
  await expect(frameRow(page, 'Fresh square')).toHaveAttribute('aria-selected', 'false')
  // Badge has no copy in the story, linked to the square: it alone is "only here".
  expect(await onlyHere(page)).toEqual(['Badge'])

  // A click on the story's Headline on the canvas opens the story and selects that copy's row.
  const at = await screenPoint(page, 300, 130, 'story')
  await page.mouse.click(at.x, at.y)
  await drawn(page)
  expect(await selection(page)).toEqual([copyIn('story', 'head')])
  await expect(layerRow(page, copyIn('story', 'head'))).toHaveAttribute('aria-selected', 'true')
  await expect(layerRow(page, 'head')).toHaveAttribute('aria-selected', 'false')
  await expect(layerRow(page, copyIn('story', 'head'))).toBeInViewport()

  // The caret closes a frame and keeps it closed while its layer stays selected.
  await frameRow(page, 'Sale story').getByRole('button', { name: 'Collapse Sale story' }).click()
  await expect(layerRow(page, copyIn('story', 'head'))).toHaveCount(0)
  await nextFrame(page)
  await expect(layerRow(page, copyIn('story', 'head'))).toHaveCount(0)
  expect(await selection(page)).toEqual([copyIn('story', 'head')])

  // Page 2 lists its own frame; its Headline shares a link with the square's but is on another page.
  await page.evaluate(() => window.dazbee?.showPage('p2'))
  await expect(page.getByTestId('flyout-note')).toHaveText('Diwali')
  await expect.poll(() => listed(page)).toEqual(['Banner 300×250', '  Headline'])
  expect(await onlyHere(page)).toEqual([])
  expect(errors).toEqual([])
})

test('a frame renamed from its row is one undo step, and a second tab sees it', async ({ browser }) => {
  const {
    tabs: [a, b],
    errors,
  } = await openDesign(browser, 2)
  if (!a || !b) throw new Error('no tabs')
  await frameRow(a, 'Sale story').dblclick()
  const field = tree(a).getByRole('textbox', { name: 'Name of Sale story' })
  await expect(field).toBeFocused()
  await field.fill('Weekend story')
  await field.press('Enter')
  await expect.poll(async () => (await read(a)).frames.story?.name).toBe('Weekend story')
  await expect(frameRow(a, 'Weekend story')).toBeFocused()
  await expect(frameRow(b, 'Weekend story')).toBeVisible()
  // The canvas label says the new name too.
  await expect(a.locator('.stage-overlay .frame-label[data-frame="story"]')).toContainText('Weekend story')

  await perform(a, 'undo')
  await expect.poll(async () => (await read(a)).frames.story?.name).toBe('Sale story')
  await expect(frameRow(b, 'Sale story')).toBeVisible()
  await perform(a, 'redo')
  await expect.poll(async () => (await read(a)).frames.story?.name).toBe('Weekend story')
  await expect(frameRow(b, 'Weekend story')).toBeVisible()

  // Escape keeps the old name; an empty name keeps it too.
  await frameRow(a, 'Weekend story').dblclick()
  await tree(a).getByRole('textbox', { name: 'Name of Weekend story' }).fill('Nope')
  await a.keyboard.press('Escape')
  await frameRow(a, 'Weekend story').dblclick()
  await tree(a).getByRole('textbox', { name: 'Name of Weekend story' }).fill('  ')
  await a.keyboard.press('Enter')
  expect((await read(a)).frames.story?.name).toBe('Weekend story')
  expect(errors).toEqual([])
})

test('hide and lock on a row act on that layer alone, never its linked copy, each one undo step', async ({
  browser,
}) => {
  const {
    tabs: [page],
    errors,
  } = await openDesign(browser)
  if (!page) throw new Error('no tab')
  await frameRow(page, 'Sale square').click()
  await frameRow(page, 'Sale story').getByRole('button', { name: 'Expand Sale story' }).click()
  const storyLogo = copyIn('story', 'logo')
  const storyButton = copyIn('story', 'button')
  // The square's Logo is hidden and its Button locked; their copies in the story are not.
  const toggle = (id: string, name: string) => layerRow(page, id).getByRole('button', { name, exact: true })
  await expect(toggle('logo', 'Show Logo')).toHaveAttribute('aria-pressed', 'true')
  await expect(layerRow(page, 'logo').getByTestId('layer-name')).toHaveCSS('text-decoration-line', 'line-through')
  await expect(toggle('button', 'Unlock Button')).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle(storyLogo, 'Show Logo')).toHaveCount(0)
  await expect(toggle(storyButton, 'Unlock Button')).toHaveCount(0)
  writeOutput('layers-frames-hidden-locked.png', await page.screenshot())

  const shown = async (id: string) =>
    ((await read(page)).nodes[id]?.props as { visible?: boolean } | undefined)?.visible !== false
  const locked = async (id: string) => Object.values((await node(page, id)).lock ?? {}).some(Boolean)

  // Hide the story's Logo from its row: the square's stays as it was.
  await layerRow(page, storyLogo).hover()
  await toggle(storyLogo, 'Hide Logo').click()
  await expect.poll(() => shown(storyLogo)).toBe(false)
  expect(await shown('logo')).toBe(false)
  await expect(toggle(storyLogo, 'Show Logo')).toHaveAttribute('aria-pressed', 'true')
  await perform(page, 'undo')
  await expect.poll(() => shown(storyLogo)).toBe(true)
  await perform(page, 'redo')
  await expect.poll(() => shown(storyLogo)).toBe(false)

  // Show the square's Logo: the story's copy stays hidden.
  await toggle('logo', 'Show Logo').click()
  await expect.poll(() => shown('logo')).toBe(true)
  expect(await shown(storyLogo)).toBe(false)

  // Lock the story's Button from its row: the square's stays locked, and unlocking the square's
  // leaves the story's locked.
  await layerRow(page, storyButton).hover()
  await toggle(storyButton, 'Lock Button').click()
  await expect.poll(() => locked(storyButton)).toBe(true)
  await toggle('button', 'Unlock Button').click()
  await expect.poll(() => locked('button')).toBe(false)
  expect(await locked(storyButton)).toBe(true)
  await perform(page, 'undo')
  await expect.poll(() => locked('button')).toBe(true)
  await perform(page, 'redo')
  await expect.poll(() => locked('button')).toBe(false)
  expect(await locked(storyButton)).toBe(true)
  expect(errors).toEqual([])
})

test('a layer dragged onto its own frame’s row goes to the frame’s top, and onto another frame’s row goes nowhere', async ({
  browser,
}) => {
  const {
    tabs: [page],
    errors,
  } = await openDesign(browser)
  if (!page) throw new Error('no tab')
  await frameRow(page, 'Sale square').click()
  const top = async () => {
    const d = await read(page)
    return Object.entries(d.nodes)
      .filter(([, n]) => n.parentId === 'sq')
      .sort(([, x], [, y]) => (x.index < y.index ? -1 : 1))
      .map(([id]) => id)
      .at(-1)
  }
  expect(await top()).toBe('badge')
  // Onto the story's row: no drop, Photo stays where it was.
  await row(page, 'Photo').dragTo(frameRow(page, 'Sale story'))
  expect(await top()).toBe('badge')
  expect((await node(page, 'photo')).parentId).toBe('sq')
  // Onto its own frame's row: Photo goes on top of the square.
  await row(page, 'Photo').dragTo(frameRow(page, 'Sale square'))
  await expect.poll(top).toBe('photo')
  await expect.poll(() => listed(page)).toContain('  Photo')
  expect((await listed(page)).slice(0, 2)).toEqual(['Sale square 1080×1080', '  Photo'])
  await perform(page, 'undo')
  await expect.poll(top).toBe('badge')
  await perform(page, 'redo')
  await expect.poll(top).toBe('photo')
  expect(errors).toEqual([])
})

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
