// Redo from the keyboard: after Mod+Z, Mod+Shift+Z and Mod+Y each bring the change back, for a
// layer dragged on the canvas and for a colour picked in a panel, and Mod+Z takes it away again.
import type { DesignInput } from '@dazbee/schema'

import { designOf, writeOutput } from '../../support/editor.ts'
import { backgroundPanel, drag, openStage, props } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput => ({
  meta: { designId: 'replaced-by-the-api', name: 'Redo keys', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFF8F0FF' }] } },
  nodes: {
    box: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Box',
      props: {
        x: 80,
        y: 80,
        width: 300,
        height: 200,
        shape: { kind: 'rect', cornerRadius: 24 },
        fills: [{ type: 'solid', color: '#FF5A36FF' }],
      },
    },
  },
  overrides: {},
})

/** Undoes the change with Mod+Z, then brings it back with each redo key in turn, undoing it again between them. */
async function undoAndRedo(page: Page, before: string, after: string) {
  for (const redo of ['ControlOrMeta+Shift+KeyZ', 'ControlOrMeta+KeyY']) {
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(() => designOf(page), { message: 'Mod+Z undoes the change' }).toBe(before)
    await page.keyboard.press(redo)
    await expect.poll(() => designOf(page), { message: `${redo} redoes it` }).toBe(after)
  }
}

test('Mod+Shift+Z and Mod+Y redo what Mod+Z undid, for a drag on the canvas and a colour picked in the page Background panel', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())

  // On the canvas: the box dragged by 100 × 50.
  const start = await designOf(page)
  await drag(page, { x: 230, y: 180 }, { x: 330, y: 230 })
  await expect.poll(async () => (await props(page, 'box')).x).not.toBe(80)
  const dragged = await designOf(page)
  await undoAndRedo(page, start, dragged)
  writeOutput('redo-keys-0-drag.png', await page.screenshot())

  // In a panel: the page picked, its Background panel paints it pink; Esc closes the panel and
  // leaves the focus on Background.
  await page.keyboard.press('Escape')
  const panel = await backgroundPanel(page)
  await panel.getByTestId('colour-pick').click()
  const hex = panel.getByTestId('colour-picker').getByRole('textbox', { name: 'Colour hex' })
  await hex.fill('FF48B0')
  await hex.press('Enter')
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect
    .poll(
      async () =>
        (JSON.parse(await designOf(page)) as { pages: Record<string, { fills: { color: string }[] }> }).pages.p1
          ?.fills[0]?.color,
    )
    .toBe('#FF48B0FF')
  const painted = await designOf(page)
  await undoAndRedo(page, dragged, painted)
  writeOutput('redo-keys-1-page.png', await page.screenshot())
  expect(errors).toEqual([])
})
