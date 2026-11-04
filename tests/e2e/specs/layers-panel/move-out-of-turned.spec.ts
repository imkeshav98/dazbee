// A layer dragged out of a turned group in the layers panel, in Chromium with real input, stays where
// it is drawn: its own colour has the same pixels and centre before and after, in both formats, and
// one undo step puts it back in the group.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../../support/editor.ts'
import { openStage, read } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

const design = (): DesignInput => ({
  meta: {
    designId: 'replaced-by-the-api',
    name: 'Turned group',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    wide: { name: 'Wide', width: 1600, height: 900, order: 'a1' },
  },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    turned: {
      type: 'group',
      parentId: 'p1',
      index: 'a0',
      name: 'Turned',
      props: { x: 200, y: 200, width: 500, height: 400, rotation: 30 },
    },
    red: {
      type: 'graphic',
      parentId: 'turned',
      index: 'a0',
      name: 'Red',
      props: {
        x: 200,
        y: 200,
        width: 260,
        height: 160,
        shape: { kind: 'rect' },
        fills: [{ type: 'solid', color: '#E02020FF' }],
      },
    },
    blue: {
      type: 'graphic',
      parentId: 'turned',
      index: 'a1',
      name: 'Blue',
      props: {
        x: 480,
        y: 420,
        width: 220,
        height: 180,
        shape: { kind: 'rect' },
        fills: [{ type: 'solid', color: '#2050E0FF' }],
      },
    },
    plain: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a1',
      name: 'Plain',
      props: {
        x: 700,
        y: 800,
        width: 200,
        height: 120,
        shape: { kind: 'rect' },
        fills: [{ type: 'solid', color: '#10A050FF' }],
      },
    },
  },
  overrides: { 'format:wide': { turned: { rotation: -15 } } },
})

/** Where a colour is drawn in a format: its pixel count and centre. */
const mark = (page: Page, formatId: string, rgb: [number, number, number]) =>
  page.evaluate(
    ({ formatId, rgb }) => {
      const pixels = window.dazbee?.exportPixels('p1', formatId)
      const width = formatId === 'sq' ? 1080 : 1600
      let n = 0
      let sx = 0
      let sy = 0
      if (pixels) {
        for (let i = 0; i < pixels.length; i += 4) {
          if (
            Math.abs((pixels[i] ?? 0) - rgb[0]) < 8 &&
            Math.abs((pixels[i + 1] ?? 0) - rgb[1]) < 8 &&
            Math.abs((pixels[i + 2] ?? 0) - rgb[2]) < 8
          ) {
            n++
            sx += (i / 4) % width
            sy += Math.floor(i / 4 / width)
          }
        }
      }
      return { n, x: sx / Math.max(n, 1), y: sy / Math.max(n, 1) }
    },
    { formatId, rgb },
  )

const RED: [number, number, number] = [224, 32, 32]
const BLUE: [number, number, number] = [32, 80, 224]

test('a layer dragged out of a turned group in the layers panel stays where it is drawn, in both formats', async ({
  browser,
}) => {
  const { page, errors } = await openStage(browser, design())
  const before = {
    sq: { red: await mark(page, 'sq', RED), blue: await mark(page, 'sq', BLUE) },
    wide: { red: await mark(page, 'wide', RED), blue: await mark(page, 'wide', BLUE) },
  }
  await page.locator('[data-panel="layers"]').click()
  const tree = page.getByRole('tree')
  const row = (name: string) =>
    tree.getByRole('treeitem').filter({ has: page.locator(`[data-testid="layer-name"]:text-is("${name}")`) })
  await row('Turned').getByRole('button', { name: 'Expand Turned' }).click()
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('move-out-1-before.png', await page.screenshot())
  // Red goes above Plain, on the page itself.
  await row('Red').dragTo(row('Plain'), { targetPosition: { x: 60, y: 3 } })
  await expect.poll(async () => (await read(page)).nodes.red?.parentId).toBe('p1')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('move-out-2-after.png', await page.screenshot())
  for (const formatId of ['sq', 'wide'] as const) {
    for (const [name, rgb] of [
      ['red', RED],
      ['blue', BLUE],
    ] as const) {
      const was = before[formatId][name]
      const now = await mark(page, formatId, rgb)
      expect(was.n, `${formatId} ${name} drawn`).toBeGreaterThan(1000)
      expect(Math.abs(now.n - was.n) / was.n, `${formatId} ${name} pixels`).toBeLessThan(0.01)
      expect(Math.hypot(now.x - was.x, now.y - was.y), `${formatId} ${name} centre`).toBeLessThan(0.5)
    }
  }
  // One undo step puts it back in the group, drawn the same.
  await page.evaluate(() => window.dazbee?.perform('undo'))
  await expect.poll(async () => (await read(page)).nodes.red?.parentId).toBe('turned')
  const back = await mark(page, 'sq', RED)
  expect(Math.hypot(back.x - before.sq.red.x, back.y - before.sq.red.y)).toBeLessThan(0.5)
  expect(errors).toEqual([])
})
