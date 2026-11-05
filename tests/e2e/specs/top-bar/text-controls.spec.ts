// A text's bar: one Text style ▾ that holds Bold, Italic, Underline and Strikethrough, of a fixed
// width, tinted while any style is on and named by the styles on; the Align ▾
// pop-up's three labelled rows, Align, Direction and Vertical; and
// the Align icon drawn where the text sits by its own direction, in an English app and in Arabic.
// Each by mouse and keyboard, one undo step.
import type { DesignInput } from '@dazbee/schema'

import { ALIGN_ROWS, barItems, control, CONTROLS, TEXT_STYLES } from '../../support/bar-homes.ts'
import { editorPath, setCookies } from '../../support/editor.ts'
import { layoutProblems, SCREEN_SIZES, wrapped } from '../../support/layout.ts'
import { frameDesign, seed } from '../../support/seed.ts'
import { openStage, perform, props, selectLayers } from '../../support/stage.ts'
import { type Browser, expect, type Page, test } from '../../support/test.ts'
import { barMenu, entered, PIECES, UNCUT } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

const text = (index: string, y: number, words: string, fontFamily: string) => ({
  type: 'text' as const,
  parentId: 'sq',
  index,
  name: words,
  props: {
    x: 80,
    y,
    width: 800,
    height: 120,
    boxMode: 'autoHeight' as const,
    text: words,
    style: { fontFamily, fontSize: 72, fontWeight: 400, color: '#111111FF' },
  },
})

/** A Latin headline and an Arabic one, each with the direction Auto. */
const design = (): DesignInput =>
  frameDesign({
    name: 'Text controls',
    fills: [{ type: 'solid', color: '#FFF8F0FF' }],
    nodes: {
      latin: text('a0', 80, 'Weekend sale', 'Noto Sans'),
      arabic: text('a1', 300, 'تخفيضات نهاية الأسبوع', 'Noto Naskh Arabic'),
    },
  })

