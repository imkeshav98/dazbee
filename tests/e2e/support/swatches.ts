// The swatch rows of the Colour panel and the frame Background panel built on it, as the swatch
// tests measure them: a brand kit that fills the kit's row, each row with the size and spacing its
// swatches keep on a tablet or desktop, the touch target rule a phone holds them to, the two panels
// opened with + showing its paint editor, and each swatch button's box in a row.
import type { BrandKit } from '@dazbee/schema'

import { clickLabel } from './frames-on-canvas.ts'
import type { Rect } from './layout.ts'
import { expect, type Locator, type Page } from './test.ts'
import { barMenu, entered } from './top-bar.ts'

/** A swatch row, by what holds it in the panel, with its swatches' size and the space between them off a phone. */
export interface SwatchRow {
  row: string
  selector: string
  size: number
  gap: number
}

/** A panel that shows swatch rows, and how to open it on the frames-on-canvas design. */
export interface SwatchPanel {
  name: string
  open: (page: Page) => Promise<Locator>
}

/** A kit with enough colours that its row wraps on a phone. */
export const SWATCH_KIT: Partial<BrandKit> = {
  colors: [
    { token: 'berry', name: 'Berry', value: '#FF3D6EFF' },
    { token: 'roast', name: 'Roast', value: '#2A140AFF' },
    { token: 'cream', name: 'Cream', value: '#FBF1E1FF' },
    { token: 'leaf', name: 'Leaf', value: '#2E9E5BFF' },
    { token: 'sky', name: 'Sky', value: '#3D9BFFFF' },
    { token: 'sun', name: 'Sun', value: '#FFC83DFF' },
    { token: 'plum', name: 'Plum', value: '#6B2E8AFF' },
    { token: 'ink', name: 'Ink', value: '#15121AFF' },
  ],
}

/** On a phone a tap target is at least this many px across, and this far from the next one. */
export const TOUCH_TARGET = { size: 44, gap: 8 } as const

/** The brand colours of the paint editor that + opens, the panel's last swatch row. */
export const PAINT_EDITOR_ROW: SwatchRow = {
  row: "the paint editor's brand colours",
  selector: '[data-testid="colour-picker"] [role="group"][aria-label="Brand colours"]',
  size: 21,
  gap: 3.5,
}

/** The swatch rows a Colour or Background panel shows with + open, each by its buttons' group. */
export const SWATCH_ROWS: SwatchRow[] = [
  { row: 'brand kit', selector: '[data-testid="brand-colours"] [role="group"]', size: 22, gap: 5.25 },
  { row: 'in this design, with +', selector: '[data-testid="design-colours"] [role="group"]', size: 22, gap: 5.25 },
  PAINT_EDITOR_ROW,
]

/** A shape's Colour panel and a frame's Background panel, each opened with + showing its paint editor. */
export const SWATCH_PANELS: SwatchPanel[] = [
  {
    name: "a shape's Colour panel",
    open: async (page) => {
      await page.evaluate(() => window.dazbee?.select(['tilt']))
      return withPicker(await barMenu(page, 'colour'))
    },
  },
  {
    name: "a frame's Background panel",
    open: async (page) => {
      await page.evaluate(() => window.dazbee?.select([]))
      await clickLabel(page, 'sq')
      return withPicker(await barMenu(page, 'background'))
    },
  },
]

/** The boxes of a row's buttons on screen, once the panel holding them has stopped moving. */
export async function swatchBoxes(panel: Locator, row: SwatchRow): Promise<Rect[]> {
  await entered(panel)
  const buttons = panel.locator(row.selector).first().getByRole('button')
  await expect(buttons.first(), `${row.row} shows`).toBeVisible()
  return buttons.evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    }),
  )
}

/** The least space between any two of the boxes, across or down, whichever keeps them further apart. */
export function closest(boxes: Rect[]) {
  let least = Infinity
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const across = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width))
      const down = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height))
      least = Math.min(least, Math.max(across, down))
    }
  }
  return least
}

/** The panel, with + open so its paint editor shows under the design's colours. */
async function withPicker(panel: Locator) {
  const pick = panel.getByTestId('colour-pick')
  if ((await pick.getAttribute('aria-pressed')) !== 'true') await pick.click()
  await expect(panel.getByTestId('colour-picker')).toBeVisible()
  return panel
}
