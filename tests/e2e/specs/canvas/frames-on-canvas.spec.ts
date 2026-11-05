// Frames on the canvas: a frame is picked by a click on its empty area or its label (outlined, its
// label lit, a top bar with Background and ⋯), moved by a drag from there or by the arrows, given a
// background, duplicated, renamed in place and deleted, each by the mouse and by the keyboard, each
// one undo step that a second tab sees. A page holds a square, a story linked to it and a banner
// linked to nothing; the square holds a turned layer, a locked one and one under a mask. The three
// screen sizes are in frames-on-canvas-screens.spec.ts.
import { solid } from '../../support/edit-in-frame.ts'
import { designOf, openTabs, settle, writeOutput } from '../../support/editor.ts'
import { clickLabel, design, labelPoint, picked } from '../../support/frames-on-canvas.ts'
import { layersIn, seed } from '../../support/seed.ts'
import { click, type Design, drag, dragScreen, drawn, press, read, selection } from '../../support/stage.ts'
import { type Browser, expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

const frameOf = async (page: Page, id: string) => (await read(page)).frames[id]
/** What a frame holds: the frame as stored and its layers by id. */
const inFrame = (d: Design, frameId: string) => ({
  frame: d.frames[frameId],
  layers: Object.fromEntries(layersIn(d, frameId)),
})
const label = (page: Page, id: string) => page.locator(`.stage-overlay .frame-label[data-frame="${id}"]`)

/** Double-clicks a frame's name on its label, and gives the field that renames it once it shows. */
async function renameByLabel(page: Page, id: string) {
  const name = await label(page, id).locator('.frame-name').boundingBox()
  if (!name) throw new Error(`no name on ${id}'s label`)
  await page.mouse.dblclick(name.x + name.width / 2, name.y + name.height / 2)
  const field = page.getByTestId('frame-rename').locator('input')
  await expect(field).toBeFocused()
  return field
}
/** Presses Tab until the focus is in the top bar, from wherever it is, and gives the item it reached. */
async function tabToBar(page: Page) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const inBar = await page.evaluate(() => document.activeElement?.closest('[data-testid="top-bar"]') !== null)
    if (inBar) return page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')
  }
  throw new Error('Tab never reached the top bar')
}

/**
 * Opens a fresh copy of the design in `count` tabs; the first is 1440 × 1000 with the square at half
 * size 300 px in and 180 px down, so its label clears the chrome, and its fonts loaded. All tabs
 * agree before it returns.
 */
async function open(browser: Browser, count = 1) {
  const { tabs, errors } = await openTabs(browser, count, await seed(design()))
  const [a] = tabs as [Page, ...Page[]]
  await a.setViewportSize({ width: 1440, height: 1000 })
  await a.evaluate(async () => {
    window.dazbee?.setCamera({ x: 300, y: 180, zoom: 0.5 })
    await window.dazbee?.loaded()
  })
  await drawn(a)
  if (count > 1) await settle(tabs)
  return { a, b: tabs[1] as Page, tabs, errors }
}

