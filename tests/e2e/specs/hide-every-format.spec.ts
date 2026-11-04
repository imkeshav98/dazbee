// Hiding a layer in every format, in Chromium with real input: a plain click on the eye hides it in
// the format shown and the eye shows it is hidden only there; Alt-click hides it in every format and
// shows it again; Alt+Mod+Shift+H does the same for the selection; each is one undo step.
import { type DesignInput, formatScope } from '@dazbee/schema'

import { writeOutput } from '../support/editor.ts'
import { openStage, perform, read } from '../support/stage.ts'
import { expect, type Page, test } from '../support/test.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput => ({
  meta: {
    schemaVersion: 5,
    designId: 'replaced-by-the-api',
    name: 'Hide everywhere',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    story: { name: 'Story', width: 1080, height: 1920, order: 'a1' },
  },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFF8F0FF' }] } },
  nodes: {
    badge: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Badge',
      props: {
        x: 120,
        y: 120,
        width: 300,
        height: 300,
        shape: { kind: 'ellipse' },
        fills: [{ type: 'solid', color: '#E0157FFF' }],
      },
    },
    bar: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a1',
      name: 'Bar',
      props: {
        x: 120,
        y: 600,
        width: 800,
        height: 120,
        shape: { kind: 'rect' },
        fills: [{ type: 'solid', color: '#3D6BFFFF' }],
      },
    },
  },
  overrides: {},
})

/** Whether the layer shows in each format: Square, then Story. */
const visible = async (page: Page, id: string) => {
  const d = await read(page)
  return ['sq', 'story'].map(
    (f) => (d.overrides[formatScope(f)]?.[id]?.visible ?? d.nodes[id]?.props.visible) !== false,
  )
}
/** How many of Story's pixels are the badge's pink, as the export draws it. */
const pinkInStory = (page: Page) =>
  page.evaluate(() => {
    const p = window.dazbee?.exportPixels('p1', 'story')
    let n = 0
    if (p)
      for (let i = 0; i < p.length; i += 4)
        if (
          Math.abs((p[i] ?? 0) - 224) < 8 &&
          Math.abs((p[i + 1] ?? 0) - 21) < 8 &&
          Math.abs((p[i + 2] ?? 0) - 127) < 8
        )
          n++
    return n
  })

test('a plain click hides in the format shown; Alt-click and Alt+Mod+Shift+H hide in every format; one undo step each', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  await page.locator('[data-panel="layers"]').click()
  const tree = page.getByRole('tree')
  const row = (name: string) =>
    tree.getByRole('treeitem').filter({ has: page.locator(`[data-testid="layer-name"]:text-is("${name}")`) })
  const eye = (name: string) => row(name).getByTestId('layer-hide')

  // The eye says Alt-click reaches every size.
  await row('Badge').hover()
  await expect(eye('Badge')).toHaveAttribute('title', /Alt-click: every size/)

  // A plain click: hidden in Square only, and the eye shows it is hidden only in some.
  await eye('Badge').click()
  await expect.poll(() => visible(page, 'badge')).toEqual([false, true])
  await expect(eye('Badge')).toHaveAttribute('data-state', 'some')
  // Hidden here: pressed. Still drawn in Story.
  await expect(eye('Badge')).toHaveAttribute('aria-pressed', 'true')
  expect(await pinkInStory(page)).toBeGreaterThan(1000)
  await expect(eye('Badge')).toHaveAttribute('title', /Hidden in some sizes/)
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('hide-1-some.png', await page.screenshot())

  // Alt-click: hidden in every format, one step; undo puts it back to Square only.
  await eye('Badge').click({ modifiers: ['Alt'] })
  await expect.poll(() => visible(page, 'badge')).toEqual([false, false])
  await expect(eye('Badge')).toHaveAttribute('data-state', 'hidden')
  expect(await pinkInStory(page)).toBe(0)
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('hide-2-everywhere.png', await page.screenshot())
  await perform(page, 'undo')
  await expect.poll(() => visible(page, 'badge')).toEqual([false, true])
  await eye('Badge').click({ modifiers: ['Alt'] })
  await expect.poll(() => visible(page, 'badge')).toEqual([false, false])
  // Alt-click again shows it in every format.
  await eye('Badge').click({ modifiers: ['Alt'] })
  await expect.poll(() => visible(page, 'badge')).toEqual([true, true])
  await expect(eye('Badge')).toHaveAttribute('data-state', 'shown')

  // The shortcut does the same for the selection.
  await page.evaluate(() => window.dazbee?.select(['bar']))
  await page.mouse.move(5, 500)
  await page.keyboard.press('Alt+Control+Shift+KeyH')
  await expect.poll(() => visible(page, 'bar')).toEqual([false, false])
  await page.keyboard.press('Alt+Control+Shift+KeyH')
  await expect.poll(() => visible(page, 'bar')).toEqual([true, true])
  await perform(page, 'undo')
  await expect.poll(() => visible(page, 'bar')).toEqual([false, false])
  // Mod+Shift+H still hides in the format shown only; then, hidden in some, the shortcut hides it in every one, as Alt-click does.
  await perform(page, 'undo')
  await page.keyboard.press('Control+Shift+KeyH')
  await expect.poll(() => visible(page, 'bar')).toEqual([false, true])
  await page.keyboard.press('Alt+Control+Shift+KeyH')
  await expect.poll(() => visible(page, 'bar')).toEqual([false, false])
  expect(errors).toEqual([])
})
