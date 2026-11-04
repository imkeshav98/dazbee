// The layers panel (#59) by keyboard, and where the focus goes: moving through the tree, selecting,
// renaming, locking, hiding and moving a layer into a group by keyboard alone; the focus following
// a key pressed just after the panel redraws and a layer moved past a big open group, going to the
// next row (and selecting it) when the focused one is deleted or grouped and back on undo, Tab
// landing on the selected row, one tab stop in the tree, and a rename finished or Delete pressed
// off the tree leaving the focus where it was.
import type { DesignInput } from '@dazbee/schema'

import { screenPoint, writeOutput } from '../../support/editor.ts'
import {
  colourAt,
  layerIds,
  layersDesign,
  listed,
  node,
  openLayers,
  rect,
  row,
  tabIntoTree,
  tree,
} from '../../support/layers-panel.ts'
import { click, openStage, order, read, selection } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

/** A layer on top of a group of 60 layers, with a text under them all. */
const crowd = (): DesignInput => {
  const nodes: DesignInput['nodes'] = {
    note: {
      type: 'text',
      parentId: 'p1',
      index: 'a0',
      name: 'Note',
      props: {
        x: 560,
        y: 80,
        width: 460,
        height: 90,
        text: 'Fresh roast',
        style: { fontFamily: 'Noto Sans', fontSize: 64, color: '#1F2329FF' },
      },
    },
    crowd: {
      type: 'group',
      parentId: 'p1',
      index: 'a1',
      name: 'Crowd',
      props: { x: 40, y: 300, width: 990, height: 200 },
    },
    mover: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a2',
      name: 'Mover',
      props: rect(600, 800, 200, 200, '#1F9D55FF'),
    },
  }
  for (let i = 0; i < 60; i++) {
    nodes[`k${i}`] = {
      type: 'graphic',
      parentId: 'crowd',
      index: `a${String(i).padStart(2, '0')}`,
      name: `Crowd ${i + 1}`,
      props: rect(40 + (i % 20) * 50, 300 + Math.floor(i / 20) * 70, 40, 60, '#14213DFF'),
    }
  }
  return { ...layersDesign(), nodes }
}

/** Whether the focus is in the layers tree. */
const focusInTree = (page: Page) => tree(page).evaluate((list) => list.contains(document.activeElement))

/** The layer of the row the focus is on, or null off the rows. */
const focusedLayer = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-layer') ?? null)

