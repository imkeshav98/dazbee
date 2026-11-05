// The top bar's ⋯ for the selected layers (#457): its last item, holding how they sit. Order ▸, Line
// up ▸, the rotation field and, for text, Text direction ▸, by mouse and keyboard, each one undo
// step; a rotated layer and one inside an auto layout box; locked; at the three screen sizes, where
// on a phone it is a sheet at the bottom and stays at the bar's end.
import { design } from '../../support/arrange-design.ts'
import { setCookies, writeOutput } from '../../support/editor.ts'
import { layoutProblems, rowHeights, SCREEN_SIZES } from '../../support/layout.ts'
import { fitSettled, nextFrame, openStage, order, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { arrangeMenu, arrangeSubmenu, PIECES, UNCUT } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

test("on a phone the ⋯ stays at the bar's end and opens as a sheet at the bottom, hiding the dock and tab bar, with rows a finger can hit; a menu beside a row opens inside the screen", async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await page.setViewportSize({ width: 390, height: 844 })
  await fitSettled(page)
  // A text's bar, the longest, scrolls sideways under its ⋯, which shows whole at its end.
  await selectLayers(page, ['words'], { bar: true })
  const more = page.getByTestId('bar-arrange')
  const bar = await page.getByTestId('top-bar-row').boundingBox()
  const button = await more.boundingBox()
  expect(bar && button && button.x + button.width <= bar.x + bar.width && button.x >= bar.x).toBe(true)
  const scroll = page.getByTestId('top-bar-scroll')
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  await scroll.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  expect(await more.boundingBox()).toEqual(button)

  // A rail flyout open first is closed by the sheet, as an edit panel's sheet closes it.
  await page.locator('[data-panel="layers"]').click()
  await expect(page.getByTestId('flyout')).toBeVisible()
  await more.click()
  const sheet = page.getByTestId('bar-arrange-menu')
  await expect(sheet).toBeVisible()
  await expect(sheet).toHaveAttribute('data-sheet', 'true')
  await expect(page.getByTestId('flyout')).toHaveCount(0)
  await expect(page.getByTestId('rail')).toBeHidden()
  await expect(page.locator('[data-dock]')).toBeHidden()
  await expect(page.getByTestId('small-menu')).toBeHidden()
  // 8 px from the screen's sides and bottom, once it has popped in; its top is on a whole pixel, so
  // its bottom may be half a pixel off.
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox()
      return box && [Math.round(box.x), Math.round(box.width), Math.abs(box.y + box.height - 836) <= 1]
    })
    .toEqual([8, 374, true])
  for (const height of await rowHeights(sheet, ':scope > button, [data-scrub]'))
    expect(height).toBeGreaterThanOrEqual(44)
  expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT })).toEqual([])

  const moves = await arrangeSubmenu(page, 'order')
  for (const row of await moves.getByRole('button').all()) {
    const at = await row.boundingBox()
    expect(at && at.x >= 0 && at.x + at.width <= 390 && at.y >= 0 && at.y + at.height <= 844).toBe(true)
  }
  const before = await order(page)
  await moves.getByRole('button', { name: /^Send to back/ }).click()
  await expect(sheet).toBeHidden()
  await expect.poll(() => order(page)).toEqual(['words', ...before.filter((id) => id !== 'words')])
  await expect(page.getByTestId('rail')).toBeVisible()
  await expect(page.locator('[data-dock]')).toBeVisible()
  expect(errors).toEqual([])
})

test('at each screen size the ⋯ and the menus beside its rows meet nothing and cut nothing, for a text and a shape', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  for (const [width, height] of SCREEN_SIZES) {
    await page.setViewportSize({ width, height })
    await fitSettled(page)
    for (const id of ['words', 'shape']) {
      await selectLayers(page, [id], { bar: true })
      await arrangeMenu(page)
      await nextFrame(page)
      expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT }), `${width} ${id} ⋯`).toEqual([])
      for (const sub of ['order', 'line-up']) {
        await arrangeSubmenu(page, sub)
        await nextFrame(page)
        expect(await layoutProblems(page, { pieces: PIECES, uncut: UNCUT }), `${width} ${id} ${sub}`).toEqual([])
        await page.keyboard.press('Escape')
        await expect(page.getByTestId(`more-${sub}-menu`)).toBeHidden()
      }
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('bar-arrange-menu')).toBeHidden()
    }
  }
  expect(errors).toEqual([])
})

for (const theme of ['dark', 'light'] as const)
  test(
    `screenshots in the ${theme} theme: the ⋯ open for a shape and a text, Order and Line up open, the phone's sheet`,
    { tag: '@evidence' },
    async ({ browser }) => {
      const { page, errors } = await openStage(browser, design())
      await setCookies(page, { theme })
      await page.reload()
      await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 30_000 })
      const shot = async (name: string) => {
        await page.mouse.move(2, 400)
        await nextFrame(page)
        writeOutput(`top-bar-more-${name}-${theme}.png`, await page.screenshot({ animations: 'disabled' }))
      }
      for (const [width, height] of SCREEN_SIZES) {
        await page.setViewportSize({ width, height })
        await fitSettled(page)
        for (const id of ['shape', 'words']) {
          await selectLayers(page, [id], { bar: true })
          // Opened by a mouse with no focus left from the keys before, as a person clicking it sees it.
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
          await page.getByTestId('bar-arrange').click()
          await expect(page.getByTestId('bar-arrange-menu')).toBeVisible()
          await shot(`${id === 'words' ? 'text' : 'shape'}-${width}`)
          await page.keyboard.press('Escape')
          await expect(page.getByTestId('bar-arrange-menu')).toBeHidden()
        }
        await selectLayers(page, ['words'], { bar: true })
        for (const sub of ['order', 'line-up']) {
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
          await arrangeSubmenu(page, sub)
          await shot(`${sub}-${width}`)
          await page.keyboard.press('Escape')
          await page.keyboard.press('Escape')
          await expect(page.getByTestId('bar-arrange-menu')).toBeHidden()
        }
      }
      expect(errors).toEqual([])
    },
  )
