// The layer actions in Chromium: duplicate, the four order moves, ungroup and use as mask,
// from ⋯ More on the bar by the selection and from a right-click on a layer, each with its shortcut.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { screenPoint, writeOutput } from '../support/editor.ts'
import { moreMenu, openStage } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

const square = (name: string, index: string, x: number, color: string) => ({
  type: 'graphic' as const, parentId: 'p1', index, name,
  props: { x, y: 200, width: 300, height: 300, shape: { kind: 'rect' as const }, fills: [{ type: 'solid' as const, color }] },
})

const design = (): DesignInput => ({
  meta: { schemaVersion: 3, designId: 'replaced-by-the-api', name: 'Layer actions', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: { a: square('A', 'a0', 100, '#FCA311FF'), b: square('B', 'a1', 300, '#14213DFF'), c: square('C', 'a2', 500, '#E0262BFF') },
  overrides: {},
})

type Nodes = Record<string, { parentId: string; index: string; type: string; name: string; props: Record<string, unknown> }>
const nodes = (page: Page) => page.evaluate(() => window.dazbee?.design().nodes) as Promise<Nodes>
/** The page's layers from back to front, by name. */
const order = async (page: Page) => Object.values(await nodes(page)).filter((n) => n.parentId === 'p1').sort((x, y) => (x.index < y.index ? -1 : 1)).map((n) => n.name)
const select = (page: Page, ids: string[]) => page.evaluate((ids) => window.dazbee?.select(ids), ids)

test('one layer has its actions in ⋯ More and the right-click menu; several layers group in the Arrange card', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const arrange = page.getByTestId('arrange')
  const more = async (name: string) => (await moreMenu(page)).getByRole('button', { name }).click()

  // One layer has no Arrange card: its actions are in ⋯ More, each with its shortcut.
  await select(page, ['a'])
  await expect(arrange).toHaveCount(0)
  const menu = await moreMenu(page)
  await expect(menu.getByRole('button', { name: 'Bring forward' })).toContainText('Ctrl+]')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('arrange-actions-more.png', await page.screenshot())
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  await more('Bring to front')
  await expect.poll(() => order(page)).toEqual(['B', 'C', 'A'])
  await more('Send backward')
  await expect.poll(() => order(page)).toEqual(['B', 'A', 'C'])
  await more('Send to back')
  await more('Bring forward')
  await expect.poll(() => order(page)).toEqual(['B', 'A', 'C'])

  await more('Duplicate')
  await expect.poll(async () => (await order(page)).length).toBe(4)
  await page.evaluate(() => window.dazbee?.perform('undo'))

  // Group two in the Arrange card, then ungroup them from ⋯ More.
  await select(page, ['b', 'c'])
  await arrange.getByRole('button', { name: 'Group', exact: true }).click()
  await expect.poll(async () => Object.values(await nodes(page)).some((n) => n.type === 'group')).toBe(true)
  const group = Object.entries(await nodes(page)).find(([, n]) => n.type === 'group')?.[0] ?? ''
  await select(page, [group])
  await more('Ungroup')
  await expect.poll(async () => Object.values(await nodes(page)).some((n) => n.type === 'group')).toBe(false)

  // A right-click on A picks it and opens the same actions: it becomes a mask.
  await select(page, [])
  const at = await screenPoint(page, 150, 350)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  const stageMenu = page.getByTestId('stage-menu')
  await expect(stageMenu).toBeVisible()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['a'])
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('arrange-actions-right-click.png', await page.screenshot())
  await stageMenu.getByRole('button', { name: 'Use as mask' }).click()
  await expect.poll(async () => (await nodes(page)).a?.props.mask).toBe('alpha')
  await expect(stageMenu).toBeHidden()
  // A mask is not picked on the stage; ⋯ More, for the selection it still is, makes it plain again.
  await more('Use as mask')
  await expect.poll(async () => (await nodes(page)).a?.props.mask).toBeFalsy()
  expect(errors).toEqual([])
})