test('keyboard only: move through the tree, select, rename, lock, hide and move a layer into a group', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await page.getByRole('button', { name: 'Layers', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(tree(page)).toBeVisible()
  // Tab into the tree: it is one stop, on the first row.
  for (
    let i = 0;
    i < 8 && !(await page.evaluate(() => document.activeElement?.getAttribute('role') === 'treeitem'));
    i++
  )
    await page.keyboard.press('Tab')
  await expect(row(page, 'Dot')).toBeFocused()

  // Down selects the next row as it moves there.
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'Box')).toBeFocused()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['box'])
  // The arrows moved the focus, not the box.
  expect((await read(page)).nodes.box?.props).toMatchObject({ x: 120, y: 120 })

  // Down to Card, Right opens it, Right again goes to its first child.
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'Card')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'Card')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'Card stripe')).toBeFocused()
  // Left goes back to the group, and Left again closes it.
  await page.keyboard.press('ArrowLeft')
  await expect(row(page, 'Card')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(row(page, 'Card')).toHaveAttribute('aria-expanded', 'false')

  // Enter renames.
  await page.keyboard.press('ArrowUp')
  await expect(row(page, 'Box')).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Headline plate')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await node(page, 'box')).name).toBe('Headline plate')
  await expect(row(page, 'Headline plate')).toBeFocused()

  // The stage's own shortcuts act on the selected row: lock, then hide.
  await page.keyboard.press('ControlOrMeta+Shift+L')
  await expect.poll(async () => (await node(page, 'box')).lock?.move).toBe(true)
  await page.keyboard.press('ControlOrMeta+Shift+L')
  await expect.poll(async () => (await node(page, 'box')).lock).toBeUndefined()
  await page.keyboard.press('ControlOrMeta+Shift+H')
  await expect.poll(() => colourAt(page, 300, 200)).toEqual([244, 237, 228])
  await expect(row(page, 'Headline plate').getByRole('button', { name: 'Show Headline plate' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('ControlOrMeta+Shift+H')
  await expect.poll(() => colourAt(page, 300, 200)).toEqual([224, 38, 43])

  // Alt+Down moves it below Card; Alt+Right (Card is now above it) moves it into Card, on top.
  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(() => listed(page)).toEqual(['Dot', 'Card', 'Headline plate', 'Backdrop'])
  await expect(row(page, 'Headline plate')).toBeFocused()
  await page.keyboard.press('Alt+ArrowUp')
  await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(() => listed(page)).toEqual(['Headline plate', 'Dot', 'Card', 'Backdrop'])
  await page.keyboard.press('Alt+ArrowDown')
  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(() => listed(page)).toEqual(['Dot', 'Card', 'Headline plate', 'Backdrop'])
  await page.keyboard.press('Alt+ArrowRight')
  await expect.poll(async () => (await node(page, 'box')).parentId).toBe('card')
  await expect
    .poll(() => listed(page))
    .toEqual(['Dot', 'Card', '  Headline plate', '  Card stripe', '  Card back', 'Backdrop'])
  await expect(row(page, 'Headline plate')).toBeFocused()
  writeOutput('layers-4-keyboard.png', await page.screenshot())
  // Alt+Left takes it out again, just above the group.
  await page.keyboard.press('Alt+ArrowLeft')
  await expect.poll(async () => (await node(page, 'box')).parentId).toBe('p1')
  await expect
    .poll(() => listed(page))
    .toEqual(['Dot', 'Headline plate', 'Card', '  Card stripe', '  Card back', 'Backdrop'])
  // Delete, from the panel, deletes the selected layer like on the stage.
  await page.keyboard.press('Delete')
  await expect.poll(async () => Object.keys((await read(page)).nodes)).not.toContain('box')
  expect(errors).toEqual([])
})

test('keyboard only: a key pressed just after the panel redraws on its own still moves the focus', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  await page.evaluate(() => window.dazbee?.select(['c2']))
  await expect(row(page, 'Card stripe')).toHaveAttribute('aria-selected', 'true')
  await row(page, 'Card stripe').focus()
  await expect(row(page, 'Card stripe')).toBeFocused()

  // Selecting Card back from outside the panel redraws it at normal priority, as the rows' pictures
  // do when they arrive. Once that redraw is in the page, before React runs its effects, ArrowLeft is
  // pressed on Card stripe: it selects Card, and the focus goes with it.
  const pressedOn = await page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const list = document.querySelector('[role=tree]')
        if (!list) return resolve(null)
        const redrawn = new MutationObserver(() => {
          redrawn.disconnect()
          const on = document.activeElement
          on?.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true }),
          )
          resolve(on?.getAttribute('data-layer') ?? null)
        })
        redrawn.observe(list, { attributes: true, attributeFilter: ['aria-selected'], subtree: true })
        window.dazbee?.select(['c1'])
      }),
  )
  expect(pressedOn).toBe('c2')
  await expect(row(page, 'Card')).toHaveAttribute('aria-selected', 'true')
  await expect(row(page, 'Card')).toBeFocused()
  expect(errors).toEqual([])
})

test('keyboard only: a layer moved past a big open group keeps the focus, and typing on the canvas after keeps it there', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, crowd())
  await openLayers(page)
  await page.evaluate(() => window.dazbee?.select(['k0']))
  await expect(row(page, 'Crowd')).toHaveAttribute('aria-expanded', 'true')
  await row(page, 'Mover').click()
  await expect(row(page, 'Mover')).toBeFocused()

  // Alt+Down takes Mover below Crowd, past its 60 rows: the list scrolls to where it went, and the
  // focus is on it there.
  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(() => order(page)).toEqual(['note', 'mover', 'crowd'])
  await expect(row(page, 'Mover')).toBeFocused()
  await expect(row(page, 'Mover')).toBeInViewport()
  await expect(row(page, 'Mover')).toHaveAttribute('aria-posinset', '2')

  // Into the text on the canvas, all of it selected, then typed over: the words go into the text,
  // and the focus stays out of the panel, which has redrawn since (the text's row is selected).
  const at = await screenPoint(page, 700, 125)
  await page.mouse.dblclick(at.x, at.y)
  await page.evaluate(() => window.dazbee?.drawn())
  await expect(page.locator('.caret')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Hello')
  await expect.poll(async () => ((await read(page)).nodes.note?.props as { text?: string }).text).toBe('Hello')
  await expect(row(page, 'Note')).toHaveAttribute('aria-selected', 'true')
  expect(await tree(page).evaluate((list) => list.contains(document.activeElement))).toBe(false)
  writeOutput('layers-6-moved-past-group.png', await page.screenshot())
  expect(errors).toEqual([])
})

