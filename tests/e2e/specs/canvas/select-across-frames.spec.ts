// Selecting across frames, in Chromium: Ctrl+Alt+A selects a layer's linked copies in every frame
// of the page and Shift with a click adds or takes one out; a top bar or panel change sets each
// copy, showing Mixed where they differ; a drag and the arrow keys move every copy by the same
// amount; typing happens in the copy double-clicked. Each change is one undo step and reaches a
// second tab live. Over every layer type, inside a group and an auto layout box, with a copy hidden
// or locked in one frame, and text in each box mode.
import { photo, upload } from '../../support/assets.ts'
import { openTabs, screenPoint, setCookies, writeOutput } from '../../support/editor.ts'
import { enter } from '../../support/fields.ts'
import { openSized } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { layerRow } from '../../support/layers-frames.ts'
import { openLayers } from '../../support/layers-panel.ts'
import { layoutProblems, SCREEN_SIZES } from '../../support/layout.ts'
import { node, open, redo, undo } from '../../support/linked-menu.ts'
import { linkedMenuDesign } from '../../support/linked-menu-design.ts'
import { copyIn, seed } from '../../support/seed.ts'
import { drawn, fitSettled, nextFrame, perform, press, selection, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { openCard, PIECES, UNCUT } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

/** The linked frames of the design's page that hold a copy of every layer of the square. */
const LINKED = ['story', 'wide'] as const
/** A layer of the square with its copies in the story and the landscape frame. */
const everyCopy = (id: string) => [id, ...LINKED.map((frame) => copyIn(frame, id))]

/** A layer's box as the design holds it. */
async function placeOf(page: Page, id: string) {
  const props = (await node(page, id))?.props as { x: number; y: number; width: number; height: number }
  return { x: props.x, y: props.y, width: props.width, height: props.height }
}
/** Where each of these layers is, by id. */
const placesOf = async (page: Page, ids: string[]) => Promise.all(ids.map((id) => placeOf(page, id)))
/** A text layer's font size as the design holds it. */
const sizeOf = async (page: Page, id: string) => ((await node(page, id))?.props.style as { fontSize: number }).fontSize
/** The middle of a layer on screen, as it is drawn in its frame. */
async function middleOf(page: Page, id: string, frameId: string) {
  const box = await page.evaluate((one) => window.dazbee?.boxOf(one), id)
  if (!box) throw new Error(`no box for ${id}`)
  return screenPoint(page, box.x + box.width / 2, box.y + box.height / 2, frameId)
}
/** A click on a layer where it is drawn, with Shift held when asked. */
async function clickOn(page: Page, id: string, frameId: string, shift = false) {
  const at = await middleOf(page, id, frameId)
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.click(at.x, at.y)
  if (shift) await page.keyboard.up('Shift')
  await drawn(page)
}
/** Selects a layer and its linked copies with Ctrl+Alt+A, waiting until the top bar shows them. */
async function selectCopies(page: Page, id: string) {
  // The stage's keys act once no field has the focus, as after a click on the canvas.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await selectLayers(page, [id])
  await press(page, 'selectLinkedCopies')
  await expect(page.getByTestId('top-bar')).toHaveAttribute('data-selection', everyCopy(id).join(' '))
}

/** Opens the design at a screen size, in a theme, with a finger on the phone, its page fitted. */
async function openAt(browser: Parameters<typeof open>[0], width: number, height: number, theme = 'dark') {
  const asset = await upload(photo)
  const phone = width < 600
  return openSized(
    browser,
    { width, height },
    { theme, input: linkedMenuDesign(asset.id), touch: phone, mobile: phone },
  )
}
/** The headline in the square and the landscape, picked as the stage picks them: their sizes and X differ. */
async function selectTwoFrames(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await selectLayers(page, ['headline'])
  await press(page, 'selectLinkedCopies')
  await page.evaluate(() => window.dazbee?.toggleSelected('story-headline'))
  await expect(page.getByTestId('top-bar')).toHaveAttribute('data-selection', 'headline wide-headline')
}

test('Ctrl+Alt+A selects the linked copies of each layer type in every linked frame of the page, each frame outlined', async ({
  browser,
}) => {
  const { page, errors } = await open(browser)
  for (const id of ['headline', 'badge', 'photo', 'logo', 'shapes', 'card']) {
    await selectCopies(page, id)
    expect(await selection(page)).toEqual(everyCopy(id))
    // The first one's frame has the box; each other frame its own outline, with no dashed copy left.
    await expect(page.locator('.stage-overlay .selection')).toHaveAttribute('data-frame', 'sq')
    await expect(page.locator('.stage-overlay .selection-copy')).toHaveCount(2)
    await expect(page.locator('.stage-overlay .linked-copy')).toHaveCount(0)
    // Across frames there are no handles: a move, the arrows and the panels change every copy alike.
    await expect(page.locator('.stage-overlay .handle')).toHaveCount(0)
    await expect(page.locator('.stage-overlay .frame-label[data-active]')).toHaveCount(3)
  }
  // Layers several at once: each one's copies join it.
  await selectLayers(page, ['headline', 'sub'])
  await press(page, 'selectLinkedCopies')
  expect(await selection(page)).toEqual([
    'headline',
    'sub',
    copyIn('story', 'headline'),
    copyIn('wide', 'headline'),
    copyIn('story', 'sub'),
    copyIn('wide', 'sub'),
  ])
  // A layer of a frame linked to none has no copies to add; the frame on page 2 is never reached.
  await selectLayers(page, ['fresh-title'])
  await press(page, 'selectLinkedCopies')
  expect(await selection(page)).toEqual(['fresh-title'])
  await page.keyboard.press('Escape')
  expect(await selection(page)).toEqual([])
  expect(errors).toEqual([])
})

test('Shift and a click on a copy adds it to the selection and takes it out again, and a layer of another frame selects alone', async ({
  browser,
}) => {
  const { page, errors } = await open(browser)
  await clickOn(page, 'badge', 'sq')
  expect(await selection(page)).toEqual(['badge'])
  await expect(page.locator('.stage-overlay .linked-copy')).toHaveCount(2)
  await clickOn(page, copyIn('story', 'badge'), 'story', true)
  expect(await selection(page)).toEqual(['badge', copyIn('story', 'badge')])
  // The copy now selected has no dashed outline; the landscape frame's still does.
  await expect(page.locator('.stage-overlay .linked-copy')).toHaveCount(1)
  await expect(page.locator('.stage-overlay .selection-copy')).toHaveAttribute('data-frame', 'story')
  await clickOn(page, copyIn('story', 'badge'), 'story', true)
  expect(await selection(page)).toEqual(['badge'])
  // Once a copy is in, the rest of its frame can join it with Shift.
  await clickOn(page, copyIn('story', 'badge'), 'story', true)
  await clickOn(page, copyIn('story', 'headline'), 'story', true)
  expect(await selection(page)).toEqual(['badge', copyIn('story', 'badge'), copyIn('story', 'headline')])
  // A layer of a frame linked to none is no copy: it is selected alone.
  await clickOn(page, 'fresh-title', 'fresh', true)
  expect(await selection(page)).toEqual(['fresh-title'])
  // A plain click on one copy of several selected selects it alone.
  await selectCopies(page, 'badge')
  await clickOn(page, copyIn('wide', 'badge'), 'wide')
  expect(await selection(page)).toEqual([copyIn('wide', 'badge')])
  expect(errors).toEqual([])
})

test('the layers panel adds a copy with Shift and a click on its row, as the stage does', async ({ browser }) => {
  const { page, errors } = await open(browser)
  await openLayers(page)
  const story = copyIn('story', 'badge')
  // Selected once, so the story's row is open and listed.
  await selectLayers(page, [story])
  await expect(layerRow(page, story)).toBeVisible()
  await selectLayers(page, ['badge'])
  await layerRow(page, story)
    .getByTestId('layer-name')
    .click({ modifiers: ['Shift'] })
  expect(await selection(page)).toEqual(['badge', story])
  await expect(layerRow(page, story)).toHaveAttribute('aria-selected', 'true')
  await expect(layerRow(page, 'badge')).toHaveAttribute('aria-selected', 'true')
  await layerRow(page, story)
    .getByTestId('layer-name')
    .click({ modifiers: ['Shift'] })
  expect(await selection(page)).toEqual(['badge'])
  expect(errors).toEqual([])
})

test('a top bar and a panel change sets each copy, Mixed where they differ, as one undo step', async ({ browser }) => {
  const { page, errors } = await open(browser)
  await selectCopies(page, 'headline')
  // The square and the story have 110, the landscape 72: the size shows none of them.
  const size = page.getByTestId('bar-size-field')
  await expect(size).toHaveValue('')
  await enter(size, '90')
  await expect.poll(async () => Promise.all(everyCopy('headline').map((id) => sizeOf(page, id)))).toEqual([90, 90, 90])
  await expect(size).toHaveValue('90')
  await undo(page)
  await expect
    .poll(async () => Promise.all(everyCopy('headline').map((id) => sizeOf(page, id))))
    .toEqual([110, 110, 72])
  await redo(page)
  await expect.poll(async () => Promise.all(everyCopy('headline').map((id) => sizeOf(page, id)))).toEqual([90, 90, 90])

  // The Position panel: X differs (80, 80, 60), Y is set on all.
  await selectCopies(page, 'badge')
  const card = await openCard(page, 'layout-card')
  const x = card.getByRole('spinbutton', { name: 'X position' })
  await expect(x).toHaveValue('')
  await expect(x).toHaveAttribute('placeholder', 'Mixed')
  await enter(card.getByRole('spinbutton', { name: 'Y position' }), '300')
  await expect.poll(async () => (await placesOf(page, everyCopy('badge'))).map((p) => p.y)).toEqual([300, 300, 300])
  await undo(page)
  await expect.poll(async () => (await placesOf(page, everyCopy('badge'))).map((p) => p.y)).toEqual([330, 1080, 100])
  expect(errors).toEqual([])
})

test('a drag moves every copy by the same amount as the pointer, and the arrow keys too, each one undo step', async ({
  browser,
}) => {
  const { page, errors } = await open(browser)
  await selectCopies(page, 'badge')
  const before = await placesOf(page, everyCopy('badge'))
  const zoom = await page.evaluate(() => window.dazbee?.camera().zoom ?? 1)
  // From the story's copy, in small moves.
  const from = await middleOf(page, copyIn('story', 'badge'), 'story')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let step = 1; step <= 8; step++) await page.mouse.move(from.x + step * 10, from.y + step * 5)
  await page.mouse.up()
  await drawn(page)
  const moved = { x: Math.round(80 / zoom), y: Math.round(40 / zoom) }
  const after = await placesOf(page, everyCopy('badge'))
  after.forEach((p, i) => {
    const was = before[i] as { x: number; y: number }
    expect(Math.abs(p.x - was.x - moved.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(p.y - was.y - moved.y)).toBeLessThanOrEqual(1)
  })
  // Every copy went the same way, and they stay selected.
  expect(new Set(after.map((p, i) => `${p.x - (before[i]?.x ?? 0)},${p.y - (before[i]?.y ?? 0)}`)).size).toBe(1)
  expect(await selection(page)).toEqual(everyCopy('badge'))
  await undo(page)
  expect(await placesOf(page, everyCopy('badge'))).toEqual(before)

  for (const key of ['ArrowRight', 'ArrowRight', 'Shift+ArrowDown']) await page.keyboard.press(key)
  await drawn(page)
  expect(
    (await placesOf(page, everyCopy('badge'))).map((p, i) => [p.x - (before[i]?.x ?? 0), p.y - (before[i]?.y ?? 0)]),
  ).toEqual([
    [2, 10],
    [2, 10],
    [2, 10],
  ])
  await undo(page)
  expect((await placesOf(page, everyCopy('badge'))).map((p, i) => p.x - (before[i]?.x ?? 0))).toEqual([2, 2, 2])
  expect((await placesOf(page, everyCopy('badge'))).map((p, i) => p.y - (before[i]?.y ?? 0))).toEqual([0, 0, 0])
  expect(errors).toEqual([])
})

test('a double click types in the copy double-clicked alone', async ({ browser }) => {
  const { page, errors } = await open(browser)
  await selectCopies(page, 'headline')
  const at = await middleOf(page, copyIn('story', 'headline'), 'story')
  await page.mouse.dblclick(at.x, at.y)
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await node(page, copyIn('story', 'headline')))?.props.text).toBe('Weekend sale!')
  expect((await node(page, 'headline'))?.props.text).toBe('Weekend sale')
  expect((await node(page, copyIn('wide', 'headline')))?.props.text).toBe('Weekend sale')
  expect(await selection(page)).toEqual([copyIn('story', 'headline')])
  await undo(page)
  await expect.poll(async () => (await node(page, copyIn('story', 'headline')))?.props.text).toBe('Weekend sale')
  expect(errors).toEqual([])
})

