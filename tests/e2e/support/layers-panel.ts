// The layers panel specs' design and helpers: the tree and its rows, what the panel lists, the
// layers in the document, and Tab into the tree.
import type { DesignInput } from '@dazbee/schema'

import { read } from './stage.ts'
import { expect, type Page } from './test.ts'

/** A row's height in the panel, in pixels (LAYER_ROW in components/editor/flyouts/layer-row.tsx). */
export const ROW = 36

export const rect = (x: number, y: number, width: number, height: number, color: string) => ({
  x,
  y,
  width,
  height,
  shape: { kind: 'rect' as const, cornerRadius: 16 },
  fills: [{ type: 'solid' as const, color }],
})

export const layersDesign = (): DesignInput => ({
  meta: {
    designId: 'replaced-by-the-api',
    name: 'Layers panel',
    kind: 'single',
    primaryFormatId: 'sq',
  },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0', fills: [{ type: 'solid', color: '#FFFFFFFF' }] } },
  nodes: {
    backdrop: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Backdrop',
      props: rect(40, 40, 1000, 1000, '#F4EDE4FF'),
    },
    card: {
      type: 'group',
      parentId: 'p1',
      index: 'a1',
      name: 'Card',
      props: { x: 120, y: 620, width: 520, height: 300 },
    },
    c1: {
      type: 'graphic',
      parentId: 'card',
      index: 'a0',
      name: 'Card back',
      props: rect(120, 620, 520, 300, '#14213DFF'),
    },
    c2: {
      type: 'graphic',
      parentId: 'card',
      index: 'a1',
      name: 'Card stripe',
      props: rect(160, 660, 440, 60, '#FCA311FF'),
    },
    box: { type: 'graphic', parentId: 'p1', index: 'a2', name: 'Box', props: rect(120, 120, 400, 300, '#E0262BFF') },
    dot: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a3',
      name: 'Dot',
      props: { ...rect(700, 680, 200, 200, '#1F9D55FF'), shape: { kind: 'ellipse' as const } },
    },
  },
  overrides: {},
})

export const tree = (page: Page) => page.getByRole('tree')
export const row = (page: Page, name: string) =>
  tree(page)
    .getByRole('treeitem')
    .filter({ has: page.locator(`[data-testid="layer-name"]:text-is("${name}")`) })
/** The rows' names as the panel lists them, top to bottom. */
export const listed = (page: Page) =>
  tree(page)
    .getByRole('treeitem')
    .evaluateAll((rows) =>
      rows
        .sort(
          (a, b) => Number.parseFloat((a as HTMLElement).style.top) - Number.parseFloat((b as HTMLElement).style.top),
        )
        .map((r) => `${'  '.repeat(Number(r.getAttribute('aria-level')) - 1)}${r.textContent}`),
    )
export const node = async (page: Page, id: string) =>
  (await read(page)).nodes[id] as unknown as { parentId: string; name: string; lock?: Record<string, boolean> }
/** The colour the export render draws at a design pixel. */
export const colourAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => {
      const pixels = window.dazbee?.exportPixels()
      const at = (y * 1080 + x) * 4
      return pixels ? [pixels[at], pixels[at + 1], pixels[at + 2]] : null
    },
    [x, y] as const,
  )

export async function openLayers(page: Page) {
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  await expect(tree(page)).toBeVisible()
}

/** Tabs from the Layers button until the focus is on a row, at most eight times. */
export async function tabIntoTree(page: Page) {
  await page.getByRole('button', { name: 'Layers', exact: true }).focus()
  for (
    let i = 0;
    i < 8 && !(await page.evaluate(() => document.activeElement?.getAttribute('role') === 'treeitem'));
    i++
  )
    await page.keyboard.press('Tab')
}

/** The ids of the layers in the document. */
export const layerIds = async (page: Page) => Object.keys((await read(page)).nodes)
