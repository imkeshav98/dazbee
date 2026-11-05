// A layer dragged out of a turned group in the layers panel, in Chromium with real input, stays where
// it is drawn: its own colour has the same pixels and centre before and after, in the frame it is
// moved in, while the linked frame is drawn and stored as it was; one undo step puts it back in the
// group. It is done in each of two linked frames, whose groups are turned differently.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../../support/editor.ts'
import { copyIn, frameDesign, linkedFrames } from '../../support/seed.ts'
import { openStage, read } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'

test.describe.configure({ timeout: 120_000 })

/** A turned group in a square frame, and its linked copy in a wide frame turned the other way. */
const design = (): DesignInput =>
  linkedFrames(
    frameDesign({
      name: 'Turned group',
      nodes: {
        turned: {
          type: 'group',
          parentId: 'sq',
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
          parentId: 'sq',
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
    }),
    [{ id: 'wide', name: 'Wide', width: 1600, height: 900, values: { turned: { rotation: -15 } } }],
  )

const FRAMES = ['sq', 'wide'] as const
type FrameId = (typeof FRAMES)[number]
/** A layer of the square, or its linked copy in the wide frame. */
const idIn = (frameId: FrameId, id: string) => (frameId === 'sq' ? id : copyIn(frameId, id))

/** Where a colour is drawn in a frame: its pixel count and centre. */
const mark = (page: Page, frameId: FrameId, rgb: [number, number, number]) =>
  page.evaluate(
    ({ frameId, rgb }) => {
      const pixels = window.dazbee?.exportPixels(frameId)
      const width = frameId === 'sq' ? 1080 : 1600
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
    { frameId, rgb },
  )
/** The layers of a frame as the design stores them, as JSON. */
const stored = async (page: Page, frameId: FrameId) => {
  const { nodes } = await read(page)
  return JSON.stringify(Object.entries(nodes).filter(([id]) => id.startsWith('wide-') === (frameId === 'wide')))
}

const RED: [number, number, number] = [224, 32, 32]
const BLUE: [number, number, number] = [32, 80, 224]

for (const frameId of FRAMES) {
  const other: FrameId = frameId === 'sq' ? 'wide' : 'sq'
  test(`a layer dragged out of a turned group in the layers panel stays where it is drawn, in the ${frameId} frame only`, async ({
    browser,
  }) => {
    const { page, errors } = await openStage(browser, design())
    const marks = async (f: FrameId) => ({ red: await mark(page, f, RED), blue: await mark(page, f, BLUE) })
    const before = { [frameId]: await marks(frameId), [other]: await marks(other) }
    const otherStored = await stored(page, other)
    // The panel shows the selection's frame: a layer of this frame is selected first.
    await page.evaluate((id) => window.dazbee?.select([id]), idIn(frameId, 'plain'))
    await page.locator('[data-panel="layers"]').click()
    const tree = page.getByRole('tree')
    const row = (name: string) =>
      tree.getByRole('treeitem').filter({ has: page.locator(`[data-testid="layer-name"]:text-is("${name}")`) })
    await row('Turned').getByRole('button', { name: 'Expand Turned' }).click()
    await page.evaluate(() => window.dazbee?.drawn())
    writeOutput(`move-out-${frameId}-1-before.png`, await page.screenshot())
    // Red goes above Plain, at the top of its frame.
    const red = idIn(frameId, 'red')
    await row('Red').dragTo(row('Plain'), { targetPosition: { x: 60, y: 3 } })
    await expect.poll(async () => (await read(page)).nodes[red]?.parentId).toBe(frameId)
    await page.evaluate(() => window.dazbee?.drawn())
    writeOutput(`move-out-${frameId}-2-after.png`, await page.screenshot())
    for (const f of [frameId, other] as const) {
      for (const [name, rgb] of [
        ['red', RED],
        ['blue', BLUE],
      ] as const) {
        const was = before[f]?.[name] ?? { n: 0, x: 0, y: 0 }
        const now = await mark(page, f, rgb)
        expect(was.n, `${f} ${name} drawn`).toBeGreaterThan(1000)
        expect(Math.abs(now.n - was.n) / was.n, `${f} ${name} pixels`).toBeLessThan(0.01)
        expect(Math.hypot(now.x - was.x, now.y - was.y), `${f} ${name} centre`).toBeLessThan(0.5)
      }
    }
    // The linked frame's red is still in its group, and its layers are stored as they were.
    expect((await read(page)).nodes[idIn(other, 'red')]?.parentId).toBe(idIn(other, 'turned'))
    expect(await stored(page, other)).toBe(otherStored)
    // One undo step puts it back in the group, drawn the same.
    await page.evaluate(() => window.dazbee?.perform('undo'))
    await expect.poll(async () => (await read(page)).nodes[red]?.parentId).toBe(idIn(frameId, 'turned'))
    const back = await mark(page, frameId, RED)
    const was = before[frameId]?.red ?? { x: 0, y: 0 }
    expect(Math.hypot(back.x - was.x, back.y - was.y)).toBeLessThan(0.5)
    expect(errors).toEqual([])
  })
}