test('keyboard only: deleting the focused row moves the focus to the row in its place, and undo gives it back', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  await row(page, 'Box').click()
  await expect(row(page, 'Box')).toBeFocused()

  // Delete takes Box away; the focus goes to Card, now in its place, and Down goes on from there.
  await page.keyboard.press('Delete')
  await expect.poll(async () => Object.keys((await read(page)).nodes)).not.toContain('box')
  await expect(row(page, 'Card')).toBeFocused()
  writeOutput('layers-7-deleted-focus.png', await page.screenshot())
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'Backdrop')).toBeFocused()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['backdrop'])
  // Undo brings Box back, and the focus with it.
  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(async () => Object.keys((await read(page)).nodes)).toContain('box')
  await expect(row(page, 'Box')).toBeFocused()

  // Backspace on a row inside a group: the focus goes to the row now in its place.
  await page.evaluate(() => window.dazbee?.select(['c2']))
  await expect(row(page, 'Card stripe')).toHaveAttribute('aria-selected', 'true')
  await row(page, 'Card stripe').click()
  await expect(row(page, 'Card stripe')).toBeFocused()
  await page.keyboard.press('Backspace')
  await expect.poll(async () => Object.keys((await read(page)).nodes)).not.toContain('c2')
  await expect(row(page, 'Card back')).toBeFocused()
  expect(errors).toEqual([])
})

test('keyboard: Tab into the tree lands on the layer selected on the canvas, not the row focused before', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  await row(page, 'Box').click()
  await expect(row(page, 'Box')).toBeFocused()
  // Dot picked on the canvas: the focus leaves the panel.
  await click(page, 800, 780)
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['dot'])
  expect(await focusInTree(page)).toBe(false)

  await tabIntoTree(page)
  await expect(row(page, 'Dot')).toBeFocused()
  writeOutput('layers-8-tab-to-selected.png', await page.screenshot())
  // Down goes on from Dot.
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'Box')).toBeFocused()
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['box'])
  expect(errors).toEqual([])
})

test('a rename finished by clicking the canvas keeps the name and leaves the focus where the click put it', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  await row(page, 'Box').dblclick()
  const field = tree(page).getByRole('textbox', { name: 'Name of Box' })
  await expect(field).toBeFocused()
  await field.fill('Hero panel')

  // An empty part of the page, right of the backdrop: the click lands on the canvas and picks nothing.
  const at = await screenPoint(page, 1060, 500)
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [at.x, at.y] as const)).toBe(
    'CANVAS',
  )
  await click(page, 1060, 500)
  await expect.poll(async () => (await node(page, 'box')).name).toBe('Hero panel')
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual([])
  expect(await focusInTree(page)).toBe(false)
  writeOutput('layers-9-rename-clicked-away.png', await page.screenshot())

  // Down goes to the stage, which has nothing selected to move: no row is selected.
  await page.keyboard.press('ArrowDown')
  await page.evaluate(() => window.dazbee?.drawn())
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual([])
  expect(await focusInTree(page)).toBe(false)
  expect(errors).toEqual([])
})

test('keyboard only: the row that takes the focus after a delete is selected, so Delete again deletes it', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  await row(page, 'Box').click()
  await page.keyboard.press('Delete')
  await expect.poll(() => layerIds(page)).not.toContain('box')
  await expect(row(page, 'Card')).toBeFocused()
  await expect.poll(() => selection(page)).toEqual(['card'])
  await expect(row(page, 'Card')).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('Delete')
  await expect.poll(() => layerIds(page)).not.toContain('card')
  await expect(row(page, 'Backdrop')).toBeFocused()
  await expect.poll(() => selection(page)).toEqual(['backdrop'])
  expect(errors).toEqual([])
})