test('a click on a frame’s empty area or its label picks it: outlined, its label lit, a bar with Background and ⋯; Esc, empty canvas or a layer lets it go', async ({
  browser,
}) => {
  const { a: page, errors } = await open(browser)
  const still = await page.evaluate(() => window.dazbee?.camera())
  await click(page, 1000, 1000)
  expect(await picked(page)).toBe('sq')
  expect(await selection(page)).toEqual([])
  await expect(page.locator('.stage-overlay .frame-picked[data-frame="sq"]')).toHaveCount(1)
  expect(await page.locator('.stage-overlay .frame-picked').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    'solid',
  )
  await expect(label(page, 'sq')).toHaveAttribute('data-active', '')
  await expect(page.locator('.stage-overlay .frame-label[data-active]')).toHaveCount(1)
  const bar = page.getByTestId('top-bar')
  await expect(bar).toHaveAttribute('data-frame', 'sq')
  await expect(bar.locator('[data-bar-item]')).toHaveCount(2)
  await expect(page.getByTestId('bar-background')).toHaveText('Background')
  await expect(page.getByTestId('bar-frame-more')).toHaveAccessibleName('Frame actions')
  await expect(page.getByTestId('small-menu')).toHaveCount(0)
  writeOutput('frames-1-picked.png', await page.screenshot({ animations: 'disabled' }))

  // Esc lets it go.
  await page.keyboard.press('Escape')
  await expect.poll(() => picked(page)).toBeNull()
  await expect(page.locator('.stage-overlay .frame-picked')).toHaveCount(0)
  await expect(bar).toHaveCount(0)
  // A click on another frame's label picks that one; a click on empty canvas lets it go.
  await clickLabel(page, 'story')
  expect(await picked(page)).toBe('story')
  await expect(bar).toHaveAttribute('data-frame', 'story')
  await click(page, 1180, 500)
  expect(await picked(page)).toBeNull()
  // A click on a layer selects it and lets the frame go; one on the empty area picks it again and
  // lets the layer go.
  await clickLabel(page, 'sq')
  await click(page, 300, 130)
  expect(await selection(page)).toEqual(['headline'])
  expect(await picked(page)).toBeNull()
  await expect(bar).toHaveAttribute('data-selection', 'headline')
  await click(page, 1000, 1000)
  expect(await picked(page)).toBe('sq')
  expect(await selection(page)).toEqual([])
  // Picking never moved the canvas, nor changed the design.
  expect(await page.evaluate(() => window.dazbee?.camera())).toEqual(still)
  expect(await page.evaluate(() => window.dazbee?.canUndo())).toBe(false)
  expect(errors).toEqual([])
})

test('a drag on a frame’s empty area or its label moves it with its layers, the arrows move it too, each one undo step that a second tab sees', async ({
  browser,
}) => {
  const { a, b, errors } = await open(browser, 2)
  const before = await read(a)
  // From the empty area: 100 and 50 design pixels; the layers keep their places in the frame, and
  // the linked story and the unlinked banner stay as they were.
  await drag(a, { x: 1000, y: 1000 }, { x: 1100, y: 1050 })
  expect(await picked(a)).toBe('sq')
  let after = await read(a)
  expect(after.frames.sq).toMatchObject({ x: 100, y: 50 })
  expect(inFrame(after, 'sq').layers).toEqual(inFrame(before, 'sq').layers)
  expect(inFrame(after, 'story')).toEqual(inFrame(before, 'story'))
  expect(inFrame(after, 'banner')).toEqual(inFrame(before, 'banner'))
  await settle([a, b])
  expect((await frameOf(b, 'sq'))?.x).toBe(100)
  await press(a, 'undo')
  expect(await frameOf(a, 'sq')).toMatchObject({ x: 0, y: 0 })
  await press(a, 'redo')
  expect(await frameOf(a, 'sq')).toMatchObject({ x: 100, y: 50 })
  await press(a, 'undo')
  expect(await a.evaluate(() => window.dazbee?.canUndo())).toBe(false)

  // From the label, which follows the frame: 100 by 40 screen pixels at half size.
  await a.keyboard.press('Escape')
  const from = await labelPoint(a, 'story', 30)
  await dragScreen(a, from, { x: from.x + 100, y: from.y + 40 })
  expect(await picked(a)).toBe('story')
  expect(await frameOf(a, 'story')).toMatchObject({ x: 1480, y: 80 })
  await expect(label(a, 'story')).toHaveAttribute('data-active', '')
  expect(inFrame(await read(a), 'story').layers).toEqual(inFrame(before, 'story').layers)
  await press(a, 'undo')
  expect(await frameOf(a, 'story')).toMatchObject({ x: 1280, y: 0 })
  await press(a, 'redo')

  // The arrows: a pixel, ten with Shift, each press one undo step.
  await a.keyboard.press('ArrowRight')
  await a.keyboard.press('Shift+ArrowDown')
  await drawn(a)
  expect(await frameOf(a, 'story')).toMatchObject({ x: 1481, y: 90 })
  await press(a, 'undo')
  expect(await frameOf(a, 'story')).toMatchObject({ x: 1481, y: 80 })
  await settle([a, b])
  expect(await frameOf(b, 'story')).toMatchObject({ x: 1481, y: 80 })
  after = await read(a)
  expect(inFrame(after, 'sq')).toEqual(inFrame(before, 'sq'))
  expect(errors).toEqual([])
})

