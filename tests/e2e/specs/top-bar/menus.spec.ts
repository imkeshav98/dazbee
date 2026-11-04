// The top bar's items, pop-ups and panels and the small menu by the selection (#287): each kind's
// own bar, the text items, a panel closing when the selection changes, undo and redo in the header
// pill, the small menu's actions and the full menu's Copy and Paste, the small menu clear of a
// drag, the bar beside an open flyout, and the full and right-click menus clear of the rest.
import { photo, upload } from '../../support/assets.ts'
import { screenPoint, writeOutput } from '../../support/editor.ts'
import { layoutProblems } from '../../support/layout.ts'
import { fitSettled, nextFrame, openStage, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { barMenu, moreAction, moreMenu, moreSubmenu, PIECES, UNCUT } from '../../support/top-bar.ts'
import { topBarDesign } from '../../support/top-bar-design.ts'

test.describe.configure({ timeout: 240_000 })

test('each kind gets its own top bar; several layers add Line up, Combine for shapes, and Stack', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  const items = async (ids: string[]) => {
    await selectLayers(page, ids)
    await nextFrame(page)
    return page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-testid="top-bar"] [data-item]')]
        .map((el) => el.dataset.item)
        .filter((k) => !k?.startsWith('divider')),
    )
  }
  expect(await items(['headline'])).toEqual([
    'scope',
    'font',
    'size',
    'colour',
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'align',
    'list',
    'case',
    'spacing',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['box'])).toEqual(['scope', 'colour', 'outline', 'shape', 'effects', 'transparency', 'position'])
  expect(await items(['line'])).toEqual(['scope', 'outline', 'shape', 'effects', 'transparency', 'position'])
  expect(await items(['combo'])).toEqual([
    'scope',
    'colour',
    'outline',
    'combine',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['frame'])).toEqual([
    'scope',
    'colour',
    'outline',
    'stack',
    'box',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['group'])).toEqual(['scope', 'effects', 'transparency', 'position'])
  expect(await items(['photo'])).toEqual([
    'scope',
    'edit',
    'replace',
    'crop',
    'corners',
    'outline',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['photoFrame'])).toEqual([
    'scope',
    'edit',
    'replace',
    'crop',
    'stack',
    'box',
    'outline',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['cutter'])).toEqual([
    'scope',
    'colour',
    'outline',
    'shape',
    'mask',
    'effects',
    'transparency',
    'position',
  ])
  expect(await items(['box', 'star'])).toEqual([
    'scope',
    'colour',
    'outline',
    'effects',
    'transparency',
    'position',
    'line-up',
    'combine',
    'autoLayout',
  ])
  expect(await items(['headline', 'box'])).toEqual([
    'scope',
    'font',
    'effects',
    'transparency',
    'position',
    'line-up',
    'autoLayout',
  ])
  expect(await items(['box', 'frame'])).toEqual([
    'scope',
    'colour',
    'outline',
    'effects',
    'transparency',
    'position',
    'line-up',
    'autoLayout',
  ])
  // Several booleans make one new boolean of them; several photos combine into nothing.
  expect(await items(['combo', 'comboB'])).toEqual([
    'scope',
    'colour',
    'outline',
    'effects',
    'transparency',
    'position',
    'line-up',
    'combine',
    'autoLayout',
  ])
  expect(await items(['photo', 'photoB'])).toEqual([
    'scope',
    'edit',
    'replace',
    'corners',
    'outline',
    'effects',
    'transparency',
    'position',
    'line-up',
    'autoLayout',
  ])
  // Several boxes have their own Stack panel, and the action that puts them in one stack is named apart.
  expect(await items(['frame', 'frameB'])).toEqual([
    'scope',
    'colour',
    'outline',
    'stack',
    'box',
    'effects',
    'transparency',
    'position',
    'line-up',
    'autoLayout',
  ])
  await expect(page.getByTestId('top-bar').locator('[data-action="autoLayout"]')).toHaveText('Stack together')
  // Several layers put in a stack from the bar.
  await selectLayers(page, ['box', 'star'])
  await page.getByTestId('top-bar').locator('[data-action="autoLayout"]').click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.values(window.dazbee?.design().nodes ?? {}).filter(
            (n) => n.type === 'frame' && (n.props as { layout?: unknown }).layout !== undefined,
          ).length,
      ),
    )
    .toBe(2)
  expect(errors).toEqual([])
})

