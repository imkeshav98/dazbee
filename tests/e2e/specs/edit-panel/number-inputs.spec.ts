// Every number input in the app, from the one list of them, in Chromium with a real mouse (a finger
// on the phone) and keyboard at the three screen sizes, in both themes: the first press selects the
// whole value, plainly, in the field's accent edge, so a digit typed replaces it; a press just
// before the digits of a field being typed in puts the caret at the end; Esc throws away what was
// typed, then lets the field go; Arabic-Indic digits count as digits.
import { writeOutput } from '../../support/editor.ts'
import { openDesignIn, THEMES } from '../../support/glass.ts'
import {
  caretOf,
  contrast,
  FIELD_SCREENS,
  FIELDS,
  type FieldScreen,
  NUMBER_INPUTS,
  numberFieldsDesign,
  type NumberInput,
  selectionColours,
  TOUCH_ROWS,
} from '../../support/number-fields.ts'
import { seed } from '../../support/seed.ts'
import { fitSettled, nextFrame, selectLayers } from '../../support/stage.ts'
import { type Browser, expect, type Locator, type Page, test } from '../../support/test.ts'
import { openCard } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

/** Whether an element's edge is drawn in the accent, as the theme has it. */
const edgeIsAccent = (edge: Locator) =>
  edge.evaluate((el) => {
    const probe = document.createElement('i')
    probe.style.color = 'var(--accent)'
    document.body.append(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    return getComputedStyle(el).borderTopColor === accent
  })

/** Opens the design at a screen size in a theme. */
async function openScreen(
  browser: Browser,
  screen: FieldScreen,
  { theme = 'dark', scale }: { theme?: (typeof THEMES)[number]; scale?: number } = {},
) {
  const designId = await seed(numberFieldsDesign())
  const opened = await openDesignIn(browser, designId, theme, {
    viewport: { width: screen.width, height: screen.height },
    hasTouch: screen.touch,
    isMobile: screen.touch,
    ...(scale ? { deviceScaleFactor: scale } : {}),
  })
  await fitSettled(opened.page)
  return opened
}

/**
 * Opens the design at a screen size in a theme and the number input, and gives its input, the field
 * around it and what shows its edge.
 */
async function openInput(
  browser: Browser,
  screen: FieldScreen,
  number: NumberInput,
  look: { theme?: (typeof THEMES)[number]; scale?: number } = {},
) {
  const { page, errors } = await openScreen(browser, screen, look)
  const input = await number.open(page)
  const field = input.locator('xpath=ancestor::*[@data-knob][1]')
  // Brought into view as a person scrolls to a field: only when it is off screen.
  await field.scrollIntoViewIfNeeded()
  await expect(field).toBeVisible()
  return { page, errors, input, field, edge: number.edge?.(page) ?? field }
}

/** One of the shared field's fields, as a number input to open: the box selected, its card open. */
const fieldInput = (field: (typeof FIELDS)[keyof typeof FIELDS]): NumberInput => ({
  name: field.name,
  value: '',
  open: async (page) => {
    await selectLayers(page, ['box'], { card: field.card })
    const input = (await openCard(page, field.card)).getByRole('spinbutton', { name: field.name, exact: true })
    await input.scrollIntoViewIfNeeded()
    return input
  },
})

/** Presses a point as the screen takes it: a tap on a touch screen, else a click. */
async function press(page: Page, screen: FieldScreen, at: { x: number; y: number }) {
  if (screen.touch) await page.touchscreen.tap(at.x, at.y)
  else await page.mouse.click(at.x, at.y)
}

/**
 * The middle of the field, and a press just before the first digit drawn: 4 px with a mouse; 6 px
 * with a finger, a tap a phone's browser moves onto the input, or half way from the field's edge
 * where the room is narrower, as between the font size's − and its digits. The digits end at the
 * input's content edge, as wide as the text they draw.
 */
async function pointsOf(screen: FieldScreen, field: Locator, input: Locator) {
  const f = await field.boundingBox()
  if (!f) throw new Error('no number input on screen')
  const first = await input.evaluate((el: HTMLInputElement) => {
    const probe = document.createElement('canvas').getContext('2d')
    if (!probe) throw new Error('no canvas')
    const style = getComputedStyle(el)
    probe.font = `${style.fontSize} ${style.fontFamily}`
    const box = el.getBoundingClientRect()
    return (
      box.right -
      parseFloat(style.paddingRight) -
      parseFloat(style.borderRightWidth) -
      probe.measureText(el.value).width
    )
  })
  const y = f.y + f.height / 2
  const beside = screen.touch ? Math.max(first - 6, (f.x + first) / 2) : first - 4
  return { middle: { x: f.x + f.width / 2, y }, beside: { x: beside, y } }
}

for (const screen of FIELD_SCREENS) {
  const size = `${screen.width}×${screen.height}${screen.touch ? ' (touch)' : ''}`

  for (const number of NUMBER_INPUTS) {
    for (const theme of THEMES)
      test(`${size}, ${theme}, ${number.name}: the first press selects the whole value plainly, in the accent edge, and a digit typed replaces it`, async ({
        browser,
      }) => {
        const { page, errors, input, field, edge } = await openInput(browser, screen, number, { theme })
        await press(page, screen, (await pointsOf(screen, field, input)).middle)
        await expect
          .poll(() => caretOf(input))
          .toEqual({ value: number.value, start: 0, end: number.value.length, focused: true })
        // The selection is at least 3:1 against the field, the digits at least 4.5:1 on it.
        const drawn = await selectionColours(field, input)
        expect(contrast(drawn.selection, drawn.field)).toBeGreaterThanOrEqual(3)
        expect(contrast(drawn.digits, drawn.selection)).toBeGreaterThanOrEqual(4.5)
        await expect.poll(() => edgeIsAccent(edge)).toBe(true)
        await page.keyboard.type('7')
        await expect(input).toHaveValue('7')
        expect(errors).toEqual([])
      })

    test(`${size}, ${number.name}: a press just before the digits while it is typed in puts the caret at the end`, async ({
      browser,
    }) => {
      const { page, errors, input, field } = await openInput(browser, screen, number)
      await press(page, screen, (await pointsOf(screen, field, input)).middle)
      await expect.poll(() => caretOf(input)).toMatchObject({ start: 0, end: number.value.length, focused: true })
      await press(page, screen, (await pointsOf(screen, field, input)).beside)
      const end = number.value.length
      await expect.poll(() => caretOf(input)).toEqual({ value: number.value, start: end, end, focused: true })
      await page.keyboard.type('1')
      await expect(input).toHaveValue(`${number.value}1`)
      expect(errors).toEqual([])
    })

    test(`${size}, ${number.name}: Esc throws away what was typed and keeps the field, its value selected; the next Esc lets it go`, async ({
      browser,
    }) => {
      const { page, errors, input, field } = await openInput(browser, screen, number)
      const name = await input.getAttribute('aria-label')
      await press(page, screen, (await pointsOf(screen, field, input)).middle)
      await expect.poll(() => caretOf(input)).toMatchObject({ start: 0, end: number.value.length, focused: true })
      await page.keyboard.type('5')
      await expect(input).toHaveValue('5')
      await page.keyboard.press('Escape')
      await expect
        .poll(() => caretOf(input))
        .toEqual({ value: number.value, start: 0, end: number.value.length, focused: true })
      await page.keyboard.press('Escape')
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null))
        .not.toBe(name)
      expect(errors).toEqual([])
    })

    if (number.stored)
      test(`${size}, ${number.name}: Arabic-Indic digits typed are digits`, async ({ browser }) => {
        const { page, errors, input, field } = await openInput(browser, screen, number)
        await press(page, screen, (await pointsOf(screen, field, input)).middle)
        await expect.poll(() => caretOf(input)).toMatchObject({ start: 0, end: number.value.length, focused: true })
        await page.keyboard.type('١٢')
        await page.keyboard.press('Enter')
        await expect.poll(() => number.stored?.(page)).toBe(12)
        expect(errors).toEqual([])
      })
  }

  if (screen.touch)
    for (const row of TOUCH_ROWS)
      test(`${size}: ${row.name} are 44 px tall and 8 px apart, as every field on a touch screen`, async ({
        browser,
      }) => {
        const { page, errors } = await openScreen(browser, screen)
        const controls = await row.open(page)
        await controls[0]?.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        const boxes = await Promise.all(controls.map((control) => control.boundingBox()))
        for (const box of boxes) expect(box?.height).toBeCloseTo(44, 0)
        for (let i = 1; i < boxes.length; i++) {
          const [before, at] = [boxes[i - 1], boxes[i]]
          if (!before || !at) throw new Error('no field on screen')
          expect(at.x - (before.x + before.width)).toBeCloseTo(8, 0)
        }
        expect(errors).toEqual([])
      })

  for (const theme of THEMES)
    test(
      `screenshots at ${size} in ${theme}: each number input selected and typed into, and a field with a fill selected`,
      { tag: '@evidence' },
      async ({ browser }) => {
        for (const number of NUMBER_INPUTS.filter((n) => n.name !== 'X position')) {
          const { page, errors, input, field, edge } = await openInput(browser, screen, number, { theme, scale: 2 })
          const slug = number.name.replace(/[^a-z]+/gi, '-').toLowerCase()
          const shot = async (name: string) => {
            await nextFrame(page)
            const file = `number-input-${slug}-${screen.width}-${theme}-${name}`
            writeOutput(`${file}.png`, await page.screenshot({ animations: 'disabled', caret: 'initial' }))
            const at = await edge.boundingBox()
            if (!at) throw new Error('no number input on screen')
            const clip = { x: at.x - 40, y: at.y - 24, width: at.width + 80, height: at.height + 48 }
            writeOutput(`${file}-close.png`, await page.screenshot({ animations: 'disabled', caret: 'initial', clip }))
          }
          await press(page, screen, (await pointsOf(screen, field, input)).middle)
          await shot('1-selected')
          await page.keyboard.type('7')
          await shot('2-typing')
          expect(errors).toEqual([])
          await page.context().close()
        }
        // Opacity filled to its end, its whole value selected over the fill.
        const { page, errors, input, field } = await openInput(browser, screen, fieldInput(FIELDS.opacity), {
          theme,
          scale: 2,
        })
        await press(page, screen, (await pointsOf(screen, field, input)).middle)
        await page.keyboard.press('End')
        await page.keyboard.press('Tab')
        await page.keyboard.press('Shift+Tab')
        await expect.poll(() => caretOf(input)).toMatchObject({ value: '100', start: 0, end: 3 })
        await nextFrame(page)
        const file = `number-input-filled-${screen.width}-${theme}`
        writeOutput(`${file}.png`, await page.screenshot({ animations: 'disabled', caret: 'initial' }))
        const card = await (await openCard(page, FIELDS.opacity.card)).boundingBox()
        if (!card) throw new Error('no Appearance on screen')
        const clip = { x: card.x - 12, y: card.y - 12, width: card.width + 24, height: card.height + 24 }
        writeOutput(`${file}-close.png`, await page.screenshot({ animations: 'disabled', caret: 'initial', clip }))
        expect(errors).toEqual([])
      },
    )
}