test('keyboard only: undo after a delete selects the row it gives the focus back to, so Delete acts on that row', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  await row(page, 'Box').click()
  await page.keyboard.press('Delete')
  await expect.poll(() => layerIds(page)).not.toContain('box')
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'Backdrop')).toBeFocused()
  expect(await selection(page)).toEqual(['backdrop'])

  // Undo brings Box back with the focus and the selection on it.
  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(() => layerIds(page)).toContain('box')
  await expect(row(page, 'Box')).toBeFocused()
  await expect.poll(() => selection(page)).toEqual(['box'])
  // Delete again deletes Box, the row that looks current, and leaves Backdrop.
  await page.keyboard.press('Delete')
  await expect.poll(() => layerIds(page)).not.toContain('box')
  expect(await layerIds(page)).toContain('backdrop')
  expect(errors).toEqual([])
})

test('keyboard only: grouping from the tree puts the focus on the new group, and undo on a selected row', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  await row(page, 'Dot').click()
  await row(page, 'Box').click({ modifiers: ['ControlOrMeta'] })
  await expect(row(page, 'Box')).toBeFocused()
  expect(await selection(page)).toEqual(['dot', 'box'])

  await page.keyboard.press('ControlOrMeta+G')
  await expect.poll(async () => (await selection(page)).filter((id) => id !== 'dot' && id !== 'box').length).toBe(1)
  const [group] = await selection(page)
  if (!group) throw new Error('no group selected')
  await expect.poll(() => focusedLayer(page)).toBe(group)
  writeOutput('layers-12-grouped-focus.png', await page.screenshot())

  // Undo takes the group away: the focus is on a row that is selected.
  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(() => layerIds(page)).not.toContain(group)
  await expect
    .poll(async () => {
      const on = await focusedLayer(page)
      return on !== null && (await selection(page)).includes(on)
    })
    .toBe(true)
  expect(errors).toEqual([])
})

test('keyboard only: deleting the only layer and undoing puts the focus back on its row', async ({ browser }) => {
  const only: DesignInput['nodes'] = {
    box: { type: 'graphic', parentId: 'p1', index: 'a0', name: 'Box', props: rect(120, 120, 400, 300, '#E0262BFF') },
  }
  const { page, errors } = await openStage(browser, { ...layersDesign(), nodes: only })
  await openLayers(page)
  await row(page, 'Box').click()
  await page.keyboard.press('Delete')
  await expect.poll(() => layerIds(page)).not.toContain('box')
  await expect(tree(page)).toHaveCount(0)

  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(() => layerIds(page)).toContain('box')
  await expect(row(page, 'Box')).toBeFocused()
  await expect.poll(() => selection(page)).toEqual(['box'])
  expect(errors).toEqual([])
})

test('keyboard: the tree has one tab stop, the row the focus is on, even when that row is not selected', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  const stops = () =>
    tree(page)
      .locator('[role=treeitem][tabindex="0"]')
      .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-layer')))
  await row(page, 'Box').click()
  await row(page, 'Card').click({ modifiers: ['ControlOrMeta'] })
  await row(page, 'Card').click({ modifiers: ['ControlOrMeta'] })
  await expect(row(page, 'Card')).toBeFocused()
  expect(await selection(page)).toEqual(['box'])
  expect(await stops()).toEqual(['card'])
  // Shift+Tab leaves the tree instead of stopping on Box.
  await page.keyboard.press('Shift+Tab')
  expect(await focusInTree(page)).toBe(false)

  // The lock on an unselected row: that row is the tab stop.
  await row(page, 'Dot').hover()
  await row(page, 'Dot').getByRole('button', { name: 'Lock Dot' }).click()
  await expect.poll(async () => (await node(page, 'dot')).lock?.move).toBe(true)
  expect(await selection(page)).toEqual(['box'])
  expect(await stops()).toEqual(['dot'])
  expect(errors).toEqual([])
})

test('Delete pressed on the canvas after the tree had the focus leaves the focus off the tree', async ({ browser }) => {
  const { page, errors } = await openStage(browser, layersDesign())
  await openLayers(page)
  await row(page, 'Box').click()
  await expect(row(page, 'Box')).toBeFocused()
  await click(page, 480, 380)
  expect(await selection(page)).toEqual(['box'])
  expect(await focusInTree(page)).toBe(false)

  await page.keyboard.press('Delete')
  await expect.poll(() => layerIds(page)).not.toContain('box')
  await page.evaluate(() => window.dazbee?.drawn())
  expect(await focusInTree(page)).toBe(false)
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  expect(await selection(page)).toEqual([])
  expect(errors).toEqual([])
})
