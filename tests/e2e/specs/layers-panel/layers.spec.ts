// The layers panel (#59) in Chromium, with the real mouse: the tree in step with the stage's
// selection both ways, a layer dragged into a group (the stage redraws it there, one undo step,
// which redo brings back), rename, lock and hide, all there after a reload.
import { reloads, writeOutput } from '../../support/editor.ts'
import { colourAt, layersDesign, listed, node, openLayers, ROW, row, tree } from '../../support/layers-panel.ts'
import { click, openStage } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

test('the panel and the stage select together; drag into a group, rename, lock and hide', async ({ browser }) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  expect(await listed(page)).toEqual(['Dot', 'Box', 'Card', 'Backdrop'])
  await expect(row(page, 'Card')).toHaveAttribute('aria-expanded', 'false')

  // Select in the panel: the stage selects. Select on the stage: the panel follows.
  await row(page, 'Dot').click()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['dot'])
  await expect(row(page, 'Dot')).toHaveAttribute('aria-selected', 'true')
  await click(page, 480, 380)
  await expect(row(page, 'Box')).toHaveAttribute('aria-selected', 'true')
  await expect(row(page, 'Dot')).toHaveAttribute('aria-selected', 'false')
  // A layer inside a group selected on the stage opens its group in the panel.
  await page.evaluate(() => window.dazbee?.select(['c2']))
  await expect(row(page, 'Card')).toHaveAttribute('aria-expanded', 'true')
  await expect(row(page, 'Card stripe')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => listed(page)).toEqual(['Dot', 'Box', 'Card', '  Card stripe', '  Card back', 'Backdrop'])
  writeOutput('layers-0-tree.png', await page.screenshot())

  // Drag Dot onto the middle of Card: it goes inside, on top, and the group grows to hold it.
  const before = await page.evaluate(() => window.dazbee?.boxOf('card'))
  const target = await row(page, 'Card').boundingBox()
  await row(page, 'Dot').dragTo(row(page, 'Card'), { targetPosition: { x: 60, y: (target?.height ?? ROW) / 2 } })
  await expect.poll(async () => (await node(page, 'dot')).parentId).toBe('card')
  await expect.poll(() => listed(page)).toEqual(['Box', 'Card', '  Dot', '  Card stripe', '  Card back', 'Backdrop'])
  const after = await page.evaluate(() => window.dazbee?.boxOf('card'))
  expect(after).toEqual({ x: 120, y: 620, width: 780, height: 300 })
  expect(before).toEqual({ x: 120, y: 620, width: 520, height: 300 })
  // The stage redraws the group with the dot in it: selecting the group, its box takes in the dot.
  await row(page, 'Card').click()
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('layers-1-dragged-into-group.png', await page.screenshot())
  // Dot drawn where it was: moving it in changed only where it sits in the tree.
  expect(await colourAt(page, 800, 780)).toEqual([31, 157, 85])
  // One undo puts it back; redo puts it in again, and the panel follows both.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await node(page, 'dot')).parentId).toBe('p1')
  expect(await page.evaluate(() => window.dazbee?.boxOf('card'))).toEqual(before)
  await page.evaluate(() => window.dazbee?.perform('redo'))
  await expect.soft.poll(async () => (await node(page, 'dot')).parentId).toBe('card')
  await expect.soft
    .poll(() => listed(page))
    .toEqual(['Box', 'Card', '  Dot', '  Card stripe', '  Card back', 'Backdrop'])
  expect.soft(await page.evaluate(() => window.dazbee?.boxOf('card'))).toEqual(after)
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await node(page, 'dot')).parentId).toBe('p1')

  // Drag Backdrop above Box: reordered among its siblings.
  const box = await row(page, 'Box').boundingBox()
  await row(page, 'Backdrop').dragTo(row(page, 'Box'), { targetPosition: { x: 60, y: 3 } })
  await expect.poll(() => listed(page)).toEqual(['Dot', 'Backdrop', 'Box', 'Card', '  Card stripe', '  Card back'])
  expect(box).not.toBeNull()
  // The backdrop now covers the box: the stage draws it on top.
  expect(await colourAt(page, 300, 200)).toEqual([244, 237, 228])
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(() => listed(page)).toEqual(['Dot', 'Box', 'Card', '  Card stripe', '  Card back', 'Backdrop'])
  // Redo puts the backdrop above the box again.
  await page.evaluate(() => window.dazbee?.perform('redo'))
  await expect.soft.poll(() => listed(page)).toEqual(['Dot', 'Backdrop', 'Box', 'Card', '  Card stripe', '  Card back'])
  expect.soft(await colourAt(page, 300, 200)).toEqual([244, 237, 228])
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(() => listed(page)).toEqual(['Dot', 'Box', 'Card', '  Card stripe', '  Card back', 'Backdrop'])

  // Rename with a double-click.
  await row(page, 'Box').dblclick()
  const field = tree(page).getByRole('textbox', { name: 'Name of Box' })
  await expect(field).toBeFocused()
  await field.fill('Hero panel')
  writeOutput('layers-2-rename.png', await page.screenshot())
  await field.press('Enter')
  await expect.poll(async () => (await node(page, 'box')).name).toBe('Hero panel')
  await expect(row(page, 'Hero panel')).toBeFocused()

  // Lock: every flag, shown on the row; dragging the box on the stage leaves it where it was.
  await row(page, 'Hero panel').hover()
  await row(page, 'Hero panel').getByRole('button', { name: 'Lock Hero panel' }).click()
  await expect
    .poll(async () => (await node(page, 'box')).lock)
    .toEqual({ move: true, resize: true, content: true, style: true, delete: true })
  await expect(row(page, 'Hero panel').getByRole('button', { name: 'Unlock Hero panel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Hide: the stage no longer draws it; Show brings it back.
  expect(await colourAt(page, 300, 200)).toEqual([224, 38, 43])
  await row(page, 'Hero panel').getByRole('button', { name: 'Hide Hero panel' }).click()
  await expect.poll(() => colourAt(page, 300, 200)).toEqual([244, 237, 228])
  await page.mouse.move(900, 900)
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('layers-3-locked-hidden.png', await page.screenshot())
  await row(page, 'Hero panel').getByRole('button', { name: 'Show Hero panel' }).click()
  await expect.poll(() => colourAt(page, 300, 200)).toEqual([224, 38, 43])

  // After a reload the design is as it was left, and the panel shows the box renamed and locked.
  await reloads(page)
  await openLayers(page)
  await row(page, 'Hero panel').hover()
  await expect(row(page, 'Hero panel').getByRole('button', { name: 'Unlock Hero panel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(errors).toEqual([])
})
