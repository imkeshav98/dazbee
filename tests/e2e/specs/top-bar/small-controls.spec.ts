// Controls for what the document already holds, with real input, each change one undo step: a
// boolean's operation changed in place, a mask's type, and a text's direction from ⋯ More.
import type { DesignInput } from '@dazbee/schema'

import { writeOutput } from '../../support/editor.ts'
import { copyIn, frameDesign, linkedFrames } from '../../support/seed.ts'
import { openStage, press, read, selectLayers } from '../../support/stage.ts'
import { expect, type Page, test } from '../../support/test.ts'
import { arrangeSubmenu, openCard } from '../../support/top-bar.ts'

test.describe.configure({ timeout: 180_000 })

const solid = (color: string) => [{ type: 'solid' as const, color }]
/** The Story frame on the cover page, holding linked copies of the square's layers. */
const STORY = 'p1-st'
/**
 * Two pages: the cover's square frame `p1-sq` holds the layers and its Story frame their linked
 * copies; the offer page has an empty frame of each size.
 */
const design = (): DesignInput => {
  const cover = linkedFrames(
    frameDesign({
      name: 'Controls',
      frameId: 'p1-sq',
      fills: solid('#FFF8F0FF'),
      nodes: {
        combo: {
          type: 'boolean',
          parentId: 'p1-sq',
          index: 'a0',
          name: 'Combo',
          props: { x: 80, y: 80, width: 400, height: 300, op: 'union', fills: solid('#E0157FFF') },
        },
        a: {
          type: 'graphic',
          parentId: 'combo',
          index: 'a0',
          name: 'A',
          props: { x: 80, y: 80, width: 300, height: 300, shape: { kind: 'ellipse' } },
        },
        b: {
          type: 'graphic',
          parentId: 'combo',
          index: 'a1',
          name: 'B',
          props: { x: 180, y: 80, width: 300, height: 300, shape: { kind: 'ellipse' } },
        },
        cutter: {
          type: 'graphic',
          parentId: 'p1-sq',
          index: 'a2',
          name: 'Cutter',
          props: {
            x: 560,
            y: 80,
            width: 400,
            height: 300,
            mask: 'alpha',
            shape: { kind: 'rect', cornerRadius: 40 },
            fills: [
              {
                type: 'linear',
                from: { x: 0, y: 0 },
                to: { x: 1, y: 0 },
                stops: [
                  { offset: 0, color: '#FFFFFFFF' },
                  { offset: 1, color: '#000000FF' },
                ],
              },
            ],
          },
        },
        under: {
          type: 'graphic',
          parentId: 'p1-sq',
          index: 'a3',
          name: 'Masked',
          props: { x: 560, y: 80, width: 400, height: 300, shape: { kind: 'rect' }, fills: solid('#3D6BFFFF') },
        },
        words: {
          type: 'text',
          parentId: 'p1-sq',
          index: 'a1',
          name: 'Words',
          props: {
            x: 80,
            y: 600,
            width: 900,
            height: 100,
            text: 'Cold brew 50%',
            style: { fontFamily: 'Noto Sans', fontSize: 72, color: '#1F2329FF' },
          },
        },
      },
    }),
    [{ id: STORY, name: 'Story', width: 1080, height: 1920 }],
  )
  const offer = solid('#1A1420FF')
  return {
    ...cover,
    pages: { p1: { name: 'Cover', order: 'a0' }, p2: { name: 'Offer', order: 'a1' } },
    frames: {
      ...cover.frames,
      'p2-sq': { pageId: 'p2', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, fills: offer, order: 'a0' },
      'p2-st': { pageId: 'p2', name: 'Story', width: 1080, height: 1920, x: 1280, y: 0, fills: offer, order: 'a1' },
    },
  }
}
/** A layer's values as the design holds them. */
const props = async (page: Page, id: string) => (await read(page)).nodes[id]?.props ?? {}

test("a boolean's operation and a mask's type change in place, one undo step each", async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await selectLayers(page, ['combo'])
  const combine = async () => await openCard(page, 'combine-card')
  for (const op of ['subtract', 'intersect', 'exclude', 'union']) {
    await (await combine()).locator(`[data-value="${op}"]`).click()
    await expect.poll(async () => (await props(page, 'combo')).op).toBe(op)
  }
  await (await combine()).locator('[data-value="subtract"]').click()
  await expect.poll(async () => (await props(page, 'combo')).op).toBe('subtract')
  // The change stays in the square: the Story copy keeps its union.
  expect((await props(page, copyIn(STORY, 'combo'))).op).toBe('union')
  // Still the one boolean in the square, not a new one around it.
  expect(
    await page.evaluate(
      (story) =>
        Object.entries(window.dazbee?.design().nodes ?? {}).filter(
          ([id, n]) => n.type === 'boolean' && !id.startsWith(`${story}-`),
        ).length,
      STORY,
    ),
  ).toBe(1)
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('controls-combine.png', await page.screenshot())
  await page.mouse.click(5, 400)
  // One undo step each: back to union, then to exclude.
  await press(page, 'undo')
  await expect.poll(async () => (await props(page, 'combo')).op).toBe('union')
  await press(page, 'undo')
  await expect.poll(async () => (await props(page, 'combo')).op).toBe('exclude')

  await selectLayers(page, ['cutter'])
  const mask = async () => await openCard(page, 'mask-card')
  await expect((await mask()).locator('[data-value="alpha"]')).toHaveAttribute('aria-checked', 'true')
  await (await mask()).locator('[data-value="luminance"]').click()
  await expect.poll(async () => (await props(page, 'cutter')).mask).toBe('luminance')
  // The change stays in the square: the Story copy is still an alpha mask.
  expect((await props(page, copyIn(STORY, 'cutter'))).mask).toBe('alpha')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('controls-mask.png', await page.screenshot())
  await page.mouse.click(5, 400)
  await press(page, 'undo')
  await expect.poll(async () => (await props(page, 'cutter')).mask).toBe('alpha')
  expect(errors).toEqual([])
})

test("a text's direction from the top bar's ⋯, one undo step", async ({ browser }) => {
  const { page, errors } = await openStage(browser, design())
  await selectLayers(page, ['words'])
  const menu = await arrangeSubmenu(page, 'text-direction')
  await expect(menu.locator('[data-direction="auto"]')).toHaveAttribute('aria-pressed', 'true')
  await menu.locator('[data-direction="rtl"]').click()
  await expect.poll(async () => (await props(page, 'words')).direction).toBe('rtl')
  await page.evaluate(() => window.dazbee?.drawn())
  writeOutput('controls-direction.png', await page.screenshot())
  await selectLayers(page, ['words'])
  await expect((await arrangeSubmenu(page, 'text-direction')).locator('[data-direction="rtl"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect((await read(page)).nodes.words?.props.direction).toBe('rtl')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await press(page, 'undo')
  await expect.poll(async () => (await props(page, 'words')).direction).toBe('auto')
  expect(errors).toEqual([])
})
