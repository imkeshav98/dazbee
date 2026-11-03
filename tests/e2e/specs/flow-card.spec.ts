// The In the stack card in Chromium, with real input: a child of an auto layout frame
// fills the room, fits its content or keeps its own size on each axis, and can be kept where it is put;
// the frame itself hugs its children. A layer outside any auto layout has no such card.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { writeOutput } from '../support/editor.ts'
import { barMenu, openStage, openCard } from '../support/stage.ts'
import { choose } from '../support/select.ts'

test.describe.configure({ timeout: 120_000 })

const chip = (name: string, index: string, x: number, color: string) => ({
  type: 'graphic' as const, parentId: 'stack', index, name,
  props: { x, y: 220, width: 160, height: 160, shape: { kind: 'rect' as const, cornerRadius: 16 }, fills: [{ type: 'solid' as const, color }] },
})

const design = (): DesignInput => ({
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Auto layout sizing', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    stack: {
      type: 'frame', parentId: 'p1', index: 'a0', name: 'Stack',
      props: { x: 80, y: 200, width: 920, height: 200, fills: [{ type: 'solid', color: '#F4EDE4FF' }], layout: { direction: 'row', gap: 20, padding: { top: 20, right: 20, bottom: 20, left: 20 } } },
    },
    one: chip('One', 'a0', 100, '#FCA311FF'),
    two: chip('Two', 'a1', 280, '#14213DFF'),
    loose: { type: 'graphic', parentId: 'p1', index: 'a1', name: 'Loose', props: { x: 80, y: 600, width: 200, height: 200, shape: { kind: 'ellipse' }, fills: [{ type: 'solid', color: '#E0262BFF' }] } },
  },
  overrides: {},
})

const boxOf = (page: Page, id: string) => page.evaluate((id) => window.dazbee?.boxOf(id), id) as Promise<{ x: number; y: number; width: number; height: number }>
const propsOf = (page: Page, id: string) => page.evaluate((id) => window.dazbee?.design().nodes[id]?.props, id) as Promise<Record<string, unknown>>
const select = async (page: Page, ids: string[]) => {
  await page.evaluate((ids) => window.dazbee?.select(ids), ids)
  await expect((await openCard(page, 'layout-card'))).toBeVisible()
}

test('a child of an auto layout fills, hugs or keeps its size, and can leave the flow', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const card = async () => (await openCard(page, 'flow-card'))

  // A layer out of any flow has no In the stack part in its Position panel.
  await select(page, ['loose'])
  await expect((await barMenu(page, 'position')).getByTestId('flow-card')).toHaveCount(0)
  await page.keyboard.press('Escape')

  await select(page, ['two'])
  const width = (await card()).getByRole('combobox', { name: 'Width sizing' })
  await expect((await card()).getByRole('heading')).toHaveText('In the stack')
  await expect(width).toHaveAttribute('data-value', 'fixed')
  await expect(width).toHaveText('Own size')
  await choose(width, 'fill')
  await expect.poll(() => propsOf(page, 'two')).toMatchObject({ sizing: { width: 'fill', height: 'fixed' } })
  // Filling the row, Two takes what One and the gap leave: 920 - 40 padding - 160 - 20.
  await expect.poll(async () => (await boxOf(page, 'two')).width).toBe(700)
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('flow-card-fill.png', await page.screenshot())

  const keep = (await card()).getByRole('switch', { name: 'Keep where I put it' })
  await keep.click()
  await expect(keep).toHaveAttribute('aria-checked', 'true')
  await expect.poll(async () => (await propsOf(page, 'two')).absolute).toBe(true)
  await keep.click()
  await expect.poll(async () => (await propsOf(page, 'two')).absolute).toBeUndefined()

  // The frame itself hugs its children, so it shrinks to them: its sizing is in the Stack card.
  await select(page, ['stack'])
  await expect((await card())).toHaveCount(0)
  await select(page, ['two'])
  await choose(width, 'fixed')
  await select(page, ['stack'])
  await choose((await openCard(page, 'auto-layout-card')).getByRole('combobox', { name: 'Width sizing' }), 'hug')
  await expect.poll(async () => (await propsOf(page, 'stack')).sizing).toEqual({ width: 'hug', height: 'fixed' })
  // 20 + 160 + 20 + 160 + 20.
  await expect.poll(async () => (await boxOf(page, 'stack')).width).toBe(380)
  expect(errors).toEqual([])
})
