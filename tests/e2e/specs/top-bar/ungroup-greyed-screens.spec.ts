// Screenshots of Ungroup greyed in the full menu with its tooltip, for a box in an auto layout row
// that would move what the box holds, at the three screen sizes in both themes.
import { photo, upload } from '../../support/assets.ts'
import { shoot } from '../../support/editor.ts'
import { openDesignIn, THEMES } from '../../support/glass.ts'
import { SCREEN_SIZES } from '../../support/layout.ts'
import { linkedMenuDesign } from '../../support/linked-menu-design.ts'
import { rowIn } from '../../support/menu-rows.ts'
import { seed } from '../../support/seed.ts'
import { drawn, fitSettled, nextFrame, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { moreMenu } from '../../support/top-bar.ts'

test.describe.configure({ mode: 'parallel', timeout: 180_000 })

for (const [width, height] of SCREEN_SIZES) {
  test(
    `the PR's screenshots at ${width}×${height}: Ungroup greyed with its tooltip for a box in an auto layout row`,
    { tag: '@evidence' },
    async ({ browser }) => {
      const asset = await upload(photo)
      const designId = await seed(linkedMenuDesign(asset.id))
      for (const theme of THEMES) {
        const { page, errors } = await openDesignIn(browser, designId, theme, { viewport: { width, height } })
        await fitSettled(page)
        // The badge and the card in an auto layout row, once: the next theme opens the same design.
        await page.evaluate(() => {
          const session = window.dazbee?.session
          if (!session || session.design().nodes.card?.parentId !== 'sq') return
          const row = session.run('node.box', { ids: ['badge', 'card'] })
          session.run('node.autoLayout', { id: row, on: true })
        })
        await selectLayers(page, ['card'])
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        const menu = await moreMenu(page)
        // A tap or a click on the greyed row says why.
        const row = await rowIn(menu, 'ungroup').boundingBox()
        await page.mouse.click((row?.x ?? 0) + 20, (row?.y ?? 0) + (row?.height ?? 0) / 2)
        await expect(page.getByRole('tooltip')).toHaveText('Auto layout would move what it holds')
        await drawn(page)
        await nextFrame(page)
        await shoot(page, `ungroup-greyed-${width}-${theme}`)
        expect(errors).toEqual([])
        await page.context().close()
      }
    },
  )
}
