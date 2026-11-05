// The design and helpers of the Export lists frames specs: page Summer holding four frames, two
// named Sale, and page Diwali holding one; opening it at a screen size; and the frames list's rows.
import type { DesignInput } from '@dazbee/schema'

import { solid } from './edit-in-frame.ts'
import { editorPath, setCookies } from './editor.ts'
import { frameDesign, linkedFrames, seed } from './seed.ts'
import { fitSettled } from './stage.ts'
import { type Browser, expect, type Locator } from './test.ts'

/**
 * Page "Summer": Sale (a square), Sale (a story linked to it), Banner and sale (a medium rectangle),
 * each a headline and a badge; page "Diwali": one frame, Sale, its own headline.
 */
export const design = (): DesignInput => {
  const summer = linkedFrames(
    frameDesign({
      name: 'Weekend sale',
      frameName: 'Sale',
      fills: solid('#FFD23FFF'),
      nodes: {
        headline: {
          type: 'text',
          parentId: 'sq',
          index: 'a0',
          name: 'Headline',
          props: {
            x: 80,
            y: 80,
            width: 920,
            height: 140,
            text: 'Weekend sale',
            style: { fontFamily: 'Noto Sans', fontSize: 110, fontWeight: 800, color: '#15121AFF' },
          },
        },
        badge: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a1',
          name: 'Badge',
          props: {
            x: 560,
            y: 520,
            width: 420,
            height: 420,
            shape: { kind: 'star', points: 10, innerRadius: 0.75 },
            fills: solid('#FF48B0FF'),
          },
        },
      },
    }),
    [
      { id: 'story', name: 'Sale', width: 1080, height: 1920, values: { badge: { y: 1300 } } },
      {
        id: 'banner',
        name: 'Banner',
        width: 1200,
        height: 628,
        values: { headline: { width: 700 }, badge: { x: 820, y: 160, width: 300, height: 300 } },
      },
      {
        id: 'mpu',
        name: 'sale',
        width: 300,
        height: 250,
        values: {
          headline: {
            x: 20,
            y: 20,
            width: 260,
            height: 40,
            style: { fontFamily: 'Noto Sans', fontSize: 28, fontWeight: 800, color: '#15121AFF' },
          },
          badge: { x: 180, y: 130, width: 100, height: 100 },
        },
      },
    ],
  )
  return {
    ...summer,
    pages: { p1: { name: 'Summer', order: 'a0' }, p2: { name: 'Diwali', order: 'a1' } },
    frames: {
      ...summer.frames,
      one: {
        pageId: 'p2',
        name: 'Sale',
        width: 1080,
        height: 1080,
        x: 0,
        y: 0,
        fills: solid('#15121AFF'),
        order: 'a0',
      },
    },
    nodes: {
      ...summer.nodes,
      offer: {
        type: 'text',
        parentId: 'one',
        link: 'offer',
        index: 'a0',
        name: 'Offer',
        props: {
          x: 80,
          y: 460,
          width: 920,
          height: 140,
          text: '30% off',
          style: { fontFamily: 'Noto Sans', fontSize: 120, fontWeight: 800, color: '#FFFFFFFF' },
        },
      },
    },
  }
}

/** The first page's frames in its order, and the names Export lists them by. */
export const SUMMER = ['sq', 'story', 'banner', 'mpu']
export const LISTED = ['Sale', 'Sale 2', 'Banner', 'sale 3']

/** Opens the design alone in a tab of a theme at a screen size, fitted, with its fonts loaded. */
export async function openSized(browser: Browser, viewport: { width: number; height: number }, theme = 'dark') {
  const designId = await seed(design())
  const page = await (await browser.newContext({ viewport, acceptDownloads: true })).newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await setCookies(page, { theme })
  await page.goto(editorPath(designId))
  await expect(page.getByTestId('status')).toHaveAttribute('data-ready', '', { timeout: 60_000 })
  await page.evaluate(() => window.dazbee?.loaded())
  await fitSettled(page)
  return { page, errors }
}

/** Each row of the frames list: its name, its size and whether it is ticked, the All frames row first when it shows. */
export const rows = (dialog: Locator) =>
  dialog
    .getByTestId('export-frames')
    .locator('label')
    .evaluateAll((labels) =>
      labels.map((label) => {
        const input = label.querySelector('input')
        const [name, size] = [...label.querySelectorAll('span:not([aria-hidden])')].map((span) => span.textContent)
        return {
          name,
          size,
          on: input?.indeterminate ? 'mixed' : (input?.checked ?? false),
          frame: input?.dataset.frame,
        }
      }),
    )
export const names = async (dialog: Locator) => (await rows(dialog)).map((row) => row.name)
