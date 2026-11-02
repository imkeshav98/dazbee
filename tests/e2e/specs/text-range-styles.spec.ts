// A selected range of text styled from the bar with real input: one word made pink, larger and
// another font while the rest keeps its style, each change one undo step; bold and italic across
// an Arabic and Latin boundary; the bar stays by the text while a range is selected.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { writeOutput } from '../support/editor.ts'
import { barMenu, openStage, read } from '../support/stage.ts'

test.describe.configure({ timeout: 180_000 })

const design = (): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Range styles', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFF8F0FF' }] } },
  nodes: {
    body: {
      type: 'text', parentId: 'p1', index: 'a0', name: 'Body',
      props: { x: 80, y: 100, width: 920, height: 90, text: 'Fresh roast every morning', style: { fontFamily: 'Noto Sans', fontSize: 64, color: '#1F2329FF' } },
    },
    mixed: {
      type: 'text', parentId: 'p1', index: 'a1', name: 'Mixed',
      props: { x: 80, y: 400, width: 920, height: 130, text: 'خصم Razzlr اليوم', style: { fontFamily: 'Noto Naskh Arabic', fontSize: 80, color: '#1F2329FF' } },
    },
  },
  overrides: {},
})

type Run = { start: number; end: number; style: Record<string, unknown> }
const textProps = async (page: Page, id: string) => (await read(page)).nodes[id]?.props as { style: Record<string, unknown>; runs: Run[] }
/** The style a run over exactly `start` to `end` gives, or {} when none does. */
const runOver = async (page: Page, id: string, start: number, end: number) =>
  Object.assign({}, ...(await textProps(page, id)).runs.filter((r) => r.start <= start && r.end >= end).map((r) => r.style)) as Record<string, unknown>
const drawn = (page: Page) => page.evaluate(() => window.dazbee?.drawn())
const at = (page: Page, x: number, y: number) => page.evaluate(({ x, y }) => window.dazbee?.screenPoint(x, y), { x, y }) as Promise<{ x: number; y: number }>
async function dblclick(page: Page, x: number, y: number) {
  const p = await at(page, x, y)
  await page.mouse.dblclick(p.x, p.y)
  await drawn(page)
}
const undo = (page: Page) => page.evaluate(() => window.dazbee?.perform('undo'))
/**
 * Closes the bar's popover `bar-<id>` with Esc and waits for the focus to be back on its button,
 * which happens a moment after it closes: a popover opened before then would lose the focus and close.
 */
async function closeMenu(page: Page, id: string) {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId(`bar-${id}-menu`)).toBeHidden()
  await expect(page.getByTestId(`bar-${id}`)).toBeFocused()
}

test('one word made pink, larger and another font from the bar; the rest keeps its style; each one undo step', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const base = (await textProps(page, 'body')).style
  // Into the text, then a double click on "roast" selects it: offsets 6 to 11.
  await dblclick(page, 300, 140)
  await dblclick(page, 300, 140)
  await expect.poll(() => page.evaluate(() => window.dazbee?.textSelection())).toMatchObject({ id: 'body', range: { start: 6, end: 11 } })
  const bar = page.getByTestId('selection-bar')
  await expect(bar).toBeVisible()

  const colour = await barMenu(page, 'colour')
  await colour.getByRole('textbox', { name: 'Text colour hex' }).fill('ff48b0')
  await colour.getByRole('textbox', { name: 'Text colour hex' }).press('Enter')
  await expect.poll(() => runOver(page, 'body', 6, 11)).toMatchObject({ color: '#FF48B0FF' })
  await closeMenu(page, 'colour')

  const size = await barMenu(page, 'size')
  await size.getByRole('spinbutton', { name: 'Size' }).fill('96')
  await size.getByRole('spinbutton', { name: 'Size' }).press('Enter')
  await expect.poll(() => runOver(page, 'body', 6, 11)).toMatchObject({ color: '#FF48B0FF', fontSize: 96 })
  await closeMenu(page, 'size')

  // A built-in family, whose files the editor has already.
  await barMenu(page, 'font')
  await page.getByRole('listbox', { name: 'Font' }).getByRole('group', { name: 'Built in' }).getByRole('option', { name: 'Noto Sans Devanagari' }).click()
  await expect.poll(() => runOver(page, 'body', 6, 11), { timeout: 20_000 }).toMatchObject({ color: '#FF48B0FF', fontSize: 96, fontFamily: 'Noto Sans Devanagari' })
  await drawn(page)
  writeOutput('range-styles-1-word.png', await page.screenshot())

  // The rest of the text and the layer's own style are as they were.
  const after = await textProps(page, 'body')
  expect(after.style).toEqual(base)
  for (const run of after.runs) {
    expect(run.start, JSON.stringify(run)).toBeGreaterThanOrEqual(6)
    expect(run.end, JSON.stringify(run)).toBeLessThanOrEqual(11)
  }
  // Each change is one undo step: the font goes, then the size, then the colour.
  await undo(page)
  await expect.poll(() => runOver(page, 'body', 6, 11)).not.toHaveProperty('fontFamily')
  expect(await runOver(page, 'body', 6, 11)).toMatchObject({ fontSize: 96, color: '#FF48B0FF' })
  await undo(page)
  await expect.poll(() => runOver(page, 'body', 6, 11)).not.toHaveProperty('fontSize')
  expect(await runOver(page, 'body', 6, 11)).toMatchObject({ color: '#FF48B0FF' })
  await undo(page)
  await expect.poll(async () => (await textProps(page, 'body')).runs).toEqual([])
  expect(errors).toEqual([])
})

