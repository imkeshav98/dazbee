// Every number input in the app, from the one list of them, in Chromium with a real mouse (a finger
// on the phone) and keyboard at the three screen sizes, in both themes: the first press selects the
// whole value, plainly, in the field's accent edge, so a digit typed replaces it; a press beside the
// digits of a field being typed in puts the caret at the end.
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

/**
 * Opens the design at a screen size in a theme and the number input, and gives its input, the field
 * around it and what shows its edge.
 */
async function openInput(
  browser: Browser,
  screen: FieldScreen,
  number: NumberInput,
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
  const input = await number.open(page)
  const field = input.locator('xpath=ancestor::*[@data-knob][1]')
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

/** The middle of the field, and the middle of its widest room beside the digits. */
async function pointsOf(field: Locator, input: Locator) {
  const [f, i] = [await field.boundingBox(), await input.boundingBox()]
  if (!f || !i) throw new Error('no number input on screen')
  const y = f.y + f.height / 2
  const [before, after] = [i.x - f.x, f.x + f.width - (i.x + i.width)]
  return {
    middle: { x: f.x + f.width / 2, y },
    beside: { x: before > after ? f.x + before / 2 : i.x + i.width + after / 2, y },
  }
}

for (const screen of FIELD_SCREENS) {
  const size = `${screen.width}×${screen.height}${screen.touch ? ' (touch)' : ''}`

  for (const number of NUMBER_INPUTS) {
    for (const theme of THEMES)
      test(`${size}, ${theme}, ${number.name}: the first press selects the whole value plainly, in the accent edge, and a digit typed replaces it`, async ({
        browser,
      }) => {
        const { page, errors, input, field, edge } = await openInput(browser, screen, number, { theme })
        await press(page, screen, (await pointsOf(field, input)).middle)
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

    test(`${size}, ${number.name}: a press beside the digits while it is typed in puts the caret at the end`, async ({
      browser,
    }) => {
      const { page, errors, input, field } = await openInput(browser, screen, number)
      await press(page, screen, (await pointsOf(field, input)).middle)
      await expect.poll(() => caretOf(input)).toMatchObject({ start: 0, end: number.value.length, focused: true })
      await press(page, screen, (await pointsOf(field, input)).beside)
      const end = number.value.length
      await expect.poll(() => caretOf(input)).toEqual({ value: number.value, start: end, end, focused: true })
      await page.keyboard.type('1')
      await expect(input).toHaveValue(`${number.value}1`)
      expect(errors).toEqual([])
    })
  }

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
          await press(page, screen, (await pointsOf(field, input)).middle)
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
        await press(page, screen, (await pointsOf(field, input)).middle)
        await page.keyboard.press('End')
        await page.keyboard.press('Tab')
        await page.keyboard.press('Shift+Tab')
        await expect.poll(() => caretOf(input)).toMatchObject({ value: '100', start: 0, end: 3 })
        await nextFrame(page)
        const file = `number-input-filled-${screen.width}-${theme}`
        writeOutput(`${file}.png`, await page.screenshot({ animations: 'disabled', caret: 'initial' }))
        const card = await page.locator('#edit-panel').getByTestId(FIELDS.opacity.card).boundingBox()
        if (!card) throw new Error('no Appearance on screen')
        const clip = { x: card.x - 12, y: card.y - 12, width: card.width + 24, height: card.height + 24 }
        writeOutput(`${file}-close.png`, await page.screenshot({ animations: 'disabled', caret: 'initial', clip }))
        expect(errors).toEqual([])
      },
    )
}
