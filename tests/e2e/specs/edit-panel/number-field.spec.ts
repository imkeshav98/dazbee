// The number field every edit panel shares, in Chromium with a real mouse and keyboard at the three
// screen sizes (the phone's a touch screen), in both themes: the first click shows the whole value
// plainly selected, so a digit typed replaces it; a click left of the digits in a field being typed
// in puts the caret at the end; Rotate's ° stays outside what is typed; a field with a fill keeps
// the fill's edge under the pointer through a drag; Shift pressed mid-drag changes the speed without
// jumping the value; on a touch screen the fields are 44 px tall and 8 px apart.
import { decodePng, type Pixels, rgbaAt } from '@dazbee/pixels/pixels'
import { loadCanvasKit } from '@dazbee/renderer/node'

import { writeOutput } from '../../support/editor.ts'
import { openDesignIn, THEMES } from '../../support/glass.ts'
import { BOX, FIELD_SCREENS, FIELDS, type FieldScreen, numberFieldsDesign } from '../../support/number-fields.ts'
import { seed } from '../../support/seed.ts'
import { fitSettled, nextFrame, props, selectLayers } from '../../support/stage.ts'
import { type Browser, expect, type Locator, type Page, test } from '../../support/test.ts'
import { openCard } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

type Field = (typeof FIELDS)[keyof typeof FIELDS]
type Rgb = [number, number, number]

/** Where an input's caret or selection is, what it holds, and whether it has the focus. */
const caretOf = (input: Locator) =>
  input.evaluate((el: HTMLInputElement) => ({
    value: el.value,
    start: el.selectionStart,
    end: el.selectionEnd,
    focused: document.activeElement === el,
  }))

/** Where the fill's edge is on screen: the knob's start plus the fill's end, in its padding box. */
const fillEdge = (knob: Locator) =>
  knob.evaluate((el: HTMLElement) => {
    const style = getComputedStyle(el)
    const end = (parseFloat(style.getPropertyValue('--fill-from')) + parseFloat(style.getPropertyValue('--fill'))) / 100
    const box = el.getBoundingClientRect()
    return style.direction === 'rtl'
      ? box.right - el.clientLeft - end * el.clientWidth
      : box.left + el.clientLeft + end * el.clientWidth
  })

/** The commonest colour in a region of a picture, which over a field's flat fill is that fill. */
function commonest(shot: Pixels, x0: number, y0: number, x1: number, y1: number): Rgb {
  const counts = new Map<string, number>()
  for (let y = Math.round(y0); y < Math.round(y1); y++)
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      const key = rgbaAt(shot, x, y).slice(0, 3).join(',')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return (top?.[0] ?? '0,0,0').split(',').map(Number) as Rgb
}

/** WCAG 2.2's contrast ratio between two colours. */
function contrast(a: Rgb, b: Rgb) {
  const luminance = (rgb: Rgb) => {
    const [r, g, bl] = rgb.map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0)
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

/**
 * The colours a field with its whole value selected shows, as drawn: the selection behind the last
 * digit, the field's fill beside its label, and the digits' colour.
 */
async function selectionColours(knob: Locator, input: Locator) {
  const ck = await loadCanvasKit()
  const shot = decodePng(ck, new Uint8Array(await knob.screenshot({ animations: 'disabled' })))
  const [k, i] = [await knob.boundingBox(), await input.boundingBox()]
  if (!k || !i) throw new Error('no field on screen')
  const scale = shot.width / k.width
  const right = (i.x + i.width - k.x) * scale
  const top = (i.y - k.y) * scale
  const digit = (await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) * 0.6 * scale
  const selection = commonest(shot, right - digit, top + 2 * scale, right - scale, top + i.height * scale - 2 * scale)
  const field = commonest(shot, 2 * scale, (k.height / 2 - 2) * scale, 6 * scale, (k.height / 2 + 2) * scale)
  const digits = await input.evaluate((el) => getComputedStyle(el).color.match(/\d+/g)?.slice(0, 3).map(Number))
  return { selection, field, digits: digits as Rgb }
}

/** Presses the mouse at a point and moves it sideways by `by` px, 2 px at a time, as a hand would. */
async function pressAndMove(page: Page, at: { x: number; y: number }, by: number) {
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await moveBy(page, at, by)
}
async function moveBy(page: Page, from: { x: number; y: number }, by: number) {
  const steps = Math.max(1, Math.round(Math.abs(by) / 2))
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + (by * i) / steps, from.y)
}

