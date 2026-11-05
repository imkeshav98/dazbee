// Screenshots of the small menu, its ⋯, Copy to other frames ▸, a greyed row's tooltip, the dashed
// outlines of linked copies and a group's ⋯, the longest, at the three screen sizes in both themes;
// and at 1280×760, the small menu by a headline, a locked layer's greyed Delete and Ungroup in a
// group's ⋯.
import { photo, upload } from '../../support/assets.ts'
import { shoot } from '../../support/editor.ts'
import { openDesignIn, THEMES } from '../../support/glass.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { linkedMenuDesign } from '../../support/linked-menu-design.ts'
import { rowIn } from '../../support/menu-rows.ts'
import { copyIn, seed } from '../../support/seed.ts'
import { drawn, fitSettled, nextFrame, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { moreMenu, moreSubmenu } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 180_000 })

for (const [width, height] of SCREEN_SIZES) {
  test(
    `the PR's screenshots at ${width}×${height}: the small menu, its ⋯, Copy to other frames ▸, a greyed row's tooltip, the dashed outlines and a group's ⋯`,
    { tag: '@evidence' },
    async ({ browser }) => {
      const asset = await upload(photo)
      const designId = await seed(linkedMenuDesign(asset.id))
      for (const theme of THEMES) {
        const { page, errors } = await openDesignIn(browser, designId, theme, { viewport: { width, height } })
        await fitSettled(page)
        const name = (state: string) => `linked-menu-${state}-${width}-${theme}`
        // The square's headline in pink with new words, so Style and Text have work and Layer none, as in the mock.
        await page.evaluate(() => {
          const editor = window.dazbee
          if (!editor) return
          editor.setProps(['headline'], (_, p) => ({ style: { ...(p.style as object), color: '#E0157FFF' } }))
          const headline = editor.design().nodes.headline
          if (headline?.type === 'text' && headline.props.text === 'Weekend sale')
            editor.session.run('text.edit', { id: 'headline', op: { kind: 'insert', at: 12, text: '!' } })
        })
        await selectLayers(page, ['headline'])
        await expect(page.getByTestId('small-menu')).toBeVisible()
        await drawn(page)
        await nextFrame(page)
        await shoot(page, name('small-menu'))
        await moreMenu(page)
        await shoot(page, name('more'))
        await moreSubmenu(page, 'copy-to-frames')
        await shoot(page, name('copy-to-frames'))
        const sub = page.getByTestId('more-copy-to-frames-menu')
        await rowIn(sub, 'layerToLinked').hover()
        await expect(page.getByRole('tooltip')).toHaveText('Every linked frame has this layer already')
        await shoot(page, name('greyed'))
        // Esc closes the top-most first: the tooltip, the menu beside its row, then the full menu.
        await expect
          .poll(async () => {
            await page.keyboard.press('Escape')
            return page.getByTestId('bar-more-menu').isVisible()
          })
          .toBe(false)
        await page.mouse.move(0, height / 2)
        await shoot(page, name('outlines'))
        // A group's ⋯, the longest, with Ungroup after Put in a box; on a phone the whole sheet.
        await selectLayers(page, ['logo'])
        await moreMenu(page)
        await page.mouse.move(0, height / 2)
        await shoot(page, name('group-more'))
        expect(errors).toEqual([])
        await page.context().close()
      }
    },
  )
}

test(
  "the PR's screenshots at 1280×760: the small menu by a headline, a locked layer's greyed Delete and Ungroup in a group's ⋯",
  { tag: '@evidence' },
  async ({ browser }) => {
    const asset = await upload(photo)
    const designId = await seed(linkedMenuDesign(asset.id))
    for (const theme of THEMES) {
      const { page, errors } = await openDesignIn(browser, designId, theme, { viewport: { width: 1280, height: 760 } })
      await fitSettled(page)
      const name = (state: string) => `small-menu-${state}-1280-${theme}`
      const settle = async () => {
        await drawn(page)
        await nextFrame(page)
      }
      for (const [id, state] of [
        ['headline', 'by-headline'],
        [copyIn('wide', 'headline'), 'by-landscape-headline'],
      ] as const) {
        await selectLayers(page, [id])
        await expect(page.getByTestId('small-menu')).toBeVisible()
        await settle()
        await shoot(page, name(state))
      }
      // The badge locked: Delete is greyed and says why. Unlocked again after, as the next theme opens the same design.
      await selectLayers(page, ['badge'])
      await page.getByTestId('small-lock').click()
      await page.getByTestId('small-delete').hover()
      await expect(page.getByRole('tooltip')).toHaveText('The selection is locked against deleting')
      await settle()
      await shoot(page, name('locked-delete'))
      await page.mouse.move(0, 380)
      await page.getByTestId('small-lock').click()
      await expect(page.getByTestId('small-delete')).not.toHaveAttribute('aria-disabled', 'true')
      // The logo group: its ⋯ has Ungroup right after Put in a box.
      await selectLayers(page, ['logo'])
      const menu = await moreMenu(page)
      await rowIn(menu, 'ungroup').hover()
      await settle()
      await shoot(page, name('ungroup'))
      expect(errors).toEqual([])
      await page.context().close()
    }
  },
)