test('inside a group and inside an auto layout box, the copies are found and changed alike', async ({ browser }) => {
  const { page, errors } = await open(browser)
  // The logo group's mark, picked inside the group.
  await selectCopies(page, 'mark')
  const marks = await placesOf(page, everyCopy('mark'))
  await page.keyboard.press('ArrowLeft')
  await drawn(page)
  expect((await placesOf(page, everyCopy('mark'))).map((p, i) => p.x - (marks[i]?.x ?? 0))).toEqual([-1, -1, -1])
  // The groups fit what they hold again.
  expect((await placesOf(page, everyCopy('logo'))).map((p) => p.width)).toEqual(marks.map((m) => m.width))

  // The card laid out by auto layout in each frame, its text's size set on every copy at once.
  await page.evaluate(() =>
    window.dazbee?.session.gesture(() => {
      for (const id of ['card', 'story-card', 'wide-card'])
        window.dazbee?.session.run('node.autoLayout', { id, on: true })
    }),
  )
  await selectCopies(page, 'cta')
  await enter(page.getByTestId('bar-size-field'), '30')
  await expect.poll(async () => Promise.all(everyCopy('cta').map((id) => sizeOf(page, id)))).toEqual([30, 30, 30])
  await undo(page)
  await expect.poll(async () => Promise.all(everyCopy('cta').map((id) => sizeOf(page, id)))).toEqual([40, 40, 34])
  expect(errors).toEqual([])
})