/** The editor in Arabic, at 1280×760. */
async function openInArabic(browser: Browser) {
  const designId = await seed(design())
  const context = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  const page = await context.newPage()
  await setCookies(page, { locale: 'ar' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  return { page, errors }
}

/** A text layer's props as the design holds them. */
const textProps = async (page: Page, id: string) =>
  (await props(page, id)) as unknown as {
    style: Record<string, unknown>
    direction?: string
    align?: string
    verticalAlign?: string
  }

/** Undoes, then redoes, checking the value read goes back and comes again. */
async function undoRedo<T>(page: Page, value: () => Promise<T>, before: T, after: T) {
  await perform(page, 'undo')
  await expect.poll(value).toEqual(before)
  await perform(page, 'redo')
  await expect.poll(value).toEqual(after)
}

/**
 * Where the Align button's icon draws its lines, as it shows on screen: lines ending level on the
 * left are left-aligned, on the right right-aligned, on both justified, on neither centred. Read
 * from the icon's own outline, then mirrored when CSS flips it or anything around it.
 */
const alignIcon = (page: Page) =>
  page
    .getByTestId('bar-align')
    .locator('svg')
    .first()
    .evaluate((svg) => {
      // The outline's points, split into lines where a gap runs across the icon.
      const points: { x: number; y: number }[] = []
      for (const path of svg.querySelectorAll('path')) {
        const length = path.getTotalLength()
        for (let at = 0; at <= length; at += length / 800) points.push(path.getPointAtLength(at))
      }
      points.sort((a, b) => a.y - b.y)
      const lines: { min: number; max: number }[] = []
      let last = -Infinity
      for (const { x, y } of points) {
        if (y - last > 6) lines.push({ min: x, max: x })
        const line = lines.at(-1) as { min: number; max: number }
        line.min = Math.min(line.min, x)
        line.max = Math.max(line.max, x)
        last = y
      }
      const spread = (values: number[]) => Math.max(...values) - Math.min(...values)
      const [left, right] = [spread(lines.map((l) => l.min)) < 2, spread(lines.map((l) => l.max)) < 2]
      const drawn = left && right ? 'justify' : left ? 'left' : right ? 'right' : 'center'
      let flips = 0
      for (let el: Element | null = svg; el && el.tagName !== 'BUTTON'; el = el.parentElement) {
        const style = getComputedStyle(el)
        const scale = Number.parseFloat(style.scale.split(' ')[0] ?? '1')
        const matrix = style.transform === 'none' ? 1 : new DOMMatrix(style.transform).a
        if (scale < 0 !== matrix < 0) flips++
      }
      return flips % 2 === 0 ? drawn : drawn === 'left' ? 'right' : drawn === 'right' ? 'left' : drawn
    })

test('Text style ▾ is one button of a fixed width in place of the four toggles, plain with no style on and tinted with any, named by the styles on; its pop-up holds Bold, Italic, Underline and Strikethrough, each one undo step', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await page.setViewportSize({ width: 1280, height: 760 })
  await selectLayers(page, ['latin'], { bar: true })
  const items = await barItems(page)
  expect(items).toContain('text-style')
  for (const id of TEXT_STYLES) expect(items).not.toContain(id)
  const button = page.getByTestId('bar-text-style')
  await expect(button).toHaveAccessibleName('Text style')
  // The icon: B and I side by side over an underline, as the mock draws them.
  const icon = button.locator('svg').first()
  await expect(icon.locator('g[transform="translate(-30 -18) scale(0.86)"]')).toHaveCount(1)
  await expect(icon.locator('g[transform="translate(104 -18) scale(0.86)"]')).toHaveCount(1)
  await expect(icon.locator('rect[y="214"][width="208"][height="24"]')).toHaveCount(1)
  const look = () =>
    button.evaluate((el) => ({ width: el.getBoundingClientRect().width, tint: getComputedStyle(el).backgroundColor }))
  await page.mouse.move(2, 400)
  const plain = await look()
  expect(plain.tint).toBe('rgba(0, 0, 0, 0)')

  const menu = await barMenu(page, 'text-style')
  expect(await menu.locator('button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual(
    TEXT_STYLES.map((id) => CONTROLS[id].name),
  )
  const style = async () => (await textProps(page, 'latin')).style
  await control(menu, 'bold').click()
  await expect.poll(async () => (await style()).fontWeight).toBe(700)
  await expect(control(menu, 'bold')).toHaveAttribute('aria-pressed', 'true')
  await control(menu, 'italic').click()
  await expect.poll(async () => (await style()).fontStyle).toBe('italic')
  await expect(button).toHaveAccessibleName('Text style: Bold, Italic')
  await undoRedo(page, async () => (await style()).fontStyle ?? 'normal', 'normal', 'italic')
  await control(menu, 'underline').click()
  await control(menu, 'strikethrough').click()
  await expect(button).toHaveAccessibleName('Text style: Bold, Italic, Underline, Strikethrough')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await page.mouse.move(2, 400)
  const styled = await look()
  expect(styled.tint).not.toBe('rgba(0, 0, 0, 0)')
  expect(styled.width).toBe(plain.width)
  expect(errors).toEqual([])
})

test('by keyboard, Text style opens on Bold, Space turns it on, and Esc gives the focus back to the button', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await page.setViewportSize({ width: 1280, height: 760 })
  await selectLayers(page, ['latin'], { bar: true })
  const button = page.getByTestId('bar-text-style')
  await page.getByTestId('top-bar-row').locator('[data-bar-item]').first().focus()
  for (let i = 0; i < 10 && !(await button.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('ArrowRight')
  await expect(button).toBeFocused()
  await page.keyboard.press('Enter')
  const menu = page.getByTestId('bar-text-style-menu')
  await expect(control(menu, 'bold')).toBeFocused()
  await page.keyboard.press('Space')
  await expect.poll(async () => (await textProps(page, 'latin')).style.fontWeight).toBe(700)
  await page.keyboard.press('Tab')
  await expect(control(menu, 'italic')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(button).toBeFocused()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['latin'])
  expect(errors).toEqual([])
})

test('Align ▾ holds three labelled rows, Align, Direction and Vertical, in that order; each choice is one undo step, and text direction is nowhere else', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await page.setViewportSize({ width: 1280, height: 760 })
  await selectLayers(page, ['latin'], { bar: true })
  const menu = await barMenu(page, 'align')
  const rows = await menu.locator(ALIGN_ROWS.map((id) => CONTROLS[id].find).join(', ')).evaluateAll((els) =>
    els.map((el) => ({
      label: document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent,
      options: [...el.querySelectorAll('[role="radio"]')].map((one) => one.textContent),
    })),
  )
  expect(rows).toEqual([
    { label: 'Align', options: ['Start', 'Centre', 'End', 'Justify'] },
    { label: 'Direction', options: ['Auto', 'Left to right', 'Right to left'] },
    { label: 'Vertical', options: ['Top', 'Middle', 'Bottom'] },
  ])
  const latin = () => textProps(page, 'latin')
  await expect(control(menu, 'direction').getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true')
  await control(menu, 'direction').getByRole('radio', { name: 'Right to left' }).click()
  await expect.poll(async () => (await latin()).direction).toBe('rtl')
  await undoRedo(page, async () => (await latin()).direction ?? 'auto', 'auto', 'rtl')
  await control(menu, 'vertical').getByRole('radio', { name: 'Middle' }).click()
  await expect.poll(async () => (await latin()).verticalAlign).toBe('middle')
  await control(menu, 'align').getByRole('radio', { name: 'End' }).click()
  await expect.poll(async () => (await latin()).align).toBe('end')
  await undoRedo(page, async () => (await latin()).align ?? 'start', 'start', 'end')

  // By keyboard: the arrows move along a row's choices and set them.
  await control(menu, 'direction').getByRole('radio', { name: 'Right to left' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await latin()).direction).toBe('rtl')
  expect(errors).toEqual([])
})

test('in an English app the Align icon draws where the text sits: Start is on the left for Latin words and on the right for Arabic ones, and follows the Direction chosen', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await page.setViewportSize({ width: 1280, height: 760 })
  await selectLayers(page, ['latin'], { bar: true })
  expect(await alignIcon(page)).toBe('left')
  await selectLayers(page, ['arabic'], { bar: true })
  expect(await alignIcon(page)).toBe('right')
  const menu = await barMenu(page, 'align')
  await control(menu, 'direction').getByRole('radio', { name: 'Left to right' }).click()
  await expect.poll(() => alignIcon(page)).toBe('left')
  await control(menu, 'align').getByRole('radio', { name: 'End' }).click()
  await expect.poll(() => alignIcon(page)).toBe('right')
  await control(menu, 'align').getByRole('radio', { name: 'Centre' }).click()
  await expect.poll(() => alignIcon(page)).toBe('center')
  expect(errors).toEqual([])
})

test('in the app in Arabic the Align icon still draws where the text sits, and the pop-up reads in Arabic with its three rows', async ({
  browser,
}) => {
  const { page, errors } = await openInArabic(browser)
  await selectLayers(page, ['latin'], { bar: true })
  expect(await alignIcon(page)).toBe('left')
  // The reading sees a flip as the app's language once flipped icons: mirrored, it reads the other side.
  await page
    .getByTestId('bar-align')
    .locator('svg')
    .first()
    .evaluate((svg) => svg.setAttribute('style', 'scale: -1 1'))
  expect(await alignIcon(page)).toBe('right')
  await page
    .getByTestId('bar-align')
    .locator('svg')
    .first()
    .evaluate((svg) => svg.removeAttribute('style'))
  await selectLayers(page, ['arabic'], { bar: true })
  expect(await alignIcon(page)).toBe('right')
  const menu = await barMenu(page, 'align')
  await expect(menu.locator(ALIGN_ROWS.map((id) => CONTROLS[id].find).join(', '))).toHaveCount(3)
  // Its rows in Arabic fit whole, at each screen size.
  for (const [width, height] of SCREEN_SIZES) {
    await page.setViewportSize({ width, height })
    await barMenu(page, 'align')
    await entered(page.getByTestId('bar-align-menu'))
    expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT }), `${width}`).toEqual([])
    // Every choice lies whole inside its row's well and the pop-up.
    const outside = await page.getByTestId('bar-align-menu').evaluate((menu) => {
      const inside = (el: Element, box: DOMRect) => {
        const r = el.getBoundingClientRect()
        return r.left >= box.left - 0.5 && r.right <= box.right + 0.5
      }
      return [...menu.querySelectorAll('[role="radio"]')]
        .filter((radio) => {
          const well = radio.closest('[role="radiogroup"]')
          return !inside(radio, menu.getBoundingClientRect()) || !well || !inside(radio, well.getBoundingClientRect())
        })
        .map((radio) => radio.textContent)
    })
    expect(outside, `${width}`).toEqual([])
    expect(await wrapped(page), `${width}`).toEqual([])
  }
  await expect(page.getByTestId('bar-text-style')).toHaveAccessibleName('نمط النص')
  expect(errors).toEqual([])
})