/**
 * Opens the design at a screen size in a theme, the box selected and the card holding `field` open,
 * and gives the field's knob and input, scrolled into view.
 */
async function openField(
  browser: Browser,
  screen: FieldScreen,
  field: Field,
  { theme = 'dark', scale }: { theme?: (typeof THEMES)[number]; scale?: number } = {},
) {
  const designId = await seed(numberFieldsDesign())
  const { page, errors } = await openDesignIn(browser, designId, theme, {
    viewport: { width: screen.width, height: screen.height },
    hasTouch: screen.touch,
    isMobile: screen.touch,
    ...(scale ? { deviceScaleFactor: scale } : {}),
  })
  await fitSettled(page)
  await selectLayers(page, ['box'], { card: field.card })
  return { page, errors, ...(await fieldIn(page, field)) }
}
async function fieldIn(page: Page, field: Field) {
  const knob = (await openCard(page, field.card)).locator(`[data-scrub="${field.name}"]`)
  await knob.scrollIntoViewIfNeeded()
  return { knob, input: knob.getByRole('spinbutton') }
}
async function middleOf(knob: Locator) {
  const box = await knob.boundingBox()
  if (!box) throw new Error('no field on screen')
  return { ...box, x: box.x + box.width / 2, y: box.y + box.height / 2, left: box.x }
}

