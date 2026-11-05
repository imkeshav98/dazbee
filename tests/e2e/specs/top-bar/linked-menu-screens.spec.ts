// The PR's screenshots of the small menu, its ⋯, Copy to other frames ▸, a greyed row's tooltip and
// the dashed outlines of linked copies (#456), at the three screen sizes in both themes.
import { photo, upload } from '../../support/assets.ts'
import { shoot } from '../../support/editor.ts'
import { openDesignIn, THEMES } from '../../support/glass.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { linkedMenuDesign } from '../../support/linked-menu-design.ts'
import { seed } from '../../support/seed.ts'
import { drawn, fitSettled, nextFrame, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { moreMenu, moreSubmenu } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 180_000 })

for (const [width, height] of SCREEN_SIZES) {
  test(
    `the PR's screenshots at ${width}×${height}: the small menu, its ⋯, Copy to other frames ▸, a greyed row's tooltip and the dashed outlines`,
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
        await sub.getByRole('button', { name: /^Layer/ }).hover()
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
        expect(errors).toEqual([])
        await page.context().close()
      }
    },
  )
}
