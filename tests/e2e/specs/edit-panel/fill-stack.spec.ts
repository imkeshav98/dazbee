// A layer's fills as a stack, with real pointer and keyboard input: the list shows the top coat
// first; + puts a see-through colour on top of a photo; its swatch turns it into a linear gradient
// whose stop is edited; a drag swaps the two; the eye hides one. The stage and a PNG export show the
// same, and the browser's export matches Node's to the pixel. And a gradient's stops under a finger
// on a phone: each a touch target, the nearer one picked where two touch areas overlap.
import { createHash } from 'node:crypto'

import { fixtureResources } from '@dazbee/pixels/pixels'
import { renderDesign } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { AssetLink, type DesignInput } from '@dazbee/schema'

import { api, photo, upload } from '../../support/assets.ts'
import { designOf, exportHashOf, screenPoint, writeOutput } from '../../support/editor.ts'
import { openSized } from '../../support/frames-on-canvas.ts'
import { frameDesign, newBrand, putKit } from '../../support/seed.ts'
import { click, openStage, press, read } from '../../support/stage.ts'
import {
  GRADIENT_STOPS,
  SWATCH_KIT,
  SWATCH_PANELS,
  type SwatchPanel,
  TOUCH_TARGET,
  touchOf,
} from '../../support/swatches.ts'
import { type Browser, expect, type Locator, type Page, test } from '../../support/test.ts'
import { barMenu, fillList, openCard, strokeList } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const design = (assetId: string): DesignInput =>
  frameDesign({
    name: 'Fill stack',
    fills: [{ type: 'solid', color: '#FFF8F0FF' }],
    nodes: {
      card: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a0',
        name: 'Card',
        props: {
          x: 540,
          y: 140,
          width: 440,
          height: 440,
          shape: { kind: 'rect', cornerRadius: 32 },
          fills: [{ type: 'image', assetId, fit: 'fill' }],
        },
      },
    },
  })

type Fill = { type: string; color?: string; visible?: boolean; stops?: { offset: number; color: string }[] }
const fillsOf = async (page: Page) => ((await read(page)).nodes.card?.props.fills ?? []) as Fill[]
/** One pixel of the stage, and of the PNG the editor exports, at a design pixel of the square. */
async function stageAndExport(page: Page, x: number, y: number) {
  const at = await screenPoint(page, x, y)
  await page.evaluate(() => window.dazbee?.drawn())
  // What the screen shows there: a one-pixel screenshot, decoded in the page.
  const shot = (
    await page.screenshot({
      clip: { x: Math.round(at.x), y: Math.round(at.y), width: 1, height: 1 },
      animations: 'disabled',
    })
  ).toString('base64')
  const stage = await page.evaluate(async (png) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    context?.drawImage(bitmap, 0, 0)
    return [...(context?.getImageData(0, 0, 1, 1).data ?? [])].slice(0, 3)
  }, shot)
  const exported = await page.evaluate(
    async ({ x, y }) => {
      const file = await window.dazbee?.exportFiles({ frameIds: ['sq'], type: 'png' })
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(file?.bytes ?? [])], { type: 'image/png' }))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')
      context?.drawImage(bitmap, 0, 0)
      return [...(context?.getImageData(x, y, 1, 1).data ?? [])].slice(0, 3)
    },
    { x, y },
  )
  return { stage, exported }
}

