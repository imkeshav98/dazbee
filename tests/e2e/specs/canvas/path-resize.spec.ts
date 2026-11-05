// A resized path's points in Chromium, with real pointer input (#278): after a corner drag scales
// a path, its points are edited where they are drawn, and dragging one moves it alone.
import type { DesignInput } from '@dazbee/schema'

import { placed, screenPoint, writeOutput } from '../../support/editor.ts'
import { frameDesign } from '../../support/seed.ts'
import { click, dragScreen, handle, openStage, press, read } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

const design: DesignInput = frameDesign({
  name: 'Path resize',
  nodes: {
    pen: {
      type: 'graphic',
      parentId: 'sq',
      index: 'a0',
      name: 'Pen',
      props: {
        x: 100,
        y: 100,
        width: 200,
        height: 160,
        shape: { kind: 'path', d: 'M0 0 L200 0 L100 160 Z', drawnIn: { width: 200, height: 160 } },
        fills: [{ type: 'solid', color: '#E02020FF' }],
      },
    },
  },
})

/** Drags the selection's south-east handle by a design offset. */
async function stretch(page: Page, dx: number, dy: number) {
  const from = await handle(page, 'se')
  const zoom = await page.evaluate(() => window.dazbee?.camera().zoom ?? 1)
  await dragScreen(page, from, { x: from.x + dx * zoom, y: from.y + dy * zoom })
}

test('a resized path edits from where its points are drawn', async ({ browser }) => {
  const { page, errors } = await openStage(browser, design)
  await click(page, 200, 140)
  await stretch(page, 200, 160)
  // Its points are drawn at 100,100, 500,100 and 300,420; the editor shows them there.
  await press(page, 'editPoints')
  const dot = page.locator('.path-anchor[data-anchor="0:1"]')
  const box = await dot.boundingBox()
  const want = await screenPoint(page, 500, 100)
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - want.x)).toBeLessThan(2)
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) / 2 - want.y)).toBeLessThan(2)
  // Dragging one moves it alone: the others stay where they are drawn.
  const zoom = await page.evaluate(() => window.dazbee?.camera().zoom ?? 1)
  await dragScreen(page, want, { x: want.x + 40 * zoom, y: want.y })
  const pen = placed(await read(page), 'pen') as {
    x: number
    y: number
    width: number
    height: number
    shape: { d: string; drawnIn: { width: number; height: number } }
  }
  expect(pen.shape.drawnIn).toEqual({ width: pen.width, height: pen.height })
  const points = [...pen.shape.d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [
    Number(m[1]) + pen.x,
    Number(m[2]) + pen.y,
  ])
  expect(points.slice(0, 3).map(([x, y]) => [Math.round(x ?? 0), Math.round(y ?? 0)])).toEqual([
    [100, 100],
    [540, 100],
    [300, 420],
  ])
  writeOutput('path-resize-4-edited.png', await page.screenshot())
  expect(errors).toEqual([])
})
