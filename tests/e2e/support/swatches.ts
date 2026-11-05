// The swatch-like controls of the Colour panel, the frame Background panel built on it, the Outline
// panel and the Effects panel, as the swatch tests measure them: a brand kit that fills the kit's
// row, each control with the size it keeps and its space to the next target on a tablet or desktop,
// the touch target rule a phone holds them to and its check, the panels opened with every control showing, the
// paint pop-up a row's swatch opens, and where a press lands on each of a control's targets.
import type { BrandKit } from '@dazbee/schema'

import { clickLabel } from './frames-on-canvas.ts'
import type { Rect } from './layout.ts'
import { type ElementHandle, expect, type Locator, type Page } from './test.ts'
import { barMenu, entered } from './top-bar.ts'

/**
 * A swatch-like control, by what it is and a short id for its pictures, its targets by a selector in
 * what shows it, and off a phone how big a press on each lands and the space to the next target,
 * where that is set.
 */
export interface SwatchControl {
  control: string
  id: string
  selector: string
  size: number
  gap?: number
}

/**
 * A panel that shows swatch-like controls: how to open it on the frames-on-canvas design with all of
 * them showing, which it shows, and which the paint pop-up of its first row shows, when its rows have
 * one.
 */
export interface SwatchPanel {
  name: string
  open: (page: Page) => Promise<Locator>
  controls: SwatchControl[]
  popup?: SwatchControl[]
}

/**
 * Where a press lands on a target, whether a press just inside each side of that lands on it, and the
 * space from there to the nearest other target.
 */
export type Touch = Rect & { space: number; pressable: boolean }

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

/** The brand kit's colours, the panel's first swatch row. */
export const KIT_ROW: SwatchControl = {
  control: "the brand kit's colours",
  id: 'kit',
  selector: '[data-testid="brand-colours"] [role="group"] > button',
  size: 22,
  gap: 5.25,
}

/** The colours in the design, after +. */
export const DESIGN_ROW: SwatchControl = {
  control: 'the colours in this design, with +',
  id: 'design',
  selector: '[data-testid="design-colours"] [role="group"][aria-label="In this design"] > button',
  size: 22,
  gap: 5.25,
}

/** The brand colours of a paint editor, the one + opens and a row's pop-up. */
export const PAINT_EDITOR_ROW: SwatchControl = {
  control: "the paint editor's brand colours",
  id: 'paint-editor',
  selector: '[data-testid="paint-editor"] [role="group"][aria-label="Brand colours"] > button',
  size: 21,
  gap: 3.5,
}

/** The box beside a colour field's hex that opens the system's picker. */
export const COLOUR_BOX: SwatchControl = {
  control: "a colour field's box, beside its hex",
  id: 'colour-box',
  selector: 'input[type="color"]',
  size: 24.5,
  gap: 3.5,
}

/** The swatch at the start of a fill's or an outline's row, which opens its paint pop-up. */
export const PAINT_SWATCH: SwatchControl = {
  control: "a fill's or an outline's swatch",
  id: 'paint-swatch',
  selector: '[data-testid="paint-swatch"]',
  size: 24.5,
  gap: 3.5,
}

/** A gradient's stops on its bar, drawn 14 px. */
export const GRADIENT_STOPS: SwatchControl = {
  control: "a gradient's stops",
  id: 'stops',
  selector: '[data-stop]',
  size: 14,
}

/**
 * What a swatch-like control keeps its space from: everything a person presses or types in. A
 * knob is its whole box, with the field inside it.
 */
const TARGETS = 'button, input, select, textarea, label, [role="radio"], [role="switch"], [data-scrub]'

/**
 * The panels with swatch-like controls, each opened with + showing its paint editor and two rows in
 * its list, so the space between rows is measured too: a shape's Colour panel, a frame's Background
 * panel, a shape's Outline panel, a shape's Colour panel with a line gradient in its paint editor, a
 * text's Colour panel, and a shape's Effects panel with a shadow.
 */