for (const screen of FIELD_SCREENS) {
  const size = `${screen.width}×${screen.height}${screen.touch ? ' (touch)' : ''}`

  for (const theme of THEMES) {
    test(`${size}, ${theme}: the first click shows the whole value plainly selected, and a digit typed replaces it`, async ({
      browser,
    }) => {
      const { page, errors, knob, input } = await openField(browser, screen, FIELDS.x, { theme })
      const at = await middleOf(knob)
      await page.mouse.click(at.x, at.y)
      await expect.poll(() => caretOf(input)).toEqual({ value: String(BOX.x), start: 0, end: 2, focused: true })
      // The selection is at least 3:1 against the field, the digits at least 4.5:1 on it.
      const drawn = await selectionColours(knob, input)
      expect(contrast(drawn.selection, drawn.field)).toBeGreaterThanOrEqual(3)
      expect(contrast(drawn.digits, drawn.selection)).toBeGreaterThanOrEqual(4.5)
      // Its edge is the accent while it is typed in, the pointer on it.
      await expect(knob).toHaveAttribute('data-typing', '')
      await page.keyboard.type('5')
      await expect(input).toHaveValue('5')
      await page.keyboard.press('Enter')
      await expect.poll(async () => (await props(page, 'box')).x).toBe(5)
      expect(errors).toEqual([])
    })
  }

  test(`${size}: a second click left of the digits puts the caret at the end`, async ({ browser }) => {
    const { page, errors, knob, input } = await openField(browser, screen, FIELDS.x)
    const at = await middleOf(knob)
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => caretOf(input)).toMatchObject({ start: 0, end: 2, focused: true })
    // Between the label and the digits, well clear of both.
    await page.mouse.click(at.left + at.width * 0.3, at.y)
    await expect.poll(() => caretOf(input)).toEqual({ value: String(BOX.x), start: 2, end: 2, focused: true })
    await page.keyboard.type('1')
    await expect(input).toHaveValue(`${BOX.x}1`)
    expect(errors).toEqual([])
  })

  test(`${size}: Rotate's ° stays outside what is typed, where it is`, async ({ browser }) => {
    const { page, errors, knob, input } = await openField(browser, screen, FIELDS.rotation)
    const degree = knob.locator(':scope > [aria-hidden]')
    await expect(degree).toHaveText('°')
    const before = await degree.boundingBox()
    const at = await middleOf(knob)
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => caretOf(input)).toEqual({ value: '0', start: 0, end: 1, focused: true })
    await page.keyboard.type('45')
    await expect(input).toHaveValue('45')
    expect(await degree.boundingBox()).toEqual(before)
    expect(errors).toEqual([])
  })

  test(`${size}: a field with a fill keeps the fill's edge under the pointer through a drag`, async ({ browser }) => {
    const { page, errors, knob } = await openField(browser, screen, FIELDS.opacity)
    const at = await middleOf(knob)
    const start = await fillEdge(knob)
    // The fill's edge sits at the value, a fifth of the way across.
    const width = await knob.evaluate((el) => el.clientWidth)
    expect(Math.abs(start - (at.left + 1 + width * BOX.opacity))).toBeLessThanOrEqual(1)
    // Within half a step of the pointer, a step being a hundredth of the fill's width, and the pixel it lands on.
    const near = width / 100 / 2 + 1
    const end = at.left + at.width * 0.9
    await page.mouse.move(start, at.y)
    await page.mouse.down()
    let x = start
    for (const part of [0.25, 0.5, 0.9]) {
      const to = start + (end - start) * part
      await moveBy(page, { x, y: at.y }, to - x)
      x = to
      await expect.poll(async () => Math.abs((await fillEdge(knob)) - x)).toBeLessThanOrEqual(near)
    }
    await page.mouse.up()
    expect(errors).toEqual([])
  })

  test(`${size}: Shift pressed and let go mid-drag changes the speed and never jumps the value`, async ({
    browser,
  }) => {
    const { page, errors, knob, input } = await openField(browser, screen, FIELDS.x)
    const at = await middleOf(knob)
    // 20 px at a step per 2 px.
    await pressAndMove(page, at, 20)
    await expect(input).toHaveValue(String(BOX.x + 10))
    await page.keyboard.down('Shift')
    await nextFrame(page)
    await expect(input).toHaveValue(String(BOX.x + 10))
    // With Shift, 2 px is one step of 10.
    await moveBy(page, { x: at.x + 20, y: at.y }, 2)
    await expect(input).toHaveValue(String(BOX.x + 20))
    await page.keyboard.up('Shift')
    await moveBy(page, { x: at.x + 22, y: at.y }, 2)
    await expect(input).toHaveValue(String(BOX.x + 21))
    await page.mouse.up()
    await expect.poll(async () => (await props(page, 'box')).x).toBe(BOX.x + 21)
    expect(errors).toEqual([])
  })

  if (screen.touch)
    test(`${size}: the fields are 44 px tall and 8 px apart`, async ({ browser }) => {
      const { page, errors } = await openField(browser, screen, FIELDS.x)
      const box = async (field: Field) => middleOf((await fieldIn(page, field)).knob)
      const [x, y] = [await box(FIELDS.x), await box(FIELDS.y)]
      expect([x.height, y.height]).toEqual([44, 44])
      expect(y.left - (x.left + x.width)).toBeCloseTo(8, 1)
      const rotation = await box(FIELDS.rotation)
      expect(rotation.y - rotation.height / 2 - (x.y + x.height / 2)).toBeCloseTo(8, 1)
      expect(errors).toEqual([])
    })

  for (const theme of THEMES)
    test(
      `screenshots at ${size} in ${theme}: selected, typing, hovering, and Rotate's °`,
      { tag: '@evidence' },
      async ({ browser }) => {
        const { page, errors, knob } = await openField(browser, screen, FIELDS.x, { theme, scale: 2 })
        // The whole screen, and Advanced close up, with the caret where the browser draws it.
        const shot = async (name: string) => {
          await nextFrame(page)
          const file = `number-field-${screen.width}-${theme}-${name}`
          writeOutput(`${file}.png`, await page.screenshot({ animations: 'disabled', caret: 'initial' }))
          const card = await page.locator('#edit-panel').getByTestId(FIELDS.x.card).boundingBox()
          if (!card) throw new Error('no Advanced on screen')
          const clip = { x: card.x - 12, y: card.y - 12, width: card.width + 24, height: card.height + 24 }
          writeOutput(`${file}-advanced.png`, await page.screenshot({ animations: 'disabled', caret: 'initial', clip }))
        }
        const at = await middleOf(knob)
        await page.mouse.click(at.x, at.y)
        await shot('1-selected')
        await page.keyboard.type('5')
        await shot('2-typing')
        // The pointer on Y, at rest, beside X being typed in.
        const y = await middleOf((await fieldIn(page, FIELDS.y)).knob)
        await page.mouse.move(y.x, y.y)
        await shot('3-hovering')
        await page.keyboard.press('Escape')
        await page.keyboard.press('Escape')
        const rotation = await fieldIn(page, FIELDS.rotation)
        const r = await middleOf(rotation.knob)
        await page.mouse.click(r.x, r.y)
        await expect(rotation.input).toBeFocused()
        await shot('4-rotate')
        expect(errors).toEqual([])
      },
    )
}