test('bold and italic across an Arabic and Latin boundary, from the bar', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await dblclick(page, 500, 460)
  // From after "خص" across "م " into "Raz": offsets 2 to 7.
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight')
  await drawn(page)
  await expect.poll(() => page.evaluate(() => window.dazbee?.textSelection())).toMatchObject({ id: 'mixed', range: { start: 2, end: 7 } })
  const bar = page.getByTestId('selection-bar')
  await bar.getByTestId('bar-bold').click()
  await expect.poll(() => runOver(page, 'mixed', 2, 7)).toMatchObject({ fontWeight: 700 })
  await expect(bar.getByTestId('bar-bold')).toHaveAttribute('aria-pressed', 'true')
  await bar.getByTestId('bar-italic').click()
  await expect.poll(() => runOver(page, 'mixed', 2, 7)).toMatchObject({ fontWeight: 700, fontStyle: 'italic' })
  await expect(bar.getByTestId('bar-italic')).toHaveAttribute('aria-pressed', 'true')
  const props = await textProps(page, 'mixed')
  expect(props.style).toMatchObject({ fontStyle: 'normal' })
  for (const run of props.runs) expect([run.start, run.end]).toEqual([2, 7])
  // A colour across the boundary too.
  const colour = await barMenu(page, 'colour')
  await colour.getByRole('textbox', { name: 'Text colour hex' }).fill('e0157f')
  await colour.getByRole('textbox', { name: 'Text colour hex' }).press('Enter')
  await expect.poll(() => runOver(page, 'mixed', 2, 7)).toMatchObject({ fontWeight: 700, fontStyle: 'italic', color: '#E0157FFF' })
  await page.keyboard.press('Escape')
  await drawn(page)
  writeOutput('range-styles-2-mixed.png', await page.screenshot())
  // Typing after the styling is a step of its own: Ctrl+Z takes the typing back, then the colour.
  await dblclick(page, 500, 460)
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('!')
  await expect.poll(async () => ((await read(page)).nodes.mixed?.props as { text: string }).text).toBe('خصم Razzlr اليوم!')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(async () => ((await read(page)).nodes.mixed?.props as { text: string }).text).toBe('خصم Razzlr اليوم')
  expect(await runOver(page, 'mixed', 2, 7)).toMatchObject({ color: '#E0157FFF' })
  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(() => runOver(page, 'mixed', 2, 7)).not.toHaveProperty('color')
  expect(await runOver(page, 'mixed', 2, 7)).toMatchObject({ fontStyle: 'italic' })
  expect(errors).toEqual([])
})

test('italic on the bar sets a whole text layer, and turns off again', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await page.evaluate(() => window.dazbee?.select(['body']))
  const italic = page.getByTestId('selection-bar').getByTestId('bar-italic')
  await italic.click()
  await expect.poll(async () => (await textProps(page, 'body')).style.fontStyle).toBe('italic')
  await expect(italic).toHaveAttribute('aria-pressed', 'true')
  await italic.click()
  await expect.poll(async () => (await textProps(page, 'body')).style.fontStyle).toBe('normal')
  expect(errors).toEqual([])
})