test('presses on a turned, a masked and a locked layer act on the layer; the frame holding them moves, copies and goes with them as they are', async ({
  browser,
}) => {
  const { a: page, errors } = await open(browser)
  const before = await read(page)
  // The turned layer and the photo inside its mask are selected, the frame left as it is.
  await click(page, 200, 460)
  expect(await selection(page)).toEqual(['tilt'])
  await click(page, 500, 800)
  expect(await selection(page)).toEqual(['photo'])
  expect(await picked(page)).toBeNull()
  // A drag from the locked layer draws a marquee: neither the layer nor the frame moves.
  await press(page, 'deselect')
  await drag(page, { x: 800, y: 500 }, { x: 1000, y: 700 })
  expect(await frameOf(page, 'sq')).toMatchObject({ x: 0, y: 0 })
  expect(await picked(page)).toBeNull()
  // The frame moves with its layers as they were: turned, locked and masked.
  await drag(page, { x: 1000, y: 1000 }, { x: 1040, y: 1000 })
  expect(await frameOf(page, 'sq')).toMatchObject({ x: 40, y: 0 })
  expect(inFrame(await read(page), 'sq').layers).toEqual(inFrame(before, 'sq').layers)
  // Its copy holds a linked copy of each, turned, locked and masked as they are.
  await press(page, 'duplicate')
  const copy = (await picked(page)) ?? ''
  expect(copy).not.toBe('sq')
  const copied = Object.values(inFrame(await read(page), copy).layers)
  const by = (link: string) => copied.find((node) => node.link === link)
  expect(copied).toHaveLength(5)
  expect(by('tilt')?.props.rotation).toBe(30)
  expect(by('locked')?.lock).toEqual(before.nodes.locked?.lock)
  expect(by('disc')?.props.mask).toBe('alpha')
  // Deleting the square takes its layers; its copies in the story and the copy stay.
  await clickLabel(page, 'sq')
  await press(page, 'delete')
  let after = await read(page)
  expect(after.frames.sq).toBeUndefined()
  for (const id of ['tilt', 'locked', 'disc', 'photo']) expect(after.nodes[id]).toBeUndefined()
  expect(inFrame(after, 'story')).toEqual(inFrame(before, 'story'))
  expect(Object.keys(inFrame(after, copy).layers)).toHaveLength(5)
  await press(page, 'undo')
  after = await read(page)
  expect(inFrame(after, 'sq').layers).toEqual(inFrame(before, 'sq').layers)
  expect(errors).toEqual([])
})

test('Duplicate from ⋯ and Ctrl+D copy the picked frame beside the rightmost one, holding linked copies, and pick the copy, each one undo step that a second tab sees', async ({
  browser,
}) => {
  const { a, b, errors } = await open(browser, 2)
  await click(a, 1000, 1000)
  const menu = await barMenu(a, 'frame-more')
  await expect(menu.getByRole('button')).toHaveText(['DuplicateCtrl+D', 'Rename', 'DeleteDelete'])
  writeOutput('frames-2-menu.png', await a.screenshot({ animations: 'disabled' }))
  await menu.getByRole('button', { name: /Duplicate/ }).click()
  await expect(menu).toBeHidden()
  await expect.poll(() => picked(a)).not.toBe('sq')
  const copy = (await picked(a)) ?? ''
  let d = await read(a)
  // After the banner, the rightmost frame, 200 px on, its top aligned with the banner's.
  expect(d.frames[copy]).toMatchObject({ name: 'Square', width: 1080, height: 1080, x: 3960, y: 0 })
  const links = (frameId: string) =>
    Object.values(inFrame(d, frameId).layers)
      .map((node) => node.link)
      .sort()
  expect(links(copy)).toEqual(links('sq'))
  await expect(a.getByTestId('top-bar')).toHaveAttribute('data-frame', copy)
  await settle([a, b])
  expect((await frameOf(b, copy))?.name).toBe('Square')
  await press(a, 'undo')
  expect(await frameOf(a, copy)).toBeUndefined()
  await press(a, 'redo')
  expect(await frameOf(a, copy)).toBeDefined()

  // Ctrl+D with the story picked, by the keyboard alone.
  await clickLabel(a, 'story')
  await press(a, 'duplicate')
  const second = (await picked(a)) ?? ''
  d = await read(a)
  expect(d.frames[second]).toMatchObject({ name: 'Story', width: 1080, height: 1920, x: 5240, y: 0 })
  expect(links(second)).toEqual(links('story'))
  await press(a, 'undo')
  expect(await frameOf(a, second)).toBeUndefined()
  await settle([a, b])
  expect(await frameOf(b, second)).toBeUndefined()
  expect(errors).toEqual([])
})