test('text: bold turns on and off as one undo step each, the size steps and takes a typed size, and U and S style the text', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  // With two formats a change goes to the one shown, as a drag does: Square's own values over the base.
  const style = () =>
    page.evaluate(() => {
      const d = window.dazbee?.design()
      return (
        { ...d?.nodes.headline?.props, ...d?.overrides['format:sq']?.headline } as { style: Record<string, unknown> }
      ).style
    })
  await selectLayers(page, ['headline'])
  await expect(page.getByTestId('bar-font')).toHaveText('Noto Sans')
  await expect(page.getByTestId('bar-size-field')).toHaveValue('64')
  const bold = page.getByTestId('bar-bold')
  await expect(bold).toHaveAttribute('aria-pressed', 'false')
  await bold.click()
  await expect.poll(async () => (await style()).fontWeight).toBe(700)
  await bold.click()
  await expect.poll(async () => (await style()).fontWeight).toBe(400)
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await style()).fontWeight).toBe(700)
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await style()).fontWeight).toBe(400)

  await page.getByRole('button', { name: 'Bigger' }).click()
  await expect.poll(async () => (await style()).fontSize).toBe(65)
  await page.getByTestId('bar-size-field').fill('40')
  await page.getByTestId('bar-size-field').press('Enter')
  await expect.poll(async () => (await style()).fontSize).toBe(40)
  await page.getByTestId('bar-underline').click()
  await expect.poll(async () => (await style()).underline).toBe(true)
  await expect(page.getByTestId('bar-underline')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('bar-strikethrough').click()
  await expect.poll(async () => (await style()).strikethrough).toBe(true)
  // One pop-up at a time, and opening one closes an open panel.
  await barMenu(page, 'spacing')
  await barMenu(page, 'align')
  await expect(page.locator('#edit-panel')).toHaveCount(0)
  await barMenu(page, 'list')
  await expect(page.getByTestId('bar-align-menu')).toBeHidden()
  expect(errors).toEqual([])
})

test('a panel closes when another layer is picked or its layer is removed, and the scope goes back to this size once nothing is selected', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await selectLayers(page, ['box'])
  await barMenu(page, 'position')
  await selectLayers(page, ['star'])
  await expect(page.locator('#edit-panel')).toHaveCount(0)
  await barMenu(page, 'position')
  await page.evaluate(() => window.dazbee?.session.run('node.delete', { ids: ['star'] }))
  await expect(page.locator('#edit-panel')).toHaveCount(0)

  await selectLayers(page, ['box'])
  await expect(page.getByTestId('scope-chip')).toHaveText(/Only Square/)
  await page.getByTestId('scope-chip').click()
  await page.getByTestId('scope-menu').getByRole('radio', { name: 'All sizes' }).click()
  await expect(page.getByTestId('scope-chip')).toHaveText(/all sizes/i)
  await page.keyboard.press('Escape')
  await selectLayers(page, [])
  await selectLayers(page, ['box'])
  await expect(page.getByTestId('scope-chip')).toHaveText(/Only Square/)
  expect(errors).toEqual([])
})

