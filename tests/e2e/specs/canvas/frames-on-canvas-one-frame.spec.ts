// Frames on the canvas on a page holding a single frame, a square with one dot: its label picks it,
// the arrows move it, Duplicate puts the copy 200 px past it, and Delete leaves the page empty with
// its hint, each one undo step. The page of several frames is in frames-on-canvas.spec.ts.
import { openTabs } from '../../support/editor.ts'
import { clickLabel, picked } from '../../support/frames-on-canvas.ts'
import { frameDesign, layersIn, seed } from '../../support/seed.ts'
import { drawn, press, read } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 180_000 })

/** The square holding a dot, alone on its page. */
const LONE = frameDesign({
  name: 'One frame',
  nodes: {
    dot: {
      type: 'graphic',
      parentId: 'sq',
      index: 'a0',
      name: 'Dot',
      props: { x: 100, y: 100, width: 200, height: 200, shape: { kind: 'ellipse' } },
    },
  },
})

const frameOf = async (page: Page, id: string) => (await read(page)).frames[id]

test('a page holding a single frame: its label picks it, the arrows move it, Duplicate puts the copy beside it and Delete leaves the page empty with its hint, each one undo step', async ({
  browser,
}) => {
  const { tabs, errors } = await openTabs(browser, 1, await seed(LONE))
  const page = tabs[0] as Page
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => window.dazbee?.setCamera({ x: 300, y: 180, zoom: 0.5 }))
  await drawn(page)
  await clickLabel(page, 'sq')
  expect(await picked(page)).toBe('sq')
  await expect(page.getByTestId('top-bar')).toHaveAttribute('data-frame', 'sq')
  await page.keyboard.press('ArrowRight')
  await drawn(page)
  expect(await frameOf(page, 'sq')).toMatchObject({ x: 1, y: 0 })
  await press(page, 'undo')
  expect(await frameOf(page, 'sq')).toMatchObject({ x: 0, y: 0 })

  // The copy goes 200 px past the frame, its top aligned, holding a linked copy of the dot.
  await press(page, 'duplicate')
  const copy = (await picked(page)) ?? ''
  const before = await read(page)
  expect(before.frames[copy]).toMatchObject({ name: 'Square', x: 1280, y: 0, width: 1080, height: 1080 })
  expect(layersIn(before, copy).map(([, node]) => node.link)).toEqual(['dot'])
  await press(page, 'undo')
  expect(await frameOf(page, copy)).toBeUndefined()

  // Deleting the one frame leaves the page empty, saying how to add one; the toast's Undo brings it back.
  await clickLabel(page, 'sq')
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('empty-page')).toBeVisible()
  expect(Object.keys((await read(page)).frames)).toEqual([])
  await page.getByTestId('removed-toast').getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId('empty-page')).toHaveCount(0)
  expect(layersIn(await read(page), 'sq')).toEqual(layersIn(before, 'sq'))
  expect(errors).toEqual([])
})