test('a gradient over a photo: added on top, a stop edited, the two reordered, one hidden; stage and export agree', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await click(page, 760, 360)
  const card = await fillList(page)

  // + puts a see-through colour on top; the list shows it first.
  // A photo's fills are in its Colour card, + in the card's header.
  await (await openCard(page, 'fill-card')).getByRole('button', { name: 'Add fill' }).click()
  await expect.poll(async () => (await fillsOf(page)).map((f) => f.type)).toEqual(['image', 'solid'])
  await expect(card.locator('[data-row="1"]')).toHaveAttribute('data-item', 'fills-1')
  await expect(card.locator('[data-row="1"] [data-paint]')).toHaveAttribute('data-paint', 'solid')

  // Its swatch turns it into a linear gradient, which keeps its colour as the first stop.
  await card.locator('[data-row="1"]').getByTestId('paint-swatch').click()
  const editor = page.getByTestId('paint-editor')
  await editor.getByRole('radio', { name: 'Line gradient' }).click()
  await expect.poll(async () => (await fillsOf(page))[1]?.type).toBe('linear')
  // The second stop: pink, half see-through.
  await editor.locator('[data-stop="1"]').click()
  await editor.getByRole('textbox', { name: 'Stop 2 hex' }).fill('FF2E7E')
  await editor.getByRole('textbox', { name: 'Stop 2 hex' }).press('Enter')
  await editor.getByRole('spinbutton', { name: 'Stop 2 opacity' }).fill('70')
  await editor.getByRole('spinbutton', { name: 'Stop 2 opacity' }).press('Enter')
  await expect.poll(async () => (await fillsOf(page))[1]?.stops?.[1]?.color).toBe('#FF2E7EB3')
  // A click on the bar adds a stop there.
  const bar = await editor.getByTestId('gradient-bar').boundingBox()
  if (!bar) throw new Error('no bar')
  await page.mouse.click(bar.x + bar.width * 0.5, bar.y + bar.height / 2)
  await expect.poll(async () => (await fillsOf(page))[1]?.stops?.length).toBe(3)
  // Dragging the new stop moves it, one undo step for the whole drag.
  const middle = await editor.locator('[data-stop="1"]').boundingBox()
  if (!middle) throw new Error('no stop')
  await page.mouse.move(middle.x + middle.width / 2, middle.y + middle.height / 2)
  await page.mouse.down()
  await page.mouse.move(bar.x + bar.width * 0.4, middle.y + middle.height / 2, { steps: 4 })
  await page.mouse.move(bar.x + bar.width * 0.3, middle.y + middle.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => (await fillsOf(page))[1]?.stops?.[1]?.offset).toBeCloseTo(0.3, 1)
  await press(page, 'undo')
  await expect.poll(async () => (await fillsOf(page))[1]?.stops?.[1]?.offset).toBe(0.5)
  await expect(editor.locator('[data-stop]')).toHaveCount(3)
  writeOutput('fill-stack-1-gradient-editor.png', await page.screenshot({ animations: 'disabled' }))
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()
  const over = await stageAndExport(page, 940, 540)
  for (let c = 0; c < 3; c++)
    expect(
      Math.abs((over.stage[c] ?? 0) - (over.exported[c] ?? 0)),
      `channel ${c}: ${over.stage} vs ${over.exported}`,
    ).toBeLessThanOrEqual(8)
  writeOutput('fill-stack-2-gradient-over-photo.png', await page.screenshot({ animations: 'disabled' }))

  // A drag of the photo's row onto the gradient's puts the photo on top.
  await card.scrollIntoViewIfNeeded()
  const from = await card.locator('[data-row="2"]').getByTestId('row-grip').boundingBox()
  const to = await card.locator('[data-row="1"]').boundingBox()
  if (!from || !to) throw new Error('no rows')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 4, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => (await fillsOf(page)).map((f) => f.type)).toEqual(['linear', 'image'])
  await expect(card.locator('[data-row="1"] [data-paint]')).toHaveAttribute('data-paint', 'image')
  writeOutput('fill-stack-3-reordered.png', await page.screenshot({ animations: 'disabled' }))
  // The grip's arrow keys move it back.
  await card.locator('[data-row="1"]').getByTestId('row-grip').press('ArrowDown')
  await expect.poll(async () => (await fillsOf(page)).map((f) => f.type)).toEqual(['image', 'linear'])

  // The eye hides the gradient without deleting it; the photo shows alone again.
  await card.locator('[data-row="1"]').getByTestId('paint-visible').click()
  await expect.poll(async () => (await fillsOf(page))[1]?.visible).toBe(false)
  await page.evaluate(() => window.dazbee?.drawn())
  const hidden = await stageAndExport(page, 940, 540)
  for (let c = 0; c < 3; c++)
    expect(Math.abs((hidden.stage[c] ?? 0) - (hidden.exported[c] ?? 0))).toBeLessThanOrEqual(8)
  expect(hidden.exported).not.toEqual(over.exported)
  writeOutput('fill-stack-4-hidden.png', await page.screenshot({ animations: 'disabled' }))

  // The browser's export and Node's are the same pixels.
  await card.locator('[data-row="1"]').getByTestId('paint-visible').click()
  await expect.poll(async () => (await fillsOf(page))[1]?.visible).toBeUndefined()
  const browserHash = await exportHashOf(page)
  const doc = JSON.parse(await designOf(page)) as DesignInput
  const link = AssetLink.parse(await api(`/assets/${asset.id}`))
  const stored = new Uint8Array(await (await fetch(link.url)).arrayBuffer())
  const ck = await loadCanvasKit()
  const node = renderDesign(ck, doc, 'sq', {
    ...fixtureResources(),
    images: { [asset.id]: stored },
  })
  expect(createHash('sha256').update(node.pixels).digest('hex')).toBe(browserHash)

  // Each change was one undo step: show, hide, the two moves, the stop added, the colour, the gradient, the add.
  for (let i = 0; i < 9; i++) await press(page, 'undo')
  expect(await fillsOf(page)).toEqual([{ type: 'image', assetId: asset.id, fit: 'fill', opacity: 1 }])
  expect(errors).toEqual([])
})

