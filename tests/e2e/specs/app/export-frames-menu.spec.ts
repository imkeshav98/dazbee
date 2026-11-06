// Export lists frames, from a picked frame's ⋯: Export there opens the Export form with that frame
// ticked alone, by mouse and by keyboard, and Esc gives the focus back to the ⋯; and while the form
// is open, from there or from Share, Share shows it open and the form has its heading.
import { expectNode, openExport, runExport } from '../../support/export.ts'
import { openSized, rows } from '../../support/export-frames.ts'
import { clickLabel, picked, tabToBar } from '../../support/frames-on-canvas.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { barMenu } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

/**
 * The Share button's fill and the tint laid over it, and the same of glass under the pressed tint,
 * as the rail's button for an open flyout shows it.
 */
const shareLook = (page: Page) =>
  page.getByTestId('share-open').evaluate((share) => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'var(--glass)'
    probe.style.backgroundImage = 'linear-gradient(var(--glass-pressed), var(--glass-pressed))'
    share.after(probe)
    const [own, open] = [getComputedStyle(share), getComputedStyle(probe)]
    const look = {
      share: [own.backgroundColor, own.backgroundImage],
      openGlass: [open.backgroundColor, open.backgroundImage],
    }
    probe.remove()
    return look
  })

test('a picked frame’s ⋯ has Export after Rename, before the line and Delete: it opens Export with that frame ticked alone, by mouse and by keyboard', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 })
  await clickLabel(page, 'story')
  expect(await picked(page)).toBe('story')
  const menu = await barMenu(page, 'frame-more')
  const items = await menu
    .locator('button, [role="separator"]')
    .evaluateAll((all) => all.map((el) => el.getAttribute('data-action') ?? el.getAttribute('role')))
  expect(items.slice(items.indexOf('rename'))).toEqual(['rename', 'export', 'separator', 'delete'])
  await menu.getByRole('menuitem', { name: 'Export', exact: true }).click()
  await expect(menu).toBeHidden()
  const dialog = page.getByTestId('export')
  await expect(dialog).toBeVisible()
  expect((await rows(dialog)).map((row) => [row.name, row.on])).toEqual([
    ['All frames', 'mixed'],
    ['Sale', false],
    ['Sale 2', true],
    ['Banner', false],
    ['sale 3', false],
  ])
  await expect(page.getByTestId('export-run')).toHaveText('Export 1 file')
  // The frame stays picked.
  expect(await picked(page)).toBe('story')
  const got = await runExport(page)
  expect(got.name).toBe('Sale 2.png')
  await expectNode(page, { frameIds: ['story'], type: 'png' }, got)
  // Esc closes Export first, with the focus back on ⋯; the next lets the frame go.
  await page.getByTestId('export-run').focus()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('bar-frame-more')).toBeFocused()
  expect(await picked(page)).toBe('story')

  // By keyboard, from the banner: Tab to the bar, along to ⋯, Enter, the down arrow to Export, Enter.
  await clickLabel(page, 'banner')
  expect(await picked(page)).toBe('banner')
  // The bar's one Tab stop is the item last focused in it, ⋯ here.
  expect(await tabToBar(page)).toBe('bar-frame-more')
  await page.keyboard.press('Enter')
  const exportItem = menu.getByRole('menuitem', { name: 'Export', exact: true })
  for (let i = 0; i < 6 && !(await exportItem.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('ArrowDown')
  await expect(exportItem).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('export-page')).toBeFocused()
  expect((await rows(dialog)).filter((row) => row.on === true).map((row) => row.frame)).toEqual(['banner'])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('bar-frame-more')).toBeFocused()
  // Share opens Export with every frame ticked again.
  const share = await openExport(page)
  expect((await rows(share)).every((row) => row.on === true)).toBe(true)
  expect(errors).toEqual([])
})

test('while Export is open, from Share or a picked frame’s ⋯, Share shows it open, glass under the pressed tint, and the form has its heading', async ({
  browser,
}) => {
  const { page, errors } = await openSized(browser, { width: 1280, height: 760 })
  const closed = await shareLook(page)
  expect(closed.share[1]).toBe('none')
  const dialog = await openExport(page)
  await expect(dialog.getByRole('heading', { name: 'Export', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Export', exact: true })).toBeVisible()
  await expect
    .poll(async () => {
      const look = await shareLook(page)
      return look.share.join() === look.openGlass.join()
    })
    .toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect.poll(async () => (await shareLook(page)).share).toEqual(closed.share)

  await clickLabel(page, 'story')
  const menu = await barMenu(page, 'frame-more')
  await menu.getByRole('menuitem', { name: 'Export', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Export', exact: true })).toBeVisible()
  await expect
    .poll(async () => {
      const look = await shareLook(page)
      return look.share.join() === look.openGlass.join()
    })
    .toBe(true)
  expect(errors).toEqual([])
})
