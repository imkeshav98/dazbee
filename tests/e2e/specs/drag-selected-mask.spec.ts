// A press inside a selected layer drags it, with real input (#234): a mask, which isn't drawn, is
// picked in the layers panel and dragged on the stage; what it masks stays put; one undo step. A
// click there without a drag still picks the layer under the pointer.
import { expect, test, type Page } from '../support/test.ts'
import type { DesignInput } from '@dazbee/schema'
import { placed, screenPoint, writeOutput } from '../support/editor.ts'
import { openStage, press, read, selection } from '../support/stage.ts'

test.describe.configure({ timeout: 120_000 })

const design: DesignInput = {
  meta: { schemaVersion: 5, designId: 'replaced-by-the-api', name: 'Drag a mask', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    group: { type: 'group', parentId: 'p1', index: 'a0', name: 'Masked', props: { x: 200, y: 200, width: 400, height: 300 } },
    mask: { type: 'graphic', parentId: 'group', index: 'a0', name: 'Mask', props: { x: 200, y: 200, width: 400, height: 300, shape: { kind: 'ellipse' }, fills: [{ type: 'solid', color: '#000000FF' }], mask: 'alpha' } },
    photo: { type: 'graphic', parentId: 'group', index: 'a1', name: 'Photo', props: { x: 200, y: 200, width: 400, height: 300, shape: { kind: 'rect' }, fills: [{ type: 'solid', color: '#00A88AFF' }] } },
  },
  overrides: {},
}
const box = async (page: Page, id: string) => {
  const p = placed(await read(page), id, 'sq') as { x: number; y: number; width: number; height: number }
  return { x: p.x, y: p.y, width: p.width, height: p.height }
}
const row = (page: Page, name: string) => page.getByRole('tree').getByRole('treeitem').filter({ has: page.locator(`[data-testid="layer-name"]:text-is("${name}")`) })

test('a mask picked in the layers panel is dragged on the stage, and what it masks stays; a click there without a drag picks what is under the pointer', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  await page.locator('[data-panel="layers"]').click()
  if (!(await row(page, 'Mask').isVisible())) {
    await row(page, 'Masked').click()
    await page.keyboard.press('ArrowRight')
  }
  await row(page, 'Mask').click()
  expect(await selection(page)).toEqual(['mask'])
  // Pressed in its middle, where the photo it masks is drawn, and dragged 100 right and 50 down.
  const from = await screenPoint(page, 400, 350)
  const to = await screenPoint(page, 500, 400)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  await page.evaluate(() => window.dazbee?.drawn())
  expect(await box(page, 'mask')).toEqual({ x: 300, y: 250, width: 400, height: 300 })
  expect(await box(page, 'photo')).toEqual({ x: 200, y: 200, width: 400, height: 300 })
  expect(await selection(page)).toEqual(['mask'])
  writeOutput('drag-mask-1-moved.png', await page.screenshot())
  // One undo puts it back.
  await press(page, 'undo')
  expect(await box(page, 'mask')).toEqual({ x: 200, y: 200, width: 400, height: 300 })

  // A click there without a drag picks what is under the pointer.
  await page.evaluate(() => window.dazbee?.select(['mask'], 'p1', 'sq'))
  await page.evaluate(() => window.dazbee?.drawn())
  const at = await screenPoint(page, 400, 350)
  await page.mouse.click(at.x, at.y)
  await page.evaluate(() => window.dazbee?.drawn())
  // The group is what a click on the stage picks there; nothing moved.
  expect(await selection(page)).toEqual(['group'])
  expect(await box(page, 'mask')).toEqual({ x: 200, y: 200, width: 400, height: 300 })
  writeOutput('drag-mask-2-click.png', await page.screenshot())
  expect(errors).toEqual([])
})