test('every fill row’s opacity reads its percent after its digits, the fill’s line clear of the % at 100%', async ({
  browser,
}) => {
  const brandId = await newBrand('e2e fill opacity')
  await putKit(brandId, SWATCH_KIT)
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 }, { brandId })
  const panel = await (SWATCH_PANELS[0] as SwatchPanel).open(page)
  // The first fill a line gradient, the second a solid colour, each at 100%.
  const picker = panel.getByTestId('colour-picker')
  await picker.getByRole('radio', { name: 'Line gradient' }).click()
  const opacities = panel.getByTestId('fill-list').locator('[data-scrub]')
  await expect(opacities).toHaveCount(2)
  for (const knob of await opacities.all()) {
    const read = await knob.evaluate((el) => {
      const input = el.querySelector('input') as HTMLInputElement
      const unit = [...el.querySelectorAll('span')].find((one) => one.textContent === '%')
      const [box, digits, sign] = [
        el.getBoundingClientRect(),
        input.getBoundingClientRect(),
        unit?.getBoundingClientRect(),
      ]
      const marker = getComputedStyle(el, '::after')
      const line = box.left + Number.parseFloat(marker.insetInlineStart) - Number.parseFloat(marker.width) / 2
      return {
        value: input.value,
        after: !!sign && sign.left >= digits.right - 1,
        clear: !el.hasAttribute('data-ranged') || line - (sign?.right ?? 0) >= 6,
      }
    })
    expect(read).toEqual({ value: '100', after: true, clear: true })
  }
  expect(errors).toEqual([])
})

test('a stroke takes the same paint editor: an angular stroke at an angle', async ({ browser }) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  await click(page, 760, 360)
  const stroke = await strokeList(page)
  // The photo's strokes are in its Outline panel, each list with its +.
  await stroke.getByRole('button', { name: 'Add outline' }).click()
  await stroke.locator('[data-row="1"]').getByTestId('paint-swatch').click()
  const editor = page.getByTestId('paint-editor')
  await editor.getByRole('radio', { name: 'Sweep gradient' }).click()
  await expect
    .poll(async () => ((await read(page)).nodes.card?.props.strokes as { paint: Fill }[])[0]?.paint.type)
    .toBe('angular')
  await editor.getByRole('spinbutton', { name: 'Gradient angle' }).fill('45')
  await editor.getByRole('spinbutton', { name: 'Gradient angle' }).press('Enter')
  await expect
    .poll(async () => ((await read(page)).nodes.card?.props.strokes as { paint: { angle?: number } }[])[0]?.paint.angle)
    .toBe(45)
  // Esc closes the paint editor, then the Outline popover.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('fill-stack-5-stroke.png', await page.screenshot({ animations: 'disabled' }))
  expect(errors).toEqual([])
})