test('Delete from ⋯ and the Delete key take the picked frame and its layers away, their linked copies and the unlinked frame staying, each one undo step that a second tab sees', async ({
  browser,
}) => {
  const { a, b, errors } = await open(browser, 2)
  const before = await read(a)
  await clickLabel(a, 'sq')
  const menu = await barMenu(a, 'frame-more')
  await menu.getByRole('button', { name: /Delete/ }).click()
  await expect.poll(() => picked(a)).toBeNull()
  await expect(a.getByTestId('top-bar')).toHaveCount(0)
  let after = await read(a)
  expect(after.frames.sq).toBeUndefined()
  expect(Object.keys(inFrame(after, 'sq').layers)).toEqual([])
  expect(inFrame(after, 'story')).toEqual(inFrame(before, 'story'))
  expect(inFrame(after, 'banner')).toEqual(inFrame(before, 'banner'))
  await settle([a, b])
  expect(await frameOf(b, 'sq')).toBeUndefined()
  await press(a, 'undo')
  expect(inFrame(await read(a), 'sq')).toEqual(inFrame(before, 'sq'))
  await press(a, 'redo')
  expect(await frameOf(a, 'sq')).toBeUndefined()
  await press(a, 'undo')

  // The Delete key on the unlinked banner, brought into view; the square and the story stay.
  await a.evaluate(() => window.dazbee?.setCamera({ x: -900, y: 180, zoom: 0.5 }))
  await drawn(a)
  await clickLabel(a, 'banner')
  await a.keyboard.press('Delete')
  await drawn(a)
  after = await read(a)
  expect(after.frames.banner).toBeUndefined()
  expect(after.nodes.badge).toBeUndefined()
  expect(inFrame(after, 'sq')).toEqual(inFrame(before, 'sq'))
  await settle([a, b])
  expect(await frameOf(b, 'banner')).toBeUndefined()
  await press(a, 'undo')
  await settle([a, b])
  expect(await designOf(b)).toBe(await designOf(a))
  expect(inFrame(await read(b), 'banner')).toEqual(inFrame(before, 'banner'))
  expect(errors).toEqual([])
})

test('a double click on a frame’s name renames it in place, Enter keeping it and Esc not; Rename in ⋯ does the same by the keyboard; each one undo step that a second tab sees', async ({
  browser,
}) => {
  const { a, b, errors } = await open(browser, 2)
  let field = await renameByLabel(a, 'sq')
  await expect(field).toHaveValue('Square')
  expect(await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 6])
  expect(await picked(a)).toBe('sq')
  writeOutput('frames-3-renaming.png', await a.screenshot({ animations: 'disabled' }))
  await a.keyboard.type('Sale')
  await a.keyboard.press('Enter')
  await expect(a.getByTestId('frame-rename')).toHaveCount(0)
  expect((await frameOf(a, 'sq'))?.name).toBe('Sale')
  await expect(label(a, 'sq').locator('.frame-name')).toHaveText('Sale')
  await settle([a, b])
  expect((await frameOf(b, 'sq'))?.name).toBe('Sale')
  await press(a, 'undo')
  expect((await frameOf(a, 'sq'))?.name).toBe('Square')
  await press(a, 'redo')
  expect((await frameOf(a, 'sq'))?.name).toBe('Sale')
  // Esc keeps the name it had; so does an empty one.
  field = await renameByLabel(a, 'sq')
  await a.keyboard.type('Nope')
  await a.keyboard.press('Escape')
  await expect(a.getByTestId('frame-rename')).toHaveCount(0)
  field = await renameByLabel(a, 'sq')
  await field.fill('  ')
  await a.keyboard.press('Enter')
  expect((await frameOf(a, 'sq'))?.name).toBe('Sale')
  // The Esc that cancelled left the frame picked.
  expect(await picked(a)).toBe('sq')

  // By the keyboard: Tab to the bar, along to ⋯, Enter opens it, down to Rename, Enter renames.
  expect(await tabToBar(a)).toBe('bar-background')
  await a.keyboard.press('ArrowRight')
  await expect(a.getByTestId('bar-frame-more')).toBeFocused()
  await a.keyboard.press('Enter')
  const menu = a.getByTestId('bar-frame-more-menu')
  await expect(menu.getByRole('button', { name: /Duplicate/ })).toBeFocused()
  await a.keyboard.press('Tab')
  await expect(menu.getByRole('button', { name: 'Rename' })).toBeFocused()
  await a.keyboard.press('Enter')
  field = a.getByTestId('frame-rename').locator('input')
  await expect(field).toBeFocused()
  await a.keyboard.type('Weekend')
  await a.keyboard.press('Enter')
  expect((await frameOf(a, 'sq'))?.name).toBe('Weekend')
  // The focus goes back to ⋯.
  await expect(a.getByTestId('bar-frame-more')).toBeFocused()
  await settle([a, b])
  expect((await frameOf(b, 'sq'))?.name).toBe('Weekend')
  expect(await frameOf(a, 'story')).toMatchObject({ name: 'Story' })
  expect(errors).toEqual([])
})

