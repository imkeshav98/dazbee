// The panels inventory's rows 59 to 63 (support/inventory.ts): with nothing selected, the page
// background, background layers, formats and pages.
import { inOrder } from '@dazbee/schema'

import { designOf, openTabs, reloads, settle } from '../../support/editor.ts'
import { enter } from '../../support/fields.ts'
import { brandId, doc, setupInventory, solid, step } from '../../support/inventory.ts'
import { backgroundPanel } from '../../support/stage.ts'
import { expect, type Locator, type Page, test } from '../../support/test.ts'
import { pagesPanel, sizesPanel } from '../../support/top-bar.ts'

const row = setupInventory()

test.describe('nothing selected', () => {
  const background = async (page: Page) => (await doc(page)).pages.p1?.fills ?? []

  row(59, 'page background: brand colours, design colours, any colour', async (open) => {
    const page = await open()
    const panel = await backgroundPanel(page)
    await step(
      page,
      async () => panel.getByTestId('brand-colours').getByRole('button', { name: 'Berry' }).click(),
      async () => {
        await expect.poll(() => background(page)).toEqual(solid('#FF3D6EFF'))
      },
    )
    await step(
      page,
      async () =>
        panel
          .getByTestId('design-colours')
          .locator('button[aria-pressed="false"]:not([data-testid="colour-pick"])')
          .first()
          .click(),
      async () => {
        await expect.poll(async () => (await background(page))[0]?.color).not.toBe('#FFFFFFFF')
      },
    )
    await panel.getByTestId('colour-pick').click()
    await step(
      page,
      async () => enter(panel.getByTestId('colour-picker').getByRole('textbox', { name: 'Colour hex' }), '14213d'),
      async () => {
        await expect.poll(() => background(page)).toEqual(solid('#14213DFF'))
      },
    )
    await reloads(page)
  })

  row(60, 'background layers: add, remove, each paint', async (open) => {
    const page = await open()
    const layers = (await backgroundPanel(page)).getByTestId('page-fills')
    await step(
      page,
      async () => layers.getByRole('button', { name: 'Add a background layer' }).click(),
      async () => {
        await expect.poll(async () => (await background(page)).length).toBe(2)
      },
    )
    await step(
      page,
      async () => enter(layers.getByRole('textbox', { name: 'Background 1 hex' }), '2f6bff'),
      async () => {
        await expect.poll(async () => (await background(page))[1]?.color).toMatch(/^#2F6BFF/)
      },
    )
    await layers.locator('[data-row="1"]').getByTestId('paint-swatch').click()
    await step(
      page,
      async () => page.getByTestId('paint-editor').getByRole('radio', { name: 'Line gradient' }).click(),
      async () => {
        await expect.poll(async () => (await background(page))[1]?.type).toBe('linear')
      },
    )
    await page.keyboard.press('Escape')
    await step(
      page,
      async () => layers.getByRole('button', { name: 'Remove background layer 1' }).click(),
      async () => {
        await expect.poll(async () => (await background(page)).length).toBe(1)
      },
    )
    await reloads(page)
  })

  row(61, 'formats: add a preset, a custom size, with checks', async (open) => {
    const page = await open()
    const count = async () => Object.keys((await doc(page)).formats).length
    await sizesPanel(page)
    await page.getByRole('button', { name: 'Add format' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add format' })
    // The presets are grouped by shape.
    for (const shape of ['Square', 'Portrait', 'Tall', 'Landscape', 'Wide'])
      await expect.soft(dialog.getByRole('group', { name: shape })).toBeVisible()
    // A new format adds a frame, labelled with its name; the Square, the picture checked, stays the same.
    await step(
      page,
      async () => dialog.locator('[data-preset=story]').click(),
      async () => {
        await expect.poll(count).toBe(2)
        const [story, size] = Object.entries((await doc(page)).formats).find(([, f]) => f.name === 'Story') ?? []
        expect.soft(size).toMatchObject({ width: 1080, height: 1920 })
        await expect.soft(page.locator(`.frame-label[data-frame="p1/${story}"]`)).toContainText('Story')
      },
      { draws: false },
    )
    await page.getByRole('button', { name: 'Add format' }).click()
    await dialog.getByLabel('Width').fill('1600')
    await dialog.getByLabel('Height').fill('500')
    await expect(dialog.getByRole('alert')).toHaveText('Sizes run from 1:3 to 3:1.')
    await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
    await dialog.getByLabel('Width').fill('1200')
    await step(
      page,
      async () => dialog.getByRole('button', { name: 'Add', exact: true }).click(),
      async () => {
        await expect
          .poll(async () => Object.values((await doc(page)).formats).some((f) => f.width === 1200 && f.height === 500))
          .toBe(true)
      },
      { draws: false },
    )
    await reloads(page)
  })

  row(62, 'formats: rename, make primary, move, remove with undo, show alone', async (open) => {
    const page = await open(true)
    await sizesPanel(page)
    const formats = page.getByTestId('formats')
    const row = formats.locator('[data-format="story"]')
    const square = formats.locator('[data-format="sq"]')
    // A format's name isn't drawn; the stage's label of its frame shows it.
    await step(
      page,
      async () => {
        await row.getByRole('button', { name: 'Rename: Story' }).dblclick()
        await row.getByRole('textbox', { name: 'Rename' }).fill('Reel')
        await row.getByRole('textbox', { name: 'Rename' }).press('Enter')
      },
      async () => {
        await expect.poll(async () => (await doc(page)).formats.story?.name).toBe('Reel')
        await expect.soft(page.locator('.frame-label[data-frame="p1/story"]')).toContainText('Reel')
      },
      { draws: false },
    )
    // A size's menu: rename, move up and down, remove.
    const menu = async (of: typeof row, name: string) => {
      await of.getByRole('button', { name: /^More for / }).click()
      return page.getByRole('dialog', { name: new RegExp(`^More for ${name}`) })
    }
    // The primary format can't be removed.
    await expect.soft((await menu(square, 'Square')).getByRole('button', { name: 'Remove format' })).toBeDisabled()
    await page.keyboard.press('Escape')
    // Which format is primary changes no format's picture.
    await step(
      page,
      async () => row.getByRole('button', { name: 'Make primary' }).click(),
      async () => {
        await expect.poll(async () => (await doc(page)).meta.primaryFormatId).toBe('story')
      },
      { draws: false },
    )
    await expect.soft((await menu(row, 'Reel')).getByRole('button', { name: 'Remove format' })).toBeDisabled()
    await page.keyboard.press('Escape')
    // The order of formats is the order of the list, not of the picture.
    const order = async () => inOrder((await doc(page)).formats).map(([id]) => id)
    await step(
      page,
      async () => (await menu(row, 'Reel')).getByRole('button', { name: 'Move up' }).click(),
      async () => {
        await expect.poll(order).toEqual(['story', 'sq'])
      },
      { draws: false },
    )
    await step(
      page,
      async () => (await menu(row, 'Reel')).getByRole('button', { name: 'Move down' }).click(),
      async () => {
        await expect.poll(order).toEqual(['sq', 'story'])
      },
      { draws: false },
    )
    const kept = await designOf(page)
    await (await menu(square, 'Square')).getByRole('button', { name: 'Remove format' }).click()
    await expect.poll(async () => (await doc(page)).formats.sq).toBeUndefined()
    await expect.soft(page.getByTestId('removed-toast')).toContainText('Square removed')
    await page.getByTestId('removed-toast').getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => designOf(page), { message: "the toast's Undo brings the format back whole" }).toBe(kept)
    await square.getByRole('button', { name: 'Show alone' }).click()
    await expect(page.getByTestId('focus-chip')).toBeVisible()
    await expect.soft(page.getByTestId('focus-chip')).toContainText('Showing Square alone')
    expect(await page.evaluate(() => window.dazbee?.frames().map((f) => f.formatId))).toEqual(['sq'])
    // Show all brings both frames back.
    await page.getByTestId('focus-chip').getByRole('button', { name: 'Show all formats' }).click()
    await expect.soft(page.getByTestId('focus-chip')).toBeHidden()
    await expect.soft
      .poll(() =>
        page.evaluate(() =>
          window.dazbee
            ?.frames()
            .map((f) => f.formatId)
            .sort(),
        ),
      )
      .toEqual(['sq', 'story'])
    await reloads(page)
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
          .getByRole('dialog', { name: /^More for / })
          .getByRole('button', { name: action })
          .click()
      }
      /** Whether an action of a page's ⋯ menu is on. */
      const canAct = async (item: Locator, action: string) => {
        await item.getByRole('button', { name: /^More for / }).click()
        const on = await page
          .getByRole('dialog', { name: /^More for / })
          .getByRole('button', { name: action })
          .isEnabled()
        await page.keyboard.press('Escape')
        return on
      }
      const names = async () => inOrder((await doc(page)).pages).map(([, p]) => p.name)
      const idOf = async (name: string) => Object.entries((await doc(page)).pages).find(([, p]) => p.name === name)?.[0]
      /** The pages of the stage's rows, top to bottom. */
      const rows = () =>
        page.evaluate(() => [
          ...new Set(
            window.dazbee
              ?.frames()
              .sort((a, b) => a.y - b.y)
              .map((f) => f.pageId),
          ),
        ])
      const p1 = pages.locator('[data-page="p1"]')
      // The last page can't be deleted: its Delete is off.
      expect.soft(await canAct(p1, 'Delete page')).toBe(false)
      // The picture checked is the first page's; these steps change the other pages or their names.
      await step(
        page,
        async () => page.getByRole('button', { name: 'Add page' }).click(),
        async () => {
          await expect.poll(names).toEqual(['Page 1', 'Page 2'])
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
      // The copy is the page shown, and the stage has a row for it.
      await step(
        page,
        async () => act(p1, 'Duplicate page'),
        async () => {
          await expect.poll(async () => (await names()).length).toBe(3)
          await expect
            .soft(pages.locator(`[data-page="${await idOf('Page 1 copy')}"]`))
            .toHaveAttribute('aria-current', 'page')
          await expect.soft.poll(async () => (await rows()).length).toBe(3)
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
      // Moved up, its row on the stage goes on top.
      await step(
        page,
        async () => act(offer, 'Move up'),
        async () => {
          await expect.poll(async () => (await names())[0]).toBe('Offer')
          await expect.soft.poll(async () => (await rows())[0]).toBe(await idOf('Offer'))
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