test('a gradient stop removed while it is dragged ends the drag and its undo step, and moves no other stop', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, design(asset.id))
  // A colour on top of the photo, made a line gradient: its stops are the ones edited.
  await click(page, 760, 360)
  const card = await fillList(page)
  await (await openCard(page, 'fill-card')).getByRole('button', { name: 'Add fill' }).click()
  await expect.poll(async () => (await fillsOf(page)).map((f) => f.type)).toEqual(['image', 'solid'])
  await card.locator('[data-row="1"]').getByTestId('paint-swatch').click()
  const editor = page.getByTestId('paint-editor')
  await editor.getByRole('radio', { name: 'Line gradient' }).click()
  const offsets = async () => (await fillsOf(page))[1]?.stops?.map((s) => s.offset)
  const stops = async () => (await offsets())?.length
  // The bar draws the stops the design has a render later: they are measured once it shows them all.
  const shown = editor.locator('[data-stop]')
  const bar = await editor.getByTestId('gradient-bar').boundingBox()
  if (!bar) throw new Error('no bar')
  await page.mouse.click(bar.x + bar.width * 0.5, bar.y + bar.height / 2)
  await expect.poll(stops).toBe(3)
  await expect(shown).toHaveCount(3)

  // The middle stop is pressed and, while held, removed with Delete: the drag ends there, and the
  // pointer moving on along the bar moves the stop that took its place in the list no more.
  const middle = await editor.locator('[data-stop="1"]').boundingBox()
  if (!middle) throw new Error('no stop')
  await page.mouse.move(middle.x + middle.width / 2, middle.y + middle.height / 2)
  await page.mouse.down()
  await expect.poll(() => page.evaluate(() => window.dazbee?.gesturing())).toBe(true)
  await page.keyboard.press('Delete')
  await expect.poll(stops).toBe(2)
  await expect.poll(() => page.evaluate(() => window.dazbee?.gesturing())).toBe(false)
  const left = await offsets()
  await page.mouse.move(bar.x + bar.width * 0.2, middle.y + middle.height / 2, { steps: 4 })
  await page.mouse.up()
  expect(await offsets()).toEqual(left)
  await expect.poll(() => page.evaluate(() => window.dazbee?.gesturing())).toBe(false)

  // The last stop, with a third stop again, the pointer let go away from the bar. The bar is
  // measured again: the panel may have moved since.
  const now = await editor.getByTestId('gradient-bar').boundingBox()
  if (!now) throw new Error('no bar')
  await page.mouse.click(now.x + now.width * 0.5, now.y + now.height / 2)
  await expect.poll(stops).toBe(3)
  await expect(shown).toHaveCount(3)
  const last = await editor.locator('[data-stop="2"]').boundingBox()
  if (!last) throw new Error('no stop')
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2)
  await page.mouse.down()
  await expect.poll(() => page.evaluate(() => window.dazbee?.gesturing())).toBe(true)
  await page.keyboard.press('Delete')
  await expect.poll(stops).toBe(2)
  await page.mouse.move(5, 500)
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.dazbee?.gesturing())).toBe(false)
  expect(errors).toEqual([])
})

