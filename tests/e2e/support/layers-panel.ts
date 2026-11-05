// The layers panel specs' design and helpers: the tree and its frame and layer rows, what the panel
// lists, the layers in the document, and Tab into the tree.
import type { DesignInput } from '@dazbee/schema'

import { frameDesign } from './seed.ts'
import { read } from './stage.ts'
import { expect, type Page } from './test.ts'

/** A row's height in the panel, in pixels (LAYER_ROW in components/editor/flyouts/tree-row.tsx). */
export const ROW = 36
/** The square's frame row as `listed` gives it, for the designs `frameDesign` makes. */
export const SQUARE = 'Square 1080×1080'

export const rect = (x: number, y: number, width: number, height: number, color: string) => ({
  x,
  y,
  width,
  height,
  shape: { kind: 'rect' as const, cornerRadius: 16 },
  fills: [{ type: 'solid' as const, color }],
})

export const layersDesign = (): DesignInput =>
  frameDesign({
    name: 'Layers panel',
    nodes: {
      backdrop: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a0',
        name: 'Backdrop',
        props: rect(40, 40, 1000, 1000, '#F4EDE4FF'),
      },
      card: {
        type: 'group',
        parentId: 'sq',
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
      box: { type: 'graphic', parentId: 'sq', index: 'a2', name: 'Box', props: rect(120, 120, 400, 300, '#E0262BFF') },
      dot: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a3',
        name: 'Dot',
        props: { ...rect(700, 680, 200, 200, '#1F9D55FF'), shape: { kind: 'ellipse' as const } },
      },
    },
  })

export const tree = (page: Page) => page.getByRole('tree')
/** A layer's row, by the layer's name. */
export const row = (page: Page, name: string) =>
  tree(page)
    .getByRole('treeitem')
    .filter({ has: page.locator(`[data-testid="layer-name"]:text-is("${name}")`) })
/** A frame's row, by the frame's name. */
export const frameRow = (page: Page, name: string) =>
  tree(page)
    .getByRole('treeitem')
    .filter({ has: page.locator(`[data-testid="frame-name"]:text-is("${name}")`) })
/**
 * The rows as the panel lists them, top to bottom: a frame's as its name and size, a layer's as its
 * words, indented two spaces for each level it sits below the frames.
 */
export const listed = (page: Page) =>
  tree(page)
    .getByRole('treeitem')
    .evaluateAll((rows) =>
      rows
        .sort(
          (a, b) => Number.parseFloat((a as HTMLElement).style.top) - Number.parseFloat((b as HTMLElement).style.top),
        )
        .map((r) => {
          const text = (id: string) => r.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''
          const words = r.hasAttribute('data-frame') ? `${text('frame-name')} ${text('frame-size')}` : r.textContent
          return `${'  '.repeat(Number(r.getAttribute('aria-level')) - 1)}${words}`
        }),
    )
export const node = async (page: Page, id: string) =>
  (await read(page)).nodes[id] as unknown as { parentId: string; name: string; lock?: Record<string, boolean> }
/** The colour the export render draws at a design pixel of the square. */
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