test('a copy locked in one frame is left out, as select all leaves it, and one hidden in another is changed and stays hidden', async ({
  browser,
}) => {
  const { page, errors } = await open(browser)
  const story = copyIn('story', 'badge')
  const wide = copyIn('wide', 'badge')
  await page.evaluate(
    ({ locked, hidden }) => {
      window.dazbee?.session.run('node.lock', { ids: [locked], lock: { move: true } })
      window.dazbee?.setHidden([hidden], true)
    },
    { locked: story, hidden: wide },
  )
  await selectLayers(page, ['badge'])
  await press(page, 'selectLinkedCopies')
  expect(await selection(page)).toEqual(['badge', wide])
  // The locked copy keeps its dashed outline, so you see where else the layer is.
  await expect(page.locator('.stage-overlay .linked-copy')).toHaveAttribute('data-layer', story)
  const card = await openCard(page, 'layout-card')
  await enter(card.getByRole('spinbutton', { name: 'Y position' }), '200')
  await expect.poll(async () => [(await placeOf(page, 'badge')).y, (await placeOf(page, wide)).y]).toEqual([200, 200])
  expect((await placeOf(page, story)).y).toBe(1080)
  expect((await node(page, wide))?.props.visible).toBe(false)
  // Shift and a click adds the locked copy; the bar then offers to unlock, and one click frees it.
  await page.keyboard.press('Escape')
  await clickOn(page, story, 'story', true)
  expect(await selection(page)).toEqual(['badge', wide, story])
  await page.getByTestId('bar-unlock').click()
  await expect.poll(async () => (await node(page, story))?.lock?.move ?? false).toBe(false)
  expect(errors).toEqual([])
})