export const SWATCH_PANELS: SwatchPanel[] = [
  {
    name: "a shape's Colour panel",
    open: async (page) => {
      await page.evaluate(() => window.dazbee?.select(['tilt']))
      const panel = await withPicker(await barMenu(page, 'colour'))
      await twoRows(panel.getByTestId('fill-list'), 'Add fill')
      return panel
    },
    controls: [KIT_ROW, DESIGN_ROW, PAINT_EDITOR_ROW, COLOUR_BOX, PAINT_SWATCH],
    popup: [COLOUR_BOX, PAINT_EDITOR_ROW],
  },
  {
    name: "a frame's Background panel",
    open: async (page) => {
      await page.evaluate(() => window.dazbee?.select([]))
      await clickLabel(page, 'sq')
      const panel = await withPicker(await barMenu(page, 'background'))
      await twoRows(panel.getByTestId('frame-fills'), 'Add a colour')
      return panel
    },
    controls: [KIT_ROW, DESIGN_ROW, PAINT_EDITOR_ROW, COLOUR_BOX, PAINT_SWATCH],
    popup: [COLOUR_BOX, PAINT_EDITOR_ROW],
  },
  {
    name: "a shape's Outline panel",
    open: async (page) => {
      await page.evaluate(() => window.dazbee?.select(['tilt']))
      const panel = await barMenu(page, 'outline')
      const solid = panel.getByRole('radio', { name: 'Solid' })
      if ((await solid.getAttribute('aria-checked')) !== 'true') await solid.click()
      await twoRows(panel.getByTestId('stroke-list'), 'Add outline')
      return panel
    },
    controls: [PAINT_SWATCH],
    popup: [COLOUR_BOX, PAINT_EDITOR_ROW],
  },
  {
    name: "a shape's Colour panel with a line gradient",
    open: async (page) => {
      await page.evaluate(() => window.dazbee?.select(['tilt']))
      const panel = await withPicker(await barMenu(page, 'colour'))
      await twoRows(panel.getByTestId('fill-list'), 'Add fill')
      const line = panel.getByTestId('colour-picker').getByRole('radio', { name: 'Line gradient' })
      if ((await line.getAttribute('aria-checked')) !== 'true') await line.click()
      await expect(panel.locator(GRADIENT_STOPS.selector)).toHaveCount(2)
      return panel
    },
    controls: [GRADIENT_STOPS, COLOUR_BOX, PAINT_EDITOR_ROW, PAINT_SWATCH],
    popup: [GRADIENT_STOPS, COLOUR_BOX, PAINT_EDITOR_ROW],
  },
  {
    name: "a text's Colour panel",
    open: async (page) => {
      await page.evaluate(() => window.dazbee?.select(['headline']))
      return withPicker(await barMenu(page, 'colour'))
    },
    controls: [KIT_ROW, DESIGN_ROW, COLOUR_BOX],
  },
  {
    name: "a shape's Effects panel with a shadow",
    open: async (page) => {
      await page.evaluate(() => window.dazbee?.select(['tilt']))
      const panel = await barMenu(page, 'effects')
      const shadow = panel.locator('[data-tile="dropShadow"]')
      if ((await shadow.getAttribute('aria-pressed')) !== 'true') await shadow.click()
      await expect(panel.locator(COLOUR_BOX.selector)).toHaveCount(1)
      return panel
    },
    controls: [COLOUR_BOX],
  },
]

/** Each touch at least a touch target across and down, that far from the next target, and inside `room` across. */
export const expectTouchTargets = (touches: Touch[], what: string, room: { x: number; width: number }) => {
  for (const touch of touches) {
    expect(touch.pressable, `${what}: a press lands at each side`).toBe(true)
    expect(Math.min(touch.width, touch.height), `${what}: where a press lands`).toBeGreaterThanOrEqual(
      TOUCH_TARGET.size,
    )
    expect(touch.space, `${what}: the space to the next target`).toBeGreaterThanOrEqual(TOUCH_TARGET.gap)
    expect(touch.x, `${what}: starts in its panel`).toBeGreaterThanOrEqual(room.x)
    expect(touch.x + touch.width, `${what}: ends in its panel`).toBeLessThanOrEqual(room.x + room.width)
  }
}

