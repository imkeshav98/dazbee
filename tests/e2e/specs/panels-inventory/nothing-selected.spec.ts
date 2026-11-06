// The panels inventory's rows 59 and 63 (support/inventory.ts): with nothing selected, the shown
// page's frames, counted in Pages, the empty-page hint, and pages.
import { inOrder } from '@dazbee/schema'

import { designOf, openTabs, reloads, settle } from '../../support/editor.ts'
import { brandId, doc, setupInventory, step } from '../../support/inventory.ts'
import { expect, type Locator, test } from '../../support/test.ts'
import { pagesPanel } from '../../support/top-bar.ts'

const row = setupInventory()

test.describe('nothing selected', () => {
  row(59, "the shown page's frames, counted in Pages; an empty page says how to add a frame", async (open) => {
    const page = await open(true)
    // The page's two linked frames are on the stage, each labelled with its name.
    expect(await page.evaluate(() => window.dazbee?.frames().map((f) => f.id))).toEqual(['sq', 'story'])
    await expect.soft(page.locator('.frame-label[data-frame="sq"]')).toContainText('Square')
    await expect.soft(page.locator('.frame-label[data-frame="story"]')).toContainText('Story')
    await expect(page.getByTestId('empty-page')).toHaveCount(0)
    const p1 = (await pagesPanel(page)).getByTestId('pages').locator('[data-page="p1"]')
    await expect.soft(p1).toContainText('2 frames')
    const frames = async () => Object.keys((await doc(page)).frames).sort()
    await step(
      page,
      async () => page.evaluate(() => window.dazbee?.session.run('frame.delete', { frameId: 'story' })),
      async () => {
        await expect.poll(frames).toEqual(['sq'])
        await expect.soft(p1).toContainText('1 frame')
      },
      { draws: false },
    )
    // With its last frame deleted the page is empty: the stage says how to add one, and Pages counts none.
    await step(
      page,
      async () => page.evaluate(() => window.dazbee?.session.run('frame.delete', { frameId: 'sq' })),
      async () => {
        await expect.poll(frames).toEqual([])
        await expect(page.getByTestId('empty-page')).toHaveText('Pick the Frame tool to add a frame')
        await expect.soft(p1).toContainText('No frames')
      },
      { draws: false },
    )
    await expect(page.getByTestId('empty-page')).toBeVisible()
    await reloads(page)
    await expect(page.getByTestId('empty-page')).toBeVisible()
  })

  row(63, 'pages: add, duplicate, rename, move, delete with undo, show', async (open) => {
    const page = await open()
    // A second tab on the same design holds the same design after the rename, after the toast's
    // Undo and at the end.
    const browser = page.context().browser()
    const designId = new URL(page.url()).pathname.split('/').at(-1)
    if (!browser || !designId) throw new Error('no browser or design')
    const {
      tabs: [other],
    } = await openTabs(browser, 1, designId, { brandId })
    if (!other) throw new Error('no second tab')
    try {
      const pages = (await pagesPanel(page)).getByTestId('pages')
      /** Picks an action from a page's ⋯ menu. */
      const act = async (item: Locator, action: string) => {
        await item.getByRole('button', { name: /^More for / }).click()
        await page
          .getByRole('menu', { name: /^More for / })
          .getByRole('menuitem', { name: action })
          .click()
      }
      /** Whether an action of a page's ⋯ menu is on. */
      const canAct = async (item: Locator, action: string) => {
        await item.getByRole('button', { name: /^More for / }).click()
        const on = await page
          .getByRole('menu', { name: /^More for / })
          .getByRole('menuitem', { name: action })
          .isEnabled()
        await page.keyboard.press('Escape')
        return on
      }
      const names = async () => inOrder((await doc(page)).pages).map(([, p]) => p.name)
      const idOf = async (name: string) => Object.entries((await doc(page)).pages).find(([, p]) => p.name === name)?.[0]
      /** The page the stage shows, and the pages of the frames it shows. */
      const shown = () =>
        page.evaluate(() => ({
          page: window.dazbee?.shownPage(),
          frames: [...new Set(window.dazbee?.frames().map((f) => f.pageId))],
        }))
      const p1 = pages.locator('[data-page="p1"]')
      // The last page can't be deleted: its Delete is off.
      expect.soft(await canAct(p1, 'Delete page')).toBe(false)
      // The picture checked is the first page's; these steps change the other pages or their names.
      await step(
        page,
        async () => page.getByRole('button', { name: 'Add page' }).click(),
        async () => {
          await expect.poll(names).toEqual(['Page 1', 'Page 2'])
          // The new page holds one frame, the size of the one the stage showed.
          await expect.soft(pages.getByRole('listitem').filter({ hasText: 'Page 2' })).toContainText('1 frame')
        },
        { draws: false },
      )
      // Deleted back to one page, its Delete is off again; the toast's Undo brings the other back.
      const page2 = pages.getByRole('listitem').filter({ hasText: 'Page 2' })
      await act(page2, 'Delete page')
      await expect.poll(names).toEqual(['Page 1'])
      expect.soft(await canAct(p1, 'Delete page')).toBe(false)
      await page.getByTestId('removed-toast').getByRole('button', { name: 'Undo' }).click()
      await expect.poll(names).toEqual(['Page 1', 'Page 2'])
      // The copy is the page shown: the stage shows its frames only.
      await step(
        page,
        async () => act(p1, 'Duplicate page'),
        async () => {
          await expect.poll(async () => (await names()).length).toBe(3)
          const copy = await idOf('Page 1 copy')
          await expect.soft(pages.locator(`[data-page="${copy}"]`)).toHaveAttribute('aria-current', 'page')
          await expect.soft.poll(shown).toEqual({ page: copy, frames: [copy] })
        },
        { draws: false },
      )
      const second = pages.getByRole('listitem').nth(1)
      await step(
        page,
        async () => {
          await second.getByRole('button', { name: /^Show / }).dblclick()
          await second.getByRole('textbox', { name: 'Rename' }).fill('Offer')
          await second.getByRole('textbox', { name: 'Rename' }).press('Enter')
        },
        async () => {
          await expect.poll(async () => (await names())[1]).toBe('Offer')
        },
        { draws: false },
      )
      await settle([page, other])
      const offer = pages.getByRole('listitem').filter({ hasText: 'Offer' })
      // Moved up, it is first in the list.
      await step(
        page,
        async () => act(offer, 'Move up'),
        async () => {
          await expect.poll(async () => (await names())[0]).toBe('Offer')
        },
        { draws: false },
      )
      await step(
        page,
        async () => act(offer, 'Move down'),
        async () => {
          await expect.poll(async () => (await names())[1]).toBe('Offer')
        },
        { draws: false },
      )
      const kept = await designOf(page)
      await act(offer, 'Delete page')
      await expect.poll(async () => (await names()).length).toBe(2)
      await expect.soft(page.getByTestId('removed-toast')).toContainText('Offer deleted')
      await page.getByTestId('removed-toast').getByRole('button', { name: 'Undo' }).click()
      await expect.poll(() => designOf(page), { message: "the toast's Undo brings the page back whole" }).toBe(kept)
      await settle([page, other])
      // With the page shown deleted, the first is the one in view; Show brings another into view.
      await expect(p1).toHaveAttribute('aria-current', 'page')
      const offerAgain = pages.getByRole('listitem').filter({ hasText: 'Offer' })
      await offerAgain.getByRole('button', { name: 'Show Offer' }).click()
      await expect(offerAgain).toHaveAttribute('aria-current', 'page')
      await expect.soft.poll(async () => (await shown()).page).toBe(await idOf('Offer'))
      await expect(page.getByTestId('pages-button')).toHaveAccessibleName('Pages: page 2 of 3')
      await p1.getByRole('button', { name: 'Show Page 1' }).click()
      await expect(p1).toHaveAttribute('aria-current', 'page')
      // A new page takes the next free name: one more than there are pages, past a name taken.
      // The last row, found by place: while it is renamed its name is in a text box, not its text.
      // F2 opens the rename from the keyboard, the other way in besides the double click above.
      const last = pages.getByRole('listitem').last()
      await step(
        page,
        async () => {
          await last.getByRole('button', { name: /^Show / }).press('F2')
          await last.getByRole('textbox', { name: 'Rename' }).fill('Page 4')
          await last.getByRole('textbox', { name: 'Rename' }).press('Enter')
        },
        async () => {
          await expect.poll(names).toEqual(['Page 1', 'Offer', 'Page 4'])
        },
        { draws: false },
      )
      await step(
        page,
        async () => page.getByRole('button', { name: 'Add page' }).click(),
        async () => {
          await expect.soft.poll(names).toEqual(['Page 1', 'Offer', 'Page 4', 'Page 5'])
        },
        { draws: false },
      )
      await settle([page, other])
      await reloads(page)
    } finally {
      await other.context().close()
    }
  })
})
