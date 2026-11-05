// Frames on the canvas: a frame is picked by a click on its empty area or its label (outlined, its
// label lit, a top bar with Background and ⋯), moved by a drag on its label or by the arrows, while a
// drag on its empty area draws a marquee; given a background, duplicated, renamed in place and
// deleted, each by the mouse and by the keyboard, each one undo step that a second tab sees. A page
// holds a square, a story linked to it and a banner linked to nothing; the square holds a turned
// layer, a locked one and one under a mask. The three screen sizes are in
// frames-on-canvas-screens.spec.ts, and the arrows inside the picked frame's bar and Rename with the
// label off screen in frames-on-canvas-bar.spec.ts.
import { solid } from '../../support/edit-in-frame.ts'
import { designOf, screenPoint, settle, writeOutput } from '../../support/editor.ts'
import {
  clickLabel,
  frameMenuItems,
  frameOf,
  labelPoint,
  labelRow,
  openFrames,
  picked,
  tabToBar,
} from '../../support/frames-on-canvas.ts'
import { layersIn } from '../../support/seed.ts'
import {
  click,
  type Design,
  drag,
  dragScreen,
  drawn,
  handle,
  press,
  props,
  read,
  selection,
  zoomOf,
} from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

/** What a frame holds: the frame as stored and its layers by id. */
const inFrame = (d: Design, frameId: string) => ({
  frame: d.frames[frameId],
  layers: Object.fromEntries(layersIn(d, frameId)),
})
const label = (page: Page, id: string) => page.locator(`.stage-overlay .frame-label[data-frame="${id}"]`)

/** Where a frame is on screen now, as a box in client pixels, and where the stage is. */
async function onScreen(page: Page, id: string) {
  await drawn(page)
  const frame = (await frameOf(page, id)) ?? { width: 0, height: 0 }
  const start = await screenPoint(page, 0, 0, id)
  const end = await screenPoint(page, frame.width, frame.height, id)
  const stage = await page.getByTestId('stage').boundingBox()
  if (!stage) throw new Error('no stage')
  return { start, end, stage }
}
/** Double-clicks a frame's name on its label, and gives the field that renames it once it shows. */
async function renameByLabel(page: Page, id: string) {
  const name = await labelPoint(page, id)
  await page.mouse.dblclick(name.x, name.y)
  const field = page.getByTestId('frame-rename').locator('input')
  await expect(field).toBeFocused()
  return field
}