/** Opens the paint pop-up of a panel's first row, by its swatch, and gives it once it shows. */
export async function paintPopup(panel: Locator) {
  const swatch = panel.locator(PAINT_SWATCH.selector).first()
  await swatch.click()
  await expect(swatch).toHaveAttribute('aria-expanded', 'true')
  const popup = panel.page().locator(`[id="${await swatch.getAttribute('aria-controls')}"]`)
  await expect(popup.getByTestId('paint-editor')).toBeVisible()
  await entered(popup)
  return popup
}

/**
 * Where a press lands on each of a control's targets in `root`, once `root` has stopped moving, as
 * `touchOf` gives it, with the space from there to the nearest other target in `root`.
 */
export async function swatchTouches(root: Locator, control: SwatchControl): Promise<Touch[]> {
  await entered(root)
  const targets = root.locator(control.selector)
  await expect(targets.first(), `${control.control} shows`).toBeVisible()
  const within = await root.elementHandle()
  const touches: Touch[] = []
  for (const target of await targets.all()) touches.push(await touchOf(target, within))
  return touches
}

/**
 * Where a press lands on a target, scrolled into view: the box round it and what it holds, such as a
 * touch area round a smaller drawing, to a hundredth of a px, and whether a press just inside each
 * of that box's sides lands on it. A press on the label round a target lands on the target, so the
 * label counts as the target. With the space from there to the nearest other target in `within`,
 * if given.
 */
export function touchOf(target: Locator, within?: ElementHandle | null): Promise<Touch> {
  return target.evaluate(
    (control, { root, all }) => {
      const t = control.closest('label') ?? control
      t.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
      const shown = (el: Element) => {
        const box = el.getBoundingClientRect()
        return el.checkVisibility() && box.width > 0 && box.height > 0
      }
      const boxes = [t, ...t.querySelectorAll('*')].filter(shown).map((el) => el.getBoundingClientRect())
      const left = Math.min(...boxes.map((b) => b.left))
      const top = Math.min(...boxes.map((b) => b.top))
      const right = Math.max(...boxes.map((b) => b.right))
      const bottom = Math.max(...boxes.map((b) => b.bottom))
      const lands = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y)
        return !!hit && t.contains(hit)
      }
      const middle = { x: (left + right) / 2, y: (top + bottom) / 2 }
      const pressable =
        lands(left + 1, middle.y) &&
        lands(right - 1, middle.y) &&
        lands(middle.x, top + 1) &&
        lands(middle.x, bottom - 1)
      let space = Number.POSITIVE_INFINITY
      const others = root instanceof Element ? [...root.querySelectorAll(all)] : []
      for (const other of others) {
        if (other.contains(t) || t.contains(other) || !shown(other)) continue
        const b = other.getBoundingClientRect()
        const across = Math.max(b.left - right, left - b.right)
        const between = Math.max(b.top - bottom, top - b.bottom)
        space = Math.min(space, Math.max(across, between))
      }
      const hundredth = (n: number) => Math.round(n * 100) / 100
      return {
        x: hundredth(left),
        y: hundredth(top),
        width: hundredth(right - left),
        height: hundredth(bottom - top),
        space: hundredth(space),
        pressable,
      }
    },
    { root: within ?? null, all: TARGETS },
  )
}

/** The panel, with + open so its paint editor shows under the design's colours. */
async function withPicker(panel: Locator) {
  const pick = panel.getByTestId('colour-pick')
  if ((await pick.getAttribute('aria-pressed')) !== 'true') await pick.click()
  await expect(panel.getByTestId('colour-picker')).toBeVisible()
  return panel
}

/** A list of paints with a second row added by its + when it has one row. */
async function twoRows(list: Locator, add: string) {
  const rows = list.locator('[data-row]')
  if ((await rows.count()) < 2) await list.getByRole('button', { name: add }).click()
  await expect(rows).toHaveCount(2)
}