test('undo and redo in the header pill: off with nothing to do, each a step, and a slider drag is one step', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  const undo = page.getByTestId('undo')
  const redo = page.getByTestId('redo')
  await expect(undo).toBeDisabled()
  await expect(redo).toBeDisabled()
  const opacity = () =>
    page.evaluate(() => {
      const d = window.dazbee?.design()
      return ({ ...d?.nodes.box?.props, ...d?.overrides['format:sq']?.box } as { opacity?: number }).opacity ?? 1
    })
  await selectLayers(page, ['box'])
  const menu = await barMenu(page, 'transparency')
  const field = menu.locator('[data-scrub="Opacity"]')
  const box = await field.boundingBox()
  if (!box) throw new Error('no opacity field')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  for (const dx of [-10, -20, -30, -40]) await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2)
  await page.mouse.up()
  await expect.poll(opacity).toBeLessThan(1)
  await page.keyboard.press('Escape')
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect.poll(opacity).toBe(1)
  await expect(undo).toBeDisabled()
  await expect(redo).toBeEnabled()
  await redo.click()
  await expect.poll(opacity).toBeLessThan(1)
  await expect(redo).toBeDisabled()
  expect(errors).toEqual([])
})

test('the small menu locks, duplicates and deletes; the full menu copies, pastes, hides in every size and keeps its menus beside', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  const nodes = () => page.evaluate(() => Object.keys(window.dazbee?.design().nodes ?? {}).length)
  await page.evaluate(() => localStorage.removeItem('dazbee.copiedLayers'))
  await selectLayers(page, ['box'])
  const small = page.getByTestId('small-menu')
  await expect(small).toBeVisible()
  const lock = page.getByTestId('small-lock')
  await lock.click()
  await expect(lock).toHaveAttribute('aria-pressed', 'true')
  await lock.click()
  await expect(lock).toHaveAttribute('aria-pressed', 'false')
  const before = await nodes()
  await page.getByTestId('small-duplicate').click()
  await expect.poll(nodes).toBe(before + 1)
  await page.getByTestId('small-delete').click()
  await expect.poll(nodes).toBe(before)

  await selectLayers(page, ['box'])
  const menu = await moreMenu(page)
  await expect(menu.getByRole('button', { name: /^Paste/ })).toBeDisabled()
  await moreAction(page, 'Copy')
  await moreMenu(page)
  await moreAction(page, 'Paste')
  await expect.poll(nodes).toBe(before + 1)

  await selectLayers(page, ['box'])
  await moreAction(page, 'Hide in every size')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const d = window.dazbee?.design()
        return ['sq', 'st'].map(
          (f) => (({ ...d?.nodes.box?.props, ...d?.overrides[`format:${f}`]?.box }) as { visible?: boolean }).visible,
        )
      }),
    )
    .toEqual([false, false])
  // Order opens beside its row with the arrow and closes with the arrow back.
  const full = await moreMenu(page)
  await full.getByTestId('more-order').focus()
  await page.keyboard.press('ArrowRight')
  await expect((await moreSubmenu(page, 'order')).getByRole('button')).toHaveText([
    /^Bring to front/,
    /^Bring forward/,
    /^Send backward/,
    /^Send to back/,
  ])
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('more-order-menu')).toBeHidden()
  await expect(full).toBeVisible()
  expect(errors).toEqual([])
})

test('the small menu keeps out of a drag, and over a selection filling a phone it sits under the top bar with the full menu reachable', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  const small = page.getByTestId('small-menu')
  await selectLayers(page, ['box'])
  const from = await screenPoint(page, 160, 280)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 30, from.y + 20, { steps: 4 })
  await expect(small).toBeHidden()
  await page.mouse.up()
  await expect(small).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await selectLayers(page, ['photo'])
  await page.evaluate(() => {
    window.dazbee?.perform('zoomToSelection')
    for (let i = 0; i < 3; i++) window.dazbee?.zoomIn()
  })
  await nextFrame(page)
  await expect(small).toBeVisible()
  const bar = await page.getByTestId('top-bar-row').boundingBox()
  const at = await small.boundingBox()
  expect(bar && at && at.y >= bar.y + bar.height).toBe(true)
  await moreMenu(page)
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  expect(errors).toEqual([])
})

