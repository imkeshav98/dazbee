// Redo from the keyboard: after Mod+Z, Mod+Shift+Z and Mod+Y each bring the change back, for a
// layer dragged on the canvas and for a colour picked in a panel, and Mod+Z takes it away again.
import type { DesignInput } from '@dazbee/schema'

import { designOf, writeOutput } from '../../support/editor.ts'
import { enter } from '../../support/fields.ts'
import { frameDesign } from '../../support/seed.ts'
import { drag, openStage, props } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { fillList } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput =>
  frameDesign({
    name: 'Redo keys',
    fills: [{ type: 'solid', color: '#FFF8F0FF' }],
    nodes: {
      box: {
        type: 'graphic',
        parentId: 'sq',
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

test('Mod+Shift+Z and Mod+Y redo what Mod+Z undid, for a drag on the canvas and a colour picked in the Colour panel', async ({
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

  // In a panel: the dragged box, still selected, painted pink in its Colour panel; Esc closes the
  // panel and leaves the focus on Colour.
  const list = await fillList(page)
  await enter(list.getByRole('textbox', { name: 'Colour 1 hex' }), 'FF48B0')
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()
  await expect
    .poll(async () => ((await props(page, 'box')) as { fills?: { color?: string }[] }).fills?.[0]?.color)
    .toBe('#FF48B0FF')
  const painted = await designOf(page)
  await undoAndRedo(page, dragged, painted)
  writeOutput('redo-keys-1-fill.png', await page.screenshot())
  expect(errors).toEqual([])
})