test('text in each box mode fits its words in its own way when the size is set on every copy', async ({ browser }) => {
  const { page, errors } = await open(browser)
  await page.evaluate(() => {
    window.dazbee?.setProps(['story-headline'], () => ({ boxMode: 'fixed' }))
    window.dazbee?.setProps(['wide-headline'], () => ({ boxMode: 'autoWidth' }))
  })
  await selectCopies(page, 'headline')
  const before = await placesOf(page, everyCopy('headline'))
  await enter(page.getByTestId('bar-size-field'), '60')
  await expect.poll(async () => Promise.all(everyCopy('headline').map((id) => sizeOf(page, id)))).toEqual([60, 60, 60])
  const [height, fixed, width] = await placesOf(page, everyCopy('headline'))
  // Auto height keeps its width and takes the words' height; fixed keeps its box; auto width takes the words' width.
  expect(height?.width).toBe(before[0]?.width)
  expect(height?.height).toBeLessThan(before[0]?.height ?? 0)
  expect(fixed).toEqual(before[1])
  expect(width?.width).not.toBe(before[2]?.width)
  // Shrink to fit on the fixed one keeps it in its box too.
  await page.evaluate(() => window.dazbee?.setProps(['story-headline'], () => ({ shrinkToFit: true })))
  await selectCopies(page, 'headline')
  await enter(page.getByTestId('bar-size-field'), '200')
  await expect.poll(async () => sizeOf(page, 'headline')).toBe(200)
  expect(await placeOf(page, copyIn('story', 'headline'))).toEqual(before[1])
  expect(errors).toEqual([])
})