test('beside an open Layers flyout the top bar centres in the room left, and a right-click on a locked layer offers Unlock', async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await page.setViewportSize({ width: 1280, height: 760 })
  await page.locator('[data-panel="layers"]').click()
  await selectLayers(page, ['headline'])
  const flyout = await page.getByTestId('flyout').boundingBox()
  const bar = await page.getByTestId('top-bar-row').boundingBox()
  expect(flyout && bar && bar.x >= flyout.x + flyout.width).toBe(true)
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  await page.locator('[data-panel="layers"]').click()

  await selectLayers(page, ['box'])
  await moreAction(page, 'Lock')
  await selectLayers(page, [])
  const at = await screenPoint(page, 160, 280)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  const menu = page.getByTestId('stage-menu')
  await menu.getByRole('button', { name: /^Unlock/ }).click()
  await expect(menu).toBeHidden()
  await expect
    .poll(() => page.evaluate(() => Object.values(window.dazbee?.design().nodes.box?.lock ?? {}).some(Boolean)))
    .toBe(false)
  expect(errors).toEqual([])
})

test("the full menu opens clear of the small menu, also flipped at the stage's end, and the right-click menu clear of the dock", async ({
  browser,
}) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await page.setViewportSize({ width: 1280, height: 760 })
  await selectLayers(page, ['turned'])
  // The selection by the stage's end edge, so the full menu has no room beside the small menu there.
  await page.evaluate(() => {
    const camera = window.dazbee?.camera()
    const box = window.dazbee?.selectionRect()
    if (camera && box)
      window.dazbee?.setCamera({ ...camera, x: camera.x - (1150 - (box.x + box.width / 2)) / camera.zoom })
  })
  await nextFrame(page)
  await moreMenu(page)
  await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  await page.keyboard.press('Escape')

  await selectLayers(page, [])
  await page.evaluate(() => window.dazbee?.fitAll())
  await nextFrame(page)
  const at = await screenPoint(page, 410, 290)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await expect(page.getByTestId('stage-menu')).toBeVisible()
  // The right-click menu is one of the pop-ups the check keeps clear of everything else.
  await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  expect(errors).toEqual([])
})

test('at 820×1180 the full menu keeps clear of the rail when its end side has no room', async ({ browser }) => {
  const asset = await upload(photo)
  const { page, errors } = await openStage(browser, topBarDesign(asset.id))
  await page.setViewportSize({ width: 820, height: 1180 })
  await fitSettled(page)
  await selectLayers(page, ['box', 'star'])
  // The small menu centred at x 451 (stage and window share their origin), with no room for the full
  // menu at its end side, and the room at its start side reaching the rail, with the rail below.
  await page.evaluate(() => {
    const camera = window.dazbee?.camera()
    const box = window.dazbee?.selectionRect()
    if (camera && box)
      window.dazbee?.setCamera({
        ...camera,
        x: camera.x + 451 - (box.x + box.width / 2),
        y: camera.y + 300 - box.y,
      })
  })
  await nextFrame(page)
  const menu = await moreMenu(page)
  await nextFrame(page)
  writeOutput('top-bar-820-full-menu-by-rail.png', await page.screenshot({ animations: 'disabled' }))
  const rail = await page.getByTestId('rail').boundingBox()
  const full = await menu.boundingBox()
  expect(rail && full).toBeTruthy()
  if (!rail || !full) return
  const small = await page.getByTestId('small-menu').boundingBox()
  // No room at the end side: the full menu needs its width and 8 px from the small menu, and keeps 8
  // px from the window's edge, so it has to go elsewhere.
  expect(small && small.x + small.width + 8 + full.width > 820 - 8).toBe(true)
  expect(full.x >= rail.x + rail.width || full.y >= rail.y + rail.height || full.y + full.height <= rail.y).toBe(true)
  await expect.poll(() => layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])
  expect(errors).toEqual([])
})
