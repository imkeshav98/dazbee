// The layer actions in Chromium: duplicate, the four order moves, ungroup and use as mask,
// from ⋯ More on the bar by the selection and from a right-click on a layer, each with its shortcut.
import type { DesignInput } from '@dazbee/schema'

import { screenPoint, writeOutput } from '../../support/editor.ts'
import { frameDesign } from '../../support/seed.ts'
import { openStage, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { closeBarMenu, moreAction, moreMenu, moreSubmenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const square = (name: string, index: string, x: number, color: string) => ({
  type: 'graphic' as const,
  parentId: 'sq',
  index,
  name,
  props: {
    x,
    y: 200,
    width: 300,
    height: 300,
    shape: { kind: 'rect' as const },
    fills: [{ type: 'solid' as const, color }],
  },
})

const design = (): DesignInput =>
  frameDesign({
    name: 'Layer actions',
    nodes: {
      a: square('A', 'a0', 100, '#FCA311FF'),
      b: square('B', 'a1', 300, '#14213DFF'),
      c: square('C', 'a2', 500, '#E0262BFF'),
    },
  })

type Nodes = Record<
  string,
  { parentId: string; index: string; type: string; name: string; props: Record<string, unknown> }
>
const nodes = (page: Page) => page.evaluate(() => window.dazbee?.design().nodes) as Promise<Nodes>
/** The square frame's top layers from back to front, by name. */
const order = async (page: Page) =>
  Object.values(await nodes(page))
    .filter((n) => n.parentId === 'sq')
    .sort((x, y) => (x.index < y.index ? -1 : 1))
    .map((n) => n.name)

test('one layer has its actions in the full menu and the right-click menu; several layers group from the small menu', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  const more = (name: string) => moreAction(page, name)

  // One layer's actions are in the full menu, the order in the menu beside Order, each with its shortcut.
  await selectLayers(page, ['a'])
  const menu = await moreMenu(page)
  await expect((await moreSubmenu(page, 'order')).getByRole('button', { name: 'Bring forward' })).toContainText(
    'Ctrl+]',
  )
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('arrange-actions-more.png', await page.screenshot())
  // Esc closes the menu beside, then the full menu.
  await closeBarMenu(page, 'more-order')
  await closeBarMenu(page, 'bar-more')
  await expect(menu).toBeHidden()

  await more('Bring to front')
  await expect.poll(() => order(page)).toEqual(['B', 'C', 'A'])
  await more('Send backward')
  await expect.poll(() => order(page)).toEqual(['B', 'A', 'C'])
  await more('Send to back')
  await expect.poll(() => order(page)).toEqual(['A', 'B', 'C'])
  await more('Bring forward')
  await expect.poll(() => order(page)).toEqual(['B', 'A', 'C'])

  await more('Duplicate')
  await expect.poll(async () => (await order(page)).length).toBe(4)
  await page.evaluate(() => window.dazbee?.perform('undo'))

  // Group two, then ungroup them, by their keys: neither is in a menu.
  await selectLayers(page, ['b', 'c'])
  await page.keyboard.press('Control+KeyG')
  await expect.poll(async () => Object.values(await nodes(page)).some((n) => n.type === 'group')).toBe(true)
  const group = Object.entries(await nodes(page)).find(([, n]) => n.type === 'group')?.[0] ?? ''
  await selectLayers(page, [group])
  await page.keyboard.press('Control+Shift+KeyG')
  await expect.poll(async () => Object.values(await nodes(page)).some((n) => n.type === 'group')).toBe(false)

  // A right-click on A picks it and opens the same actions: it becomes a mask.
  await selectLayers(page, [])
  const at = await screenPoint(page, 150, 350)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  const stageMenu = page.getByTestId('stage-menu')
  await expect(stageMenu).toBeVisible()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['a'])
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('arrange-actions-right-click.png', await page.screenshot())
  await moreAction(page, 'Use as mask', stageMenu)
  await expect.poll(async () => (await nodes(page)).a?.props.mask).toBe('alpha')
  await expect(stageMenu).toBeHidden()
  // A mask is not picked on the stage; ⋯ More, for the selection it still is, makes it plain again.
  await more('Use as mask')
  await expect.poll(async () => (await nodes(page)).a?.props.mask).toBeFalsy()
  expect(errors).toEqual([])
})
