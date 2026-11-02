// Controls for what the document already holds, with real input, each change one undo step: a
// boolean's operation changed in place, a mask's type, and a text's direction from ⋯ More.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { writeOutput } from '../support/editor.ts'
import { moreSubmenu, openStage, read } from '../support/stage.ts'

test.describe.configure({ timeout: 180_000 })

const solid = (color: string) => [{ type: 'solid' as const, color }]
const design = (): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Controls', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' }, st: { name: 'Story', width: 1080, height: 1920, order: 'a1' } },
  pages: { p1: { name: 'Cover', order: 'a0', fills: solid('#FFF8F0FF') }, p2: { name: 'Offer', order: 'a1', fills: solid('#1A1420FF') } },
  nodes: {
    combo: { type: 'boolean', parentId: 'p1', index: 'a0', name: 'Combo', props: { x: 80, y: 80, width: 400, height: 300, op: 'union', fills: solid('#E0157FFF') } },
    a: { type: 'graphic', parentId: 'combo', index: 'a0', name: 'A', props: { x: 80, y: 80, width: 300, height: 300, shape: { kind: 'ellipse' } } },
    b: { type: 'graphic', parentId: 'combo', index: 'a1', name: 'B', props: { x: 180, y: 80, width: 300, height: 300, shape: { kind: 'ellipse' } } },
    cutter: { type: 'graphic', parentId: 'p1', index: 'a2', name: 'Cutter', props: { x: 560, y: 80, width: 400, height: 300, mask: 'alpha', shape: { kind: 'rect', cornerRadius: 40 }, fills: [{ type: 'linear', from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, stops: [{ offset: 0, color: '#FFFFFFFF' }, { offset: 1, color: '#000000FF' }] }] } },
    under: { type: 'graphic', parentId: 'p1', index: 'a3', name: 'Masked', props: { x: 560, y: 80, width: 400, height: 300, shape: { kind: 'rect' }, fills: solid('#3D6BFFFF') } },
    words: { type: 'text', parentId: 'p1', index: 'a1', name: 'Words', props: { x: 80, y: 600, width: 900, height: 100, text: 'Cold brew 50%', style: { fontFamily: 'Noto Sans', fontSize: 72, color: '#1F2329FF' } } },
  },
  overrides: {},
})
/** A layer's values as the Square format shows them: a card's change goes to the format shown. */
const props = async (page: Page, id: string) => {
  const design = await read(page)
  return { ...design.nodes[id]?.props, ...design.overrides['format:sq']?.[id] } as Record<string, unknown>
}
const select = (page: Page, ids: string[]) => page.evaluate((ids) => window.dazbee?.select(ids), ids)
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')

test('a boolean\'s operation and a mask\'s type change in place, one undo step each', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['combo'])
  const combine = page.getByTestId('combine-card')
  for (const op of ['subtract', 'intersect', 'exclude', 'union']) {
    await combine.locator(`[data-value="${op}"]`).click()
    await expect.poll(async () => (await props(page, 'combo')).op).toBe(op)
  }
  await combine.locator('[data-value="subtract"]').click()
  await expect.poll(async () => (await props(page, 'combo')).op).toBe('subtract')
  // Every format has it.
  expect((await read(page)).nodes.combo?.props.op).toBe('subtract')
  // Still the one boolean, not a new one around it.
  expect(await page.evaluate(() => Object.values(window.dazbee?.design().nodes ?? {}).filter((n) => n.type === 'boolean').length)).toBe(1)
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('controls-combine.png', await page.screenshot())
  await page.mouse.click(5, 400)
  // One undo step each: back to union, then to exclude.
  await undo(page)
  await expect.poll(async () => (await props(page, 'combo')).op).toBe('union')
  await undo(page)
  await expect.poll(async () => (await props(page, 'combo')).op).toBe('exclude')

  await select(page, ['cutter'])
  const mask = page.getByTestId('mask-card')
  await expect(mask.locator('[data-value="alpha"]')).toHaveAttribute('aria-checked', 'true')
  await mask.locator('[data-value="luminance"]').click()
  await expect.poll(async () => (await props(page, 'cutter')).mask).toBe('luminance')
  // A mask is the same in every format.
  expect((await read(page)).overrides['format:sq']?.cutter?.mask).toBeUndefined()
  expect((await read(page)).nodes.cutter?.props.mask).toBe('luminance')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('controls-mask.png', await page.screenshot())
  await page.mouse.click(5, 400)
  await undo(page)
  await expect.poll(async () => (await props(page, 'cutter')).mask).toBe('alpha')
  expect(errors).toEqual([])
})

test('a text\'s direction from ⋯ More, one undo step', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await select(page, ['words'])
  const menu = await moreSubmenu(page, 'text-direction')
  await expect(menu.locator('[data-direction="auto"]')).toHaveAttribute('aria-pressed', 'true')
  await menu.locator('[data-direction="rtl"]').click()
  await expect.poll(async () => (await props(page, 'words')).direction).toBe('rtl')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('controls-direction.png', await page.screenshot())
  await select(page, ['words'])
  await expect((await moreSubmenu(page, 'text-direction')).locator('[data-direction="rtl"]')).toHaveAttribute('aria-pressed', 'true')
  expect((await read(page)).nodes.words?.props.direction).toBe('rtl')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await undo(page)
  await expect.poll(async () => (await props(page, 'words')).direction).toBe('auto')
  expect(errors).toEqual([])
})
