// The keyboard shortcuts list (#158) in Chromium: it opens with ? and from the View card's keyboard
// button, lists every shortcut of the editor's table in its groups, never opens while typing, and
// closes with Esc.
import { SHORTCUTS } from '@dazbee/editor'
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../../support/editor.ts'
import { frameDesign } from '../../support/seed.ts'
import { openStage, selectLayers } from '../../support/stage.ts'
import { expect, test } from '../../support/test.ts'
import { fillList } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput =>
  frameDesign({
    name: 'Shortcuts',
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
          shape: { kind: 'rect' },
          fills: [{ type: 'solid', color: '#E0262BFF' }],
        },
      },
    },
  })

test('? and the keyboard button list every shortcut, F, I and Mod+Alt+G among them', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  const list = page.getByTestId('shortcuts')
  await expect(list).toBeHidden()

  await page.keyboard.press('Shift+Slash')
  await expect(list).toBeVisible()
  await expect(list.getByRole('heading', { level: 2 })).toHaveText('Keyboard shortcuts')
  await expect(list.locator('[data-shortcut]')).toHaveCount(SHORTCUTS.length)
  await expect(list.locator('[data-shortcut="bringForward"] kbd')).toHaveText(['Ctrl', ']'])
  await expect(list.locator('[data-shortcut="toolFrame"]')).toContainText('F')
  await expect(list.locator('[data-shortcut="toolImage"]')).toContainText('I')
  await expect(list.locator('[data-shortcut="boxSelection"]')).toContainText('G')
  await expect(list.locator('[data-shortcut="boxSelection"]')).toContainText('Put in a box')
  writeOutput('shortcuts.png', await page.screenshot())
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()

  // Typing ? into a field types it: the box's fill hex, in its Colour panel.
  await selectLayers(page, ['box'], { bar: true })
  const hex = (await fillList(page)).getByRole('textbox', { name: 'Colour 1 hex' })
  await hex.fill('')
  await hex.press('Shift+Slash')
  await expect(hex).toHaveValue('?')
  await expect(list).toBeHidden()
  await hex.press('Escape')

  await page.getByRole('group', { name: 'Zoom' }).getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await expect(list).toBeVisible()
  await list.getByRole('button', { name: 'Close' }).click()
  await expect(list).toBeHidden()
  expect(errors).toEqual([])
})