test('a second tab sees each change to the copies live', async ({ browser }) => {
  const asset = await upload(photo)
  const designId = await seed(linkedMenuDesign(asset.id))
  const { tabs, errors } = await openTabs(browser, 2, designId)
  const [one, two] = tabs as [Page, Page]
  await fitSettled(one)
  await selectCopies(one, 'badge')
  await one.keyboard.press('ArrowDown')
  await expect.poll(async () => (await placesOf(two, everyCopy('badge'))).map((p) => p.y)).toEqual([331, 1081, 101])
  await selectCopies(one, 'headline')
  await enter(one.getByTestId('bar-size-field'), '80')
  await expect.poll(async () => Promise.all(everyCopy('headline').map((id) => sizeOf(two, id)))).toEqual([80, 80, 80])
  await perform(one, 'undo')
  await expect.poll(async () => Promise.all(everyCopy('headline').map((id) => sizeOf(two, id)))).toEqual([110, 110, 72])
  expect(errors).toEqual([])
})

test('the keyboard shortcuts dialog lists Ctrl+Alt+A, in English and Arabic', async ({ browser }) => {
  const { page, errors } = await open(browser)
  await page.keyboard.press('Shift+Slash')
  const row = page.getByTestId('shortcuts').locator('[data-shortcut="selectLinkedCopies"]')
  await expect(row).toContainText('Select linked copies in every frame')
  await expect(row.locator('kbd')).toHaveText(['Ctrl', 'Alt', 'A'])
  await page.keyboard.press('Escape')
  await setCookies(page, { locale: 'ar' })
  await page.reload()
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
  await page.keyboard.press('Shift+Slash')
  await expect(row).toContainText('تحديد النسخ المرتبطة في كل الإطارات')
  await expect(row.locator('kbd')).toHaveText(['Ctrl', 'Alt', 'A'])
  expect(errors).toEqual([])
})

for (const [width, height] of SCREEN_SIZES) {
  test(`at ${width}×${height} copies selected in two frames show Mixed in the bar and the Position panel, clear of everything; a finger drag moves both`, async ({
    browser,
  }) => {
    const { page, errors } = await openAt(browser, width, height)
    await selectTwoFrames(page)
    await expect(page.getByTestId('bar-size-field')).toHaveValue('')
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
    const x = (await openCard(page, 'layout-card')).getByRole('spinbutton', { name: 'X position' })
    await expect(x).toHaveAttribute('placeholder', 'Mixed')
    await nextFrame(page)
    expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
    await page.keyboard.press('Escape')
    if (width < 600) {
      // A finger drag on the landscape's copy moves both copies by the same amount, one undo step.
      await selectTwoFrames(page)
      const before = await placesOf(page, ['headline', 'wide-headline'])
      const from = await middleOf(page, 'wide-headline', 'wide')
      const cdp = await page.context().newCDPSession(page)
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
      await touch('touchStart', from.x, from.y)
      for (let step = 1; step <= 6; step++) await touch('touchMove', from.x + step * 4, from.y + step * 3)
      await touch('touchEnd', 0, 0)
      await drawn(page)
      const after = await placesOf(page, ['headline', 'wide-headline'])
      const moves = after.map((p, i) => [p.x - (before[i]?.x ?? 0), p.y - (before[i]?.y ?? 0)])
      expect(moves[0]).toEqual(moves[1])
      expect(moves[0]?.[0]).toBeGreaterThan(0)
      await undo(page)
      expect(await placesOf(page, ['headline', 'wide-headline'])).toEqual(before)
    }
    expect(errors).toEqual([])
  })
}

for (const [width, height] of SCREEN_SIZES) {
  for (const theme of THEMES) {
    test(
      `screenshots at ${width}×${height}, ${theme}: copies selected in two linked frames, Mixed in the bar and in the Position panel`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const { page, errors } = await openAt(browser, width, height, theme)
        await selectTwoFrames(page)
        await nextFrame(page)
        writeOutput(`select-across-${width}-${theme}-1-bar.png`, await page.screenshot({ animations: 'disabled' }))
        await openCard(page, 'layout-card')
        await nextFrame(page)
        writeOutput(`select-across-${width}-${theme}-2-position.png`, await page.screenshot({ animations: 'disabled' }))
        expect(errors).toEqual([])
      },
    )
  }
}
