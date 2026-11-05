// Ungroup in the full menu (the small menu's ⋯) and the right-click menu for a group or a box in an
// auto layout box, in Chromium: greyed with the reason while ungrouping would move what it holds
// or the layer is locked, its key doing nothing and showing no notice; live for one outside an auto
// layout box, and for a group whose layer takes its place with nothing moving.
import { closeMenus, expectGreyed, node, open } from '../../support/linked-menu.ts'
import { rowIn, rowName } from '../../support/menu-rows.ts'
import { drawn, press, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { moreMenu } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 120_000 })

test('greys Ungroup with its reason in both menus for a box an auto layout row would move what it holds out of; its key does nothing and says nothing', async ({
  browser,
}) => {
  const { page, errors } = await open(browser)
  await page.evaluate(() => {
    const counter = window as unknown as { notices: number }
    counter.notices = 0
    window.dazbee?.onNotice(() => counter.notices++)
  })
  const notices = () => page.evaluate(() => (window as unknown as { notices: number }).notices)
  const why = 'Auto layout would move what it holds'
  /** The right-click menu on a selected layer, opened over its middle. */
  const rightClickOn = async (id: string) => {
    const b = await page.evaluate((one) => window.dazbee?.boxOf(one), id)
    const at = await page.evaluate(
      (box) => window.dazbee?.screenPoint((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + 4, 'sq'),
      b,
    )
    await page.mouse.click(at?.x ?? 0, at?.y ?? 0, { button: 'right' })
    const right = page.getByTestId('stage-menu')
    await expect(right).toBeVisible()
    expect(await page.evaluate(() => window.dazbee?.selection())).toEqual([id])
    return right
  }

  // The card outside any auto layout box: Ungroup is live in both menus.
  await selectLayers(page, ['card'])
  await expect(rowIn(await moreMenu(page), 'ungroup')).not.toHaveAttribute('aria-disabled', 'true')
  await closeMenus(page)
  await expect(rowIn(await rightClickOn('card'), 'ungroup')).not.toHaveAttribute('aria-disabled', 'true')
  await closeMenus(page)

  // The card and the badge in an auto layout row: the row would place the card's text elsewhere.
  await page.evaluate(() => {
    const session = window.dazbee?.session
    const row = session?.run('node.box', { ids: ['badge', 'card'] }) ?? ''
    session?.run('node.autoLayout', { id: row, on: true })
  })
  await drawn(page)
  expect((await node(page, 'card'))?.parentId).not.toBe('sq')
  await selectLayers(page, ['card'])
  const before = await page.evaluate(() => JSON.stringify(window.dazbee?.design()))
  const more = await moreMenu(page)
  await expectGreyed(page, more, rowName('ungroup'), why)
  // A click on the greyed row only says why.
  const greyed = await rowIn(more, 'ungroup').boundingBox()
  await page.mouse.click((greyed?.x ?? 0) + 20, (greyed?.y ?? 0) + (greyed?.height ?? 0) / 2)
  await expect(more).toBeVisible()
  await expect(page.getByRole('tooltip').filter({ hasText: why })).toBeVisible()
  expect(await page.evaluate(() => JSON.stringify(window.dazbee?.design()))).toBe(before)
  await closeMenus(page)
  await expectGreyed(page, await rightClickOn('card'), rowName('ungroup'), why)
  await closeMenus(page)

  // Its key does nothing and shows no notice.
  await press(page, 'ungroup')
  expect(await page.evaluate(() => JSON.stringify(window.dazbee?.design()))).toBe(before)
  expect(await notices()).toBe(0)
  expect(await page.evaluate(() => window.dazbee?.selection())).toEqual(['card'])
  expect(errors).toEqual([])
})

test('keeps Ungroup live for a group in an auto layout row whose layer takes its place, and greys it with the lock as the reason once it is locked', async ({
  browser,
}) => {
  const { page, errors } = await open(browser)
  await page.evaluate(() => {
    const session = window.dazbee?.session
    const row = session?.run('node.box', { ids: ['badge', 'card', 'logo'] }) ?? ''
    session?.run('node.autoLayout', { id: row, on: true })
  })
  await drawn(page)
  await selectLayers(page, ['logo'])
  await expect(rowIn(await moreMenu(page), 'ungroup')).not.toHaveAttribute('aria-disabled', 'true')
  await closeMenus(page)
  // Locked from its small menu, as a person locks it.
  await selectLayers(page, ['logo'])
  await page.getByTestId('small-lock').click()
  await expectGreyed(page, await moreMenu(page), rowName('ungroup'), 'The layer is locked')
  await closeMenus(page)
  await press(page, 'ungroup')
  expect((await node(page, 'mark'))?.parentId).toBe('logo')
  expect(errors).toEqual([])
})
