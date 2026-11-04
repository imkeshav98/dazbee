// The panels inventory (#235): every control in the editor's panels, one test per row, in Chromium
// with real input. Each spec in specs/panels-inventory holds a group of rows and calls
// setupInventory() at its top. Each control is used and the design checked: the document holds the
// change, the export draws it, one undo takes it back and redo brings it again, and it is there
// after a reload. The panel redesign runs the same list, so a control that goes missing fails here.
// Rows 64 to 68 (snap and rulers, the layers, assets and brand panels, export) are checked by their
// own specs: snapping, layers, assets with image-into-shape, brand-kit and export. Rows known to
// fail have their bug in KNOWN; such a test is expected to fail, and passes once the bug is fixed.
import type { DesignInput } from '@dazbee/schema'

import { photo, tile, upload } from './assets.ts'
import { designOf, placed, writeOutput } from './editor.ts'
import { newBrand, putKit } from './seed.ts'
import { nextFrame, openStage, perform } from './stage.ts'
import { type Browser, expect, type Page, test } from './test.ts'

type Props = Record<string, unknown> & {
  style?: Record<string, unknown>
  fills?: Record<string, unknown>[]
  strokes?: Record<string, unknown>[]
  effects?: Record<string, unknown>[]
}
type Doc = {
  meta: { primaryFormatId: string }
  formats: Record<string, { name: string; order: string; width: number; height: number }>
  pages: Record<string, { name: string; order: string; fills: Record<string, unknown>[] }>
  nodes: Record<
    string,
    {
      type: string
      parentId: string
      index: string
      name: string
      lock?: Record<string, boolean>
      bindings?: Record<string, string>
      props: Props
    }
  >
  overrides: Record<string, Record<string, Props>>
}

/** Rows that fail today, with the bug filed for each. */
const KNOWN: Record<number, number> = {}

const KIT = {
  colors: [
    { token: 'berry', name: 'Berry', value: '#FF3D6EFF' },
    { token: 'roast', name: 'Roast', value: '#2A140AFF' },
  ],
  fonts: [{ token: 'body', name: 'Body', family: 'Noto Sans' }],
}

export let brandId: string
export let assets: { photo: string; tile: string }

export function setupInventory() {
  // Each row opens its own design, so CI spreads the rows over its shards.
  test.describe.configure({ mode: 'parallel', timeout: 180_000 })
  // A control that isn't there fails the row soon, not at the end of its time.
  test.use({ actionTimeout: 15_000 })
  test.beforeAll(async () => {
    brandId = await newBrand('e2e panels-inventory')
    assets = { photo: (await upload(photo, { brandId })).id, tile: (await upload(tile, { brandId })).id }
    await putKit(brandId, KIT)
  })
  return row
}

export const solid = (color: string) => [{ type: 'solid' as const, color }]
export const doc = async (page: Page) => JSON.parse(await designOf(page)) as Doc
/** A layer's props as the Square format shows them. */
export const props = async (page: Page, id: string) => placed(await doc(page), id, 'sq') as Props
export const style = async (page: Page, id: string) => (await props(page, id)).style ?? {}
export const fills = async (page: Page, id: string) => (await props(page, id)).fills ?? []

/** SHA-256 of the Square's PNG export, which waits for every image and font it draws. */
const picture = (page: Page) =>
  page.evaluate(async () => {
    const file = await window.dazbee?.exportFiles({ pageIds: ['p1'], formatIds: ['sq'], type: 'png' })
    if (!file) throw new Error('no editor')
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(file.bytes))
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  })

/**
 * Does one thing with a control and checks it: `check` sees the change, the design is no longer
 * what it was and draws differently (unless `draws` is false, for a change the picture doesn't
 * show), one undo puts back exactly what was there, and redo brings the change again.
 */
export async function step(page: Page, act: () => Promise<unknown>, check: () => Promise<void>, { draws = true } = {}) {
  const before = await designOf(page)
  const drawn = draws ? await picture(page) : ''
  await act()
  await check()
  await expect.poll(() => designOf(page), { message: 'the design changed' }).not.toBe(before)
  const after = await designOf(page)
  if (draws)
    await expect.poll(() => picture(page), { message: 'the design draws differently', timeout: 20_000 }).not.toBe(drawn)
  await perform(page, 'undo')
  await expect.poll(() => designOf(page), { message: 'one undo puts it back' }).toBe(before)
  await perform(page, 'redo')
  await expect.poll(() => designOf(page), { message: 'redo brings it again' }).toBe(after)
  // The panels draw the redone design before the next control is used.
  await nextFrame(page)
}