test('a click on a frame’s empty area or its label picks it: outlined, its label lit, a bar with Background and ⋯; Esc, empty canvas or a layer lets it go', async ({
  browser,
}) => {
  const { a: page, errors } = await openFrames(browser)
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
  // Background is a swatch, as a layer's Fill is, named for the person who can't see it.
  await expect(page.getByTestId('bar-background')).toHaveText('')
  await expect(page.getByTestId('bar-background')).toHaveAccessibleName('Background colour')
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

test('the label takes a press only on its name and size, after a selected layer’s handles and turning zones under it: beside its text a press starts a marquee', async ({
  browser,
}) => {
  const { a: page, errors } = await openFrames(browser)
  // Measured in one step in the page, as the overlay draws its labels afresh on every draw.
  const boxes = await page.evaluate(() =>
    ['', ' .frame-name', ' .frame-size'].map((part) => {
      const box = document.querySelector(`.stage-overlay .frame-label[data-frame="sq"]${part}`)?.getBoundingClientRect()
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null
    }),
  )
  const [row, name, size] = boxes
  if (!row || !name || !size) throw new Error('no label on the square')
  // Between the name and the size, the row is canvas: a drag from there is a marquee over the headline.
  const from = { x: (name.x + name.width + size.x) / 2, y: row.y + row.height - 5 }
  await dragScreen(page, from, { x: from.x + 300, y: from.y + 140 })
  expect(await selection(page)).toEqual(['headline'])
  expect(await picked(page)).toBeNull()
  expect(await frameOf(page, 'sq')).toMatchObject({ x: 0, y: 0 })

  // The headline moved into the frame's corner and selected: its corner handle and the zone that
  // turns it lie under the label's name, and act on the headline.
  await page.evaluate(() => window.dazbee?.setProps(['headline'], () => ({ x: 0, y: 0 })))
  await page.evaluate(() => window.dazbee?.select(['headline']))
  await drawn(page)
  const corner = await handle(page, 'nw')
  const onName = (p: { x: number; y: number }) =>
    p.x >= name.x && p.x <= name.x + name.width && p.y >= row.y && p.y <= row.y + row.height
  const grab = { x: corner.x + 2, y: corner.y - 5 }
  expect(onName(grab)).toBe(true)
  await dragScreen(page, grab, { x: grab.x - 40, y: grab.y - 30 })
  expect(await picked(page)).toBeNull()
  expect(await selection(page)).toEqual(['headline'])
  const resized = await props(page, 'headline')
  expect(resized.x).toBeLessThan(0)
  expect(resized.y).toBeLessThan(0)
  await press(page, 'undo')
  const turn = { x: corner.x + 10, y: corner.y - 12 }
  expect(onName(turn)).toBe(true)
  await dragScreen(page, turn, { x: turn.x + 60, y: turn.y - 60 })
  expect(await picked(page)).toBeNull()
  expect((await props(page, 'headline')).rotation ?? 0).not.toBe(0)
  expect(await frameOf(page, 'sq')).toMatchObject({ x: 0, y: 0 })
  expect(errors).toEqual([])
})

test('a drag on a frame’s empty area, picked or not, draws a marquee, adding with Shift; a drag on its label moves it with its layers, along one axis with Shift, and the arrows move it too, each one undo step that a second tab sees', async ({
  browser,
}) => {
  const { a, b, errors } = await openFrames(browser, 2)
  const before = await read(a)
  // From the empty area, the frame not picked: a marquee over the headline, the frame left where it is.
  await drag(a, { x: 1000, y: 120 }, { x: 600, y: 160 })
  expect(await selection(a)).toEqual(['headline'])
  expect(await picked(a)).toBeNull()
  // Picked, the same: a marquee from its empty area, which lets the frame go.
  await click(a, 1000, 1000)
  expect(await picked(a)).toBe('sq')
  await drag(a, { x: 1000, y: 120 }, { x: 600, y: 160 })
  expect(await selection(a)).toEqual(['headline'])
  expect(await picked(a)).toBeNull()
  // With Shift, a marquee from the empty area adds what it touches to the selection.
  await drag(a, { x: 60, y: 1000 }, { x: 250, y: 480 }, ['Shift'], true)
  expect((await selection(a)).sort()).toEqual(['headline', 'tilt'])
  expect(await read(a)).toEqual(before)
  expect(await a.evaluate(() => window.dazbee?.canUndo())).toBe(false)

  // From the label: 100 and 50 design pixels, 50 by 25 screen pixels at half size; the layers keep
  // their places in the frame, and the linked story and the unlinked banner stay as they were.
  await a.keyboard.press('Escape')
  const sq = await labelPoint(a, 'sq', 30)
  await dragScreen(a, sq, { x: sq.x + 50, y: sq.y + 25 })
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

  // Shift holds a drag on the label to the axis it went furthest along.
  const along = await labelPoint(a, 'sq', 30)
  await dragScreen(a, along, { x: along.x + 60, y: along.y + 20 }, ['Shift'])
  expect(await frameOf(a, 'sq')).toMatchObject({ x: 120, y: 0 })
  await press(a, 'undo')
  expect(await frameOf(a, 'sq')).toMatchObject({ x: 0, y: 0 })

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
  const { a: page, errors } = await openFrames(browser)
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
  // The frame moves by its label with its layers as they were: turned, locked and masked.
  const from = await labelPoint(page, 'sq', 30)
  await dragScreen(page, from, { x: from.x + 20, y: from.y })
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
  // Deleting the square takes its layers; its copies in the story and the copy stay. Duplicate
  // panned to the copy, so the view goes back to the square first.
  await page.evaluate(() => window.dazbee?.setCamera({ x: 300, y: 180, zoom: 0.5 }))
  await drawn(page)
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

test('Duplicate from ⋯ and Ctrl+D copy the picked frame beside the rightmost one, holding linked copies, and pick the copy, panning to show it at the same zoom, each one undo step that a second tab sees', async ({
  browser,
}) => {
  const { a, b, errors } = await openFrames(browser, 2)
  await click(a, 1000, 1000)
  await barMenu(a, 'frame-more')
  const menu = await frameMenuItems(a)
  // As a page's ⋯ on the Pages card: a line before Delete, in the danger colour, and the menu
  // under the bar, lined up with the end of ⋯.
  const remove = menu.getByRole('button', { name: /Delete/ })
  await expect(menu.getByRole('separator')).toHaveCount(1)
  expect(await remove.evaluate((el) => el.previousElementSibling?.getAttribute('role'))).toBe('separator')
  const ink = (el: Element) => getComputedStyle(el).color
  expect(await remove.evaluate(ink)).not.toBe(await menu.getByRole('button', { name: 'Rename' }).evaluate(ink))
  const more = await a.getByTestId('bar-frame-more').boundingBox()
  const bar = await a.getByTestId('top-bar').boundingBox()
  const box = await menu.boundingBox()
  if (!more || !bar || !box) throw new Error('no menu')
  expect(Math.abs(box.x + box.width - (more.x + more.width))).toBeLessThanOrEqual(1)
  expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height)
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
  // The view panned to show the copy whole with its label, at the zoom it had.
  expect(await zoomOf(a)).toBe(0.5)
  const shown = await onScreen(a, copy)
  expect(shown.start.x).toBeGreaterThanOrEqual(shown.stage.x)
  expect(shown.start.y - 24).toBeGreaterThanOrEqual(shown.stage.y)
  expect(shown.end.x).toBeLessThanOrEqual(shown.stage.x + shown.stage.width)
  expect(shown.end.y).toBeLessThanOrEqual(shown.stage.y + shown.stage.height)
  await expect(label(a, copy)).toBeVisible()
  await settle([a, b])
  expect((await frameOf(b, copy))?.name).toBe('Square')
  await press(a, 'undo')
  expect(await frameOf(a, copy)).toBeUndefined()
  await press(a, 'redo')
  expect(await frameOf(a, copy)).toBeDefined()

  // Ctrl+D with the story picked, by the keyboard alone, from the view the test opened with.
  await a.evaluate(() => window.dazbee?.setCamera({ x: 300, y: 180, zoom: 0.5 }))
  await drawn(a)
  await clickLabel(a, 'story')
  await press(a, 'duplicate')
  const second = (await picked(a)) ?? ''
  d = await read(a)
  expect(d.frames[second]).toMatchObject({ name: 'Story', width: 1080, height: 1920, x: 5240, y: 0 })
  expect(links(second)).toEqual(links('story'))
  // Taller than the stage at this zoom, the copy is centred on it.
  expect(await zoomOf(a)).toBe(0.5)
  const middle = await onScreen(a, second)
  expect(Math.abs((middle.start.x + middle.end.x) / 2 - (middle.stage.x + middle.stage.width / 2))).toBeLessThan(
    middle.stage.width / 4,
  )
  await press(a, 'undo')
  expect(await frameOf(a, second)).toBeUndefined()
  await settle([a, b])
  expect(await frameOf(b, second)).toBeUndefined()
  expect(errors).toEqual([])
})

test('Delete from ⋯ and the Delete key take the picked frame and its layers away, their linked copies and the unlinked frame staying, with the undo toast, each one undo step that a second tab sees', async ({
  browser,
}) => {
  const { a, b, errors } = await openFrames(browser, 2)
  const before = await read(a)
  await clickLabel(a, 'sq')
  const menu = await barMenu(a, 'frame-more')
  await menu.getByRole('button', { name: /Delete/ }).click()
  await expect.poll(() => picked(a)).toBeNull()
  await expect(a.getByTestId('top-bar')).toHaveCount(0)
  // The toast says so with its undo, as deleting a page does.
  const toast = a.getByTestId('removed-toast')
  await expect(toast).toContainText('Square deleted')
  let after = await read(a)
  expect(after.frames.sq).toBeUndefined()
  expect(Object.keys(inFrame(after, 'sq').layers)).toEqual([])
  expect(inFrame(after, 'story')).toEqual(inFrame(before, 'story'))
  expect(inFrame(after, 'banner')).toEqual(inFrame(before, 'banner'))
  await settle([a, b])
  expect(await frameOf(b, 'sq')).toBeUndefined()
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(toast).toHaveCount(0)
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
  await expect(toast).toContainText('Banner deleted')
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
  const { a, b, errors } = await openFrames(browser, 2)
  let field = await renameByLabel(a, 'sq')
  await expect(field).toHaveValue('Square')
  // The field takes the label's place: the label hides while it is openFrames, and the field stands in
  // its row, its text where the label's was, as see-through as the label, with an accent line
  // under it, clear of the frame's outline and no wider than the label.
  const row = await labelRow(a, 'sq')
  await expect(label(a, 'sq')).toBeHidden()
  await expect(a.locator('[data-testid="frame-rename"] style')).toHaveCount(0)
  const at = await field.boundingBox()
  if (!at) throw new Error('no field')
  expect(at.y).toBeCloseTo(row.y, 0)
  expect(at.height).toBeCloseTo(row.height, 0)
  expect(at.x).toBeCloseTo(row.x, 0)
  expect(at.x + at.width).toBeLessThanOrEqual(row.x + row.width + 0.5)
  const look = await field.evaluate((el) => {
    const css = getComputedStyle(el)
    return { padding: css.paddingLeft, fill: css.backgroundColor, outline: css.outlineStyle, under: css.boxShadow }
  })
  expect(look).toMatchObject({ padding: '0px', fill: 'rgba(0, 0, 0, 0)', outline: 'none' })
  expect(look.under).toMatch(/inset$/)
  expect(look.under).toContain('0px -1px 0px 0px')
  expect(await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 6])
  expect(await picked(a)).toBe('sq')
  writeOutput('frames-3-renaming.png', await a.screenshot({ animations: 'disabled' }))
  await a.keyboard.type('Sale')
  await a.keyboard.press('Enter')
  await expect(a.getByTestId('frame-rename')).toHaveCount(0)
  expect((await frameOf(a, 'sq'))?.name).toBe('Sale')
  await expect(label(a, 'sq')).toBeVisible()
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
  await frameMenuItems(a, 'Rename')
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
  const { a, b, errors } = await openFrames(browser, 2)
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
  await fills.getByRole('button', { name: 'Add a colour' }).click()
  await expect(fills.locator('[data-item^="fills-"]')).toHaveCount(2)
  await press(a, 'undo')
  await expect(fills.locator('[data-item^="fills-"]')).toHaveCount(1)
  await press(a, 'undo')
  expect((await frameOf(a, 'sq'))?.fills).toEqual(solid('#FFFFFFFF'))
  await press(a, 'redo')
  expect((await frameOf(a, 'sq'))?.fills).toEqual(solid('#2F6BFFFF'))
  // With no fill left, Background's swatch is empty, not the rainbow of colours that differ.
  await fills.getByRole('button', { name: 'Remove background colour 1' }).click()
  expect((await frameOf(a, 'sq'))?.fills).toEqual([])
  const swatch = a.getByTestId('bar-background').locator('span').first()
  await expect(swatch).toHaveCSS('background-image', 'none')
  await expect(swatch).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await press(a, 'undo')
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
