// The layer actions in Chromium: duplicate, ungroup and use as mask from ⋯ More on the bar by the
// selection and from a right-click on a layer, and the four order moves from the top bar's
// Position, each with its shortcut in its tooltip.
import type { DesignInput } from '@dazbee/schema'

import { control, type ControlId } from '../../support/bar-homes.ts'
import { screenPoint, writeOutput } from '../../support/editor.ts'
import { frameDesign } from '../../support/seed.ts'
import { openStage, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu, closeBarMenu, moreAction } from '../../support/top-bar.ts'

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

test("one layer has its actions in the full menu and the right-click menu, and its order in the top bar's Position; several layers group from the small menu", async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  const more = (name: string) => moreAction(page, name)
  const sit = async (move: ControlId) => control(await barMenu(page, 'position'), move).click()

  // One layer's order is in the top bar's Position, each move with its shortcut in its tooltip.
  await selectLayers(page, ['a'])
  const position = await barMenu(page, 'position')
  await control(position, 'bringForward').hover()
  await expect(page.getByRole('tooltip')).toHaveText('Forward (Ctrl+])')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('arrange-actions-more.png', await page.screenshot())
  await closeBarMenu(page, 'bar-position')
  await expect(position).toBeHidden()

  await sit('bringToFront')
  await expect.poll(() => order(page)).toEqual(['B', 'C', 'A'])
  await sit('sendBackward')
  await expect.poll(() => order(page)).toEqual(['B', 'A', 'C'])
  await sit('sendToBack')
  await expect.poll(() => order(page)).toEqual(['A', 'B', 'C'])
  await sit('bringForward')
  await expect.poll(() => order(page)).toEqual(['B', 'A', 'C'])

  await more('Duplicate')
  await expect.poll(async () => (await order(page)).length).toBe(4)
  await page.evaluate(() => window.dazbee?.perform('undo'))

  // Group two by its key, as Put in a box is the menu's way to group; the group's ⋯ has Ungroup,
  // and its key ungroups too.
  await selectLayers(page, ['b', 'c'])
  await page.keyboard.press('Control+KeyG')
  await expect.poll(async () => Object.values(await nodes(page)).some((n) => n.type === 'group')).toBe(true)
  const group = Object.entries(await nodes(page)).find(([, n]) => n.type === 'group')?.[0] ?? ''
  await selectLayers(page, [group])
  await more('Ungroup')
  await expect.poll(async () => Object.values(await nodes(page)).some((n) => n.type === 'group')).toBe(false)
  await page.evaluate(() => window.dazbee?.perform('undo'))
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