const rect = (x: number, y: number, width: number, height: number, color: string) => ({
  x,
  y,
  width,
  height,
  shape: { kind: 'rect' as const, cornerRadius: 16 },
  fills: solid(color),
})

/** One of each kind of layer the panels have cards for, in a Square format, and a Story with `withStory`. */
const design = (withStory = false): DesignInput => ({
  meta: {
    designId: 'replaced-by-the-api',
    name: 'Panels inventory',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    ...(withStory ? { story: { name: 'Story', width: 1080, height: 1920, order: 'a1' } } : {}),
  },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: solid('#FFFFFFFF') } },
  nodes: {
    box: { type: 'graphic', parentId: 'p1', index: 'a0', name: 'Box', props: rect(80, 80, 300, 200, '#E0262BFF') },
    dot: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a1',
      name: 'Dot',
      props: { ...rect(700, 120, 240, 240, '#2F6BFFFF'), shape: { kind: 'ellipse' } },
    },
    poly: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a2',
      name: 'Hex',
      props: { ...rect(420, 80, 160, 160, '#FCA311FF'), shape: { kind: 'polygon', sides: 6, cornerRadius: 0 } },
    },
    star: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a3',
      name: 'Star',
      props: {
        ...rect(900, 400, 160, 160, '#8E44ADFF'),
        shape: { kind: 'star', points: 5, innerRadius: 0.4, cornerRadius: 0 },
      },
    },
    rule: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a4',
      name: 'Rule',
      props: {
        x: 80,
        y: 300,
        width: 300,
        height: 120,
        shape: { kind: 'line', start: 'none', end: 'none' },
        fills: [],
        strokes: [{ paint: { type: 'solid', color: '#1A1420FF' }, width: 8, align: 'center' }],
      },
    },
    photo: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a5',
      name: 'Photo',
      props: {
        x: 420,
        y: 260,
        width: 240,
        height: 180,
        shape: { kind: 'rect', cornerRadius: 0 },
        fills: [{ type: 'image', assetId: assets.photo, fit: 'fill' }],
      },
    },
    headline: {
      type: 'text',
      parentId: 'p1',
      index: 'a6',
      name: 'Headline',
      props: {
        x: 80,
        y: 480,
        width: 760,
        height: 260,
        boxMode: 'fixed',
        text: 'Summer sale\nAll week long',
        style: { fontFamily: 'Noto Sans', fontSize: 72, fontWeight: 800, color: '#111111FF' },
      },
    },
    stack: {
      type: 'box',
      parentId: 'p1',
      index: 'a7',
      name: 'Stack',
      props: {
        x: 80,
        y: 760,
        width: 600,
        height: 160,
        fills: solid('#F4EDE4FF'),
        layout: { direction: 'row', gap: 16, padding: { top: 20, right: 20, bottom: 20, left: 20 } },
      },
    },
    chip1: {
      type: 'graphic',
      parentId: 'stack',
      index: 'a0',
      name: 'Chip 1',
      props: rect(100, 780, 120, 120, '#FCA311FF'),
    },
    chip2: {
      type: 'graphic',
      parentId: 'stack',
      index: 'a1',
      name: 'Chip 2',
      props: rect(236, 780, 120, 120, '#14213DFF'),
    },
    plain: {
      type: 'box',
      parentId: 'p1',
      index: 'a8',
      name: 'Plain',
      props: { x: 720, y: 760, width: 300, height: 280, fills: solid('#DDEEFFFF') },
    },
    tile1: {
      type: 'graphic',
      parentId: 'plain',
      index: 'a0',
      name: 'Tile 1',
      props: rect(740, 780, 100, 100, '#11744AFF'),
    },
    tile2: {
      type: 'graphic',
      parentId: 'plain',
      index: 'a1',
      name: 'Tile 2',
      props: rect(900, 900, 100, 100, '#C8156AFF'),
    },
  },
  overrides: {},
})

/**
 * One row of the inventory: a test named by its number, expected to fail while its bug is open. A
 * failing row leaves a screenshot of where it stopped.
 */
function row(n: number, title: string, body: (open: (withStory?: boolean) => Promise<Page>) => Promise<void>) {
  const name = String(n).padStart(2, '0')
  test(`${name} ${title}`, async ({ browser }: { browser: Browser }) => {
    test.fail(n in KNOWN, `#${KNOWN[n]}`)
    let page: Page | undefined
    try {
      await body(async (withStory = false) => {
        page = (await openStage(browser, design(withStory), { brandId })).page
        return page
      })
    } catch (error) {
      if (page) writeOutput(`inventory-${name}.png`, await page.screenshot())
      throw error
    } finally {
      await page?.context().close()
    }
  })
}