test.describe('found by QA', () => {
  /** A shape with a line gradient of four stops: one at each end, and two close together in the middle. */
  const gradient = (): DesignInput =>
    frameDesign({
      name: 'Gradient stops',
      nodes: {
        band: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a0',
          name: 'Band',
          props: {
            x: 140,
            y: 140,
            width: 800,
            height: 800,
            shape: { kind: 'rect' },
            fills: [
              {
                type: 'linear',
                from: { x: 0, y: 0.5 },
                to: { x: 1, y: 0.5 },
                stops: [
                  { offset: 0, color: '#FF3D6EFF' },
                  { offset: 0.45, color: '#2E9E5BFF' },
                  { offset: 0.55, color: '#3D9BFFFF' },
                  { offset: 1, color: '#FFC83DFF' },
                ],
              },
            ],
          },
        },
      },
    })
  const offsets = async (page: Page) =>
    ((await read(page)).nodes.band?.props.fills as Fill[] | undefined)?.[0]?.stops?.map((s) => s.offset)
  /** The middle of an element on screen. */
  async function middle(locator: Locator) {
    const box = await locator.boundingBox()
    if (!box) throw new Error('no box')
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  /** The band's Colour panel, with + showing its gradient's stops on their bar. */
  async function openStops(browser: Browser, viewport: { width: number; height: number }) {
    const { page, errors } = await openSized(browser, viewport, { input: gradient(), touch: viewport.width < 640 })
    await page.evaluate(() => window.dazbee?.select(['band']))
    const panel = await barMenu(page, 'colour')
    await panel.getByTestId('colour-pick').click()
    const bar = panel.getByTestId('gradient-bar')
    await bar.scrollIntoViewIfNeeded()
    await expect(panel.locator(GRADIENT_STOPS.selector)).toHaveCount(4)
    const stop = (i: number) => panel.locator(`[data-stop="${i}"]`)
    return { page, errors, bar, stop }
  }
  /** A finger pressed at one point, moved to another in steps, and lifted. */
  async function fingerDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    const touch = await page.context().newCDPSession(page)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
    for (let step = 1; step <= 8; step++) {
      const at = { x: from.x + ((to.x - from.x) * step) / 8, y: from.y + ((to.y - from.y) * step) / 8 }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] })
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await touch.detach()
  }

  test('on a phone each gradient stop takes a 44 px touch area, a press where two overlap picks the nearer stop, and a finger drags a stop from its touch area', async ({
    browser,
  }) => {
    const { page, errors, bar, stop } = await openStops(browser, { width: 390, height: 844 })
    // Each stop is drawn at its size, and a press lands on it across a touch target round it.
    for (const i of [0, 3]) {
      const drawn = await stop(i).boundingBox()
      expect(drawn?.width, `stop ${i + 1} drawn`).toBeCloseTo(GRADIENT_STOPS.size, 1)
      const touch = await touchOf(stop(i))
      expect(touch.pressable, `stop ${i + 1}: a press lands at each side`).toBe(true)
      expect(Math.min(touch.width, touch.height), `stop ${i + 1}: where a press lands`).toBeGreaterThanOrEqual(
        TOUCH_TARGET.size,
      )
    }

    // The middle two stops' touch areas overlap: a tap off both drawings picks the nearer one, and
    // adds no stop.
    const second = await middle(stop(1))
    const third = await middle(stop(2))
    const apart = third.x - second.x
    expect(apart, 'the middle stops are closer than a touch area').toBeLessThan(TOUCH_TARGET.size)
    await page.touchscreen.tap(second.x + apart * 0.4, second.y)
    await expect(stop(1)).toHaveAttribute('aria-pressed', 'true')
    await page.touchscreen.tap(second.x + apart * 0.6, second.y)
    await expect(stop(2)).toHaveAttribute('aria-pressed', 'true')
    expect(await offsets(page)).toEqual([0, 0.45, 0.55, 1])

    // A finger pressed in the last stop's touch area, off its drawing, drags it as far as it moves,
    // in one undo step.
    const box = await bar.boundingBox()
    if (!box) throw new Error('no bar')
    const last = await middle(stop(3))
    await fingerDrag(page, { x: last.x - 15, y: last.y }, { x: last.x - 55, y: last.y })
    await expect(stop(3)).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await offsets(page))?.length).toBe(4)
    const moved = (await offsets(page))?.[3] ?? 0
    expect(Math.abs(moved - (last.x - 40 - box.x) / box.width), 'the last stop moved with the finger').toBeLessThan(
      0.01,
    )
    await press(page, 'undo')
    await expect.poll(() => offsets(page)).toEqual([0, 0.45, 0.55, 1])

    // A tap on the bar away from every stop's touch area still adds a stop there.
    await page.touchscreen.tap(box.x + box.width * 0.25, last.y)
    await expect.poll(async () => (await offsets(page))?.length).toBe(5)
    expect(errors).toEqual([])
  })

  test('at 1280×760 a gradient stop takes no more than its drawing, and a click beside it adds a stop', async ({
    browser,
  }) => {
    const { page, errors, stop } = await openStops(browser, { width: 1280, height: 760 })
    const touch = await touchOf(stop(0))
    expect(touch.pressable).toBe(true)
    expect(touch.width).toBeCloseTo(GRADIENT_STOPS.size, 1)
    expect(touch.height).toBeCloseTo(GRADIENT_STOPS.size, 1)
    const second = await middle(stop(1))
    await page.mouse.click(second.x + 10, second.y)
    await expect.poll(async () => (await offsets(page))?.length).toBe(5)
    expect(errors).toEqual([])
  })
})