test('Background opens the Colour panel for the picked frame’s own fills: a colour is one undo step, the linked story keeps its own, a second tab sees it; Tab, Enter and Esc work it', async ({
  browser,
}) => {
  const { a, b, errors } = await open(browser, 2)
  await click(a, 1000, 1000)
  const panel = await barMenu(a, 'background')
  await expect(panel.locator('#edit-panel-title')).toHaveText('Background')
  await expect(panel.getByTestId('edit-panel-note')).toHaveText('Square')
  writeOutput('frames-4-background.png', await a.screenshot({ animations: 'disabled' }))
  await panel.getByTestId('design-colours').getByRole('button', { name: '#2F6BFF' }).click()
  expect((await frameOf(a, 'sq'))?.fills).toEqual(solid('#2F6BFFFF'))
  expect((await frameOf(a, 'story'))?.fills).toEqual(solid('#FFFFFFFF'))
  await expect(a.getByTestId('bar-background').locator('span').first()).toHaveCSS(
    'background-color',
    'rgb(47, 107, 255)',
  )
  await settle([a, b])
  expect((await frameOf(b, 'sq'))?.fills).toEqual(solid('#2F6BFFFF'))
  // Advanced lists the frame's fills, and + adds one over it.
  const fills = panel.getByTestId('frame-fills')
  await expect(fills.locator('[data-item^="fills-"]')).toHaveCount(1)
  await fills.getByRole('button', { name: 'Add a background layer' }).click()
  await expect(fills.locator('[data-item^="fills-"]')).toHaveCount(2)
  await press(a, 'undo')
  await expect(fills.locator('[data-item^="fills-"]')).toHaveCount(1)
  await press(a, 'undo')
  expect((await frameOf(a, 'sq'))?.fills).toEqual(solid('#FFFFFFFF'))
  await press(a, 'redo')
  expect((await frameOf(a, 'sq'))?.fills).toEqual(solid('#2F6BFFFF'))
  // Esc closes the panel, giving the focus back to Background, and leaves the frame picked; Enter
  // opens it again, and a second Esc after closing it lets the frame go.
  await panel.focus()
  await a.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(a.getByTestId('bar-background')).toBeFocused()
  expect(await picked(a)).toBe('sq')
  await a.keyboard.press('Enter')
  await expect(a.locator('#edit-panel[data-panel="background"]')).toBeVisible()
  await a.keyboard.press('Escape')
  await expect(a.locator('#edit-panel')).toHaveCount(0)
  await expect(a.getByTestId('bar-background')).toBeFocused()
  // ⋯ opens by Enter, and Esc closes it, the focus back on ⋯.
  await a.keyboard.press('ArrowRight')
  await a.keyboard.press('Enter')
  await expect(a.getByTestId('bar-frame-more-menu')).toBeVisible()
  await a.keyboard.press('Escape')
  await expect(a.getByTestId('bar-frame-more-menu')).toBeHidden()
  await expect(a.getByTestId('bar-frame-more')).toBeFocused()
  // Another frame picked closes the panel.
  await barMenu(a, 'background')
  await clickLabel(a, 'story')
  await expect(a.locator('#edit-panel')).toHaveCount(0)
  expect(errors).toEqual([])
})
