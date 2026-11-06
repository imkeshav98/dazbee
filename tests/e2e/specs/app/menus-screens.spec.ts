// The PR's pictures of every menu of the app open, at the three screen sizes in both themes: the
// full menu with Paste ▸ open and its greyed Paste saying why, the right-click menu on a layer with
// Copy to other frames ▸ open, the right-click menu on empty canvas, a picked frame's ⋯, Share, the
// shape menu, the zoom menu, a page card's ⋯ with its greyed Move up saying why, and a library
// tile's ⋯. Each lands in the output folder as `menu-<menu>-<width>-<theme>.png`.
import { photo, upload } from '../../support/assets.ts'
import { shoot } from '../../support/editor.ts'
import { clickLabel, openSized } from '../../support/frames-on-canvas.ts'
import { THEMES } from '../../support/glass.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { linkedMenuDesign } from '../../support/linked-menu-design.ts'
import { DEV_BRAND } from '../../support/seed.ts'
import { drawn, selectLayers } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'
import { entered, pagesPanel } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 240_000 })

/** The menu open now, the last one Radix drew. */
const openMenu = (page: Page) => page.locator('[data-radix-popper-content-wrapper]').last()

/** Waits for the open menus to settle, moves the pointer off them unless told not to, and takes the picture. */
async function picture(page: Page, name: string, { keepPointer = false } = {}) {
  await entered(page.locator('body'))
  if (!keepPointer) await page.mouse.move(2, 2)
  await drawn(page)
  await shoot(page, name)
}

/** Closes what is open with Esc until no menu shows. */
async function closeAll(page: Page) {
  await expect
    .poll(async () => {
      await page.keyboard.press('Escape')
      return page.locator('[data-radix-popper-content-wrapper]').count()
    })
    .toBe(0)
}

/** Rests the pointer on a greyed row, or taps it on a phone, so its tooltip says why. */
async function tellWhy(page: Page, row: Locator, phone: boolean) {
  if (phone) await row.click({ force: true })
  else {
    await row.hover()
    const box = await row.boundingBox()
    if (box) await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2, { steps: 2 })
  }
  await expect(page.getByRole('tooltip')).toBeVisible()
}

for (const [width, height] of SCREEN_SIZES)
  for (const theme of THEMES)
    test(`every menu open at ${width}×${height} in ${theme}`, { tag: '@evidence' }, async ({ browser }) => {
      const phone = width < 640
      const asset = await upload(photo)
      const { page } = await openSized(browser, { width, height }, { theme, input: linkedMenuDesign(asset.id) })
      const name = (menu: string) => `menu-${menu}-${width}-${theme}`

      // The full menu with Paste ▸ open, its Paste greyed with nothing copied.
      await selectLayers(page, ['headline'])
      await page.getByTestId('bar-more').click()
      const full = page.getByTestId('bar-more-menu')
      await expect(full).toBeVisible()
      await full.getByTestId('more-paste').click()
      const paste = page.getByTestId('more-paste-menu')
      await expect(paste).toBeVisible()
      await entered(paste)
      await tellWhy(page, paste.locator('[data-action="paste"]'), phone)
      await picture(page, name('full'), { keepPointer: true })
      await closeAll(page)

      // The right-click menu on a layer, with Copy to other frames ▸ open.
      await selectLayers(page, [])
      const at = await page.evaluate(() => {
        const box = window.dazbee?.boxOf('badge')
        return window.dazbee?.screenPoint(
          (box?.x ?? 0) + (box?.width ?? 0) / 2,
          (box?.y ?? 0) + (box?.height ?? 0) / 2,
          'sq',
        )
      })
      await page.mouse.click(at?.x ?? 0, at?.y ?? 0, { button: 'right' })
      const right = page.getByTestId('stage-menu')
      await expect(right).toBeVisible()
      await right.getByTestId('more-copy-to-frames').click()
      await expect(page.getByTestId('more-copy-to-frames-menu')).toBeVisible()
      await picture(page, name('right-click'))
      await closeAll(page)

      // The right-click menu on empty canvas, with a layer of the square hidden.
      await selectLayers(page, ['logo'])
      await page.keyboard.press('Control+Shift+H')
      await selectLayers(page, [])
      const empty = await page.evaluate(() => window.dazbee?.screenPoint(560, 980, 'sq'))
      await page.mouse.click(empty?.x ?? 0, empty?.y ?? 0, { button: 'right' })
      await expect(page.getByTestId('stage-menu')).toBeVisible()
      await picture(page, name('canvas'))
      await closeAll(page)

      // A picked frame's ⋯.
      await clickLabel(page, 'sq')
      await page.getByTestId('bar-frame-more').click()
      await expect(page.getByTestId('bar-frame-more-menu')).toBeVisible()
      await picture(page, name('frame'))
      await closeAll(page)
      await selectLayers(page, [])

      // Share.
      await page.getByTestId('share-open').click()
      await expect(page.getByTestId('export-open')).toBeVisible()
      await picture(page, name('share'))
      await closeAll(page)

      // The shape menu, in the dock.
      await page.getByTestId('shape-menu').click()
      await expect(page.locator('[data-shape="star"]').last()).toBeVisible()
      await picture(page, name('shape'))
      await closeAll(page)

      // The zoom menu.
      await page.getByTestId('zoom').click()
      await expect(page.getByTestId('zoom-menu')).toBeVisible()
      await picture(page, name('zoom'))
      await closeAll(page)

      // The first page card's ⋯, its Move up greyed.
      const pages = await pagesPanel(page)
      await pages
        .locator('[data-page]')
        .first()
        .getByRole('button', { name: /^More for / })
        .click()
      const card = openMenu(page)
      await expect(card.getByText('Move up')).toBeVisible()
      if ((await card.getByText('Move up').evaluate((row) => row.closest('[aria-disabled="true"]') !== null)) === true)
        await tellWhy(page, card.getByText('Move up'), phone)
      await picture(page, name('card'), { keepPointer: true })
      await closeAll(page)

      // A library tile's ⋯.
      await page.goto(`/brands/${DEV_BRAND}/designs`)
      const tile = page.locator('[data-design]').first()
      await tile.hover()
      await tile.getByRole('button', { name: /^More for / }).click()
      await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
      await picture(page, name('tile'))
    })
