// The number inputs' checks: a design with a box and a headline to type into and scrub, the screens
// they run at (the phone's a touch screen), the shared field's fields they press, by the name each
// field's input has, every number input in the app and how to reach it, and readers of the caret
// and of a selection's colours as drawn.
import { decodePng, type Pixels, rgbaAt } from '@dazbee/pixels/pixels'
import { loadCanvasKit } from '@dazbee/renderer/node'
import type { DesignInput } from '@dazbee/schema'

import { frameButton } from './add-frame.ts'
import { SCREEN_SIZES } from './layout.ts'
import { frameDesign } from './seed.ts'
import { selectLayers } from './stage.ts'
import type { Locator, Page } from './test.ts'
import { openCard } from './top-bar.ts'

/** A colour's red, green and blue. */
export type Rgb = [number, number, number]

/**
 * A number input as the checks reach it, in the design `numberFieldsDesign` makes: the field around
 * its input carries `data-knob`, and takes a press beside the digits.
 */
export interface NumberInput {
  /** What the checks call it. */
  name: string
  /** The value it shows once opened. */
  value: string
  /** Opens what holds it and gives its input. */
  open: (page: Page) => Promise<Locator>
  /** What shows its edge while it is typed in, where that isn't the field around the input. */
  edge?: (page: Page) => Locator
  /** False where the room beside the digits is narrower than a fingertip, so only a mouse presses there. */
  fingerRoom?: false
}

/** A screen the checks run at: its size, and whether it is a touch screen. */
export interface FieldScreen {
  width: number
  height: number
  touch: boolean
}

/** The three screen sizes, the phone's a touch screen. */
export const FIELD_SCREENS: FieldScreen[] = SCREEN_SIZES.map(([width, height]) => ({
  width,
  height,
  touch: width < 640,
}))

/** The box's place and look, as the fields show them. */
export const BOX = { x: 80, y: 120, width: 400, height: 300, opacity: 0.2 } as const
/** The headline's font size, as the top bar shows it. */
export const HEADLINE_SIZE = 64

/** The fields pressed: two of Position's Advanced, and Opacity, whose fill spans its 0 to 100%. */
export const FIELDS = {
  x: { card: 'layout-card', name: 'X position' },
  y: { card: 'layout-card', name: 'Y position' },
  rotation: { card: 'layout-card', name: 'Rotation in degrees' },
  opacity: { card: 'appearance-card', name: 'Opacity' },
} as const

/**
 * Every number input, each once: the shared field (X position), a colour's opacity beside its hex
 * (the box's fill), the top bar's font size between − and + (the headline's), and the width of
 * Add a frame's size of your own, which starts at the frame's.
 */
export const NUMBER_INPUTS: NumberInput[] = [
  {
    name: 'X position',
    value: String(BOX.x),
    open: async (page) => {
      await selectLayers(page, ['box'], { card: FIELDS.x.card })
      return (await openCard(page, FIELDS.x.card)).getByRole('spinbutton', { name: FIELDS.x.name, exact: true })
    },
  },
  {
    name: "a colour's opacity",
    value: '100',
    open: async (page) => {
      await selectLayers(page, ['box'], { card: 'fill-card' })
      return (await openCard(page, 'fill-card')).getByLabel('Colour 1 opacity', { exact: true })
    },
  },
  {
    name: 'the font size',
    value: String(HEADLINE_SIZE),
    open: async (page) => {
      await selectLayers(page, ['headline'], { bar: true })
      const input = page.getByTestId('bar-size-field')
      if (!(await input.isVisible()) && (await page.getByTestId('bar-overflow').isVisible()))
        await page.getByTestId('bar-overflow').click()
      return input
    },
    edge: (page) => page.getByTestId('bar-size'),
    fingerRoom: false,
  },
  {
    name: "Add a frame's width",
    value: '1080',
    open: async (page) => {
      await frameButton(page)
      const input = page.getByTestId('own-width')
      await input.scrollIntoViewIfNeeded()
      return input
    },
  },
]

/**
 * Rows of fields on a touch screen, each control 44 px tall and 8 px from the next, as every field is
 * there: what the checks call the row, and how to open it and give its controls from start to end.
 */
export const TOUCH_ROWS: { name: string; open: (page: Page) => Promise<Locator[]> }[] = [
  {
    name: "a colour's hex and opacity",
    open: async (page) => {
      await selectLayers(page, ['box'], { card: 'fill-card' })
      const card = await openCard(page, 'fill-card')
      const opacity = card.getByLabel('Colour 1 opacity', { exact: true })
      return [card.getByLabel('Colour 1 hex', { exact: true }), opacity.locator('xpath=ancestor::*[@data-knob][1]')]
    },
  },
  {
    name: "See-through's opacity and blend",
    open: async (page) => {
      await selectLayers(page, ['box'], { card: FIELDS.opacity.card })
      const knob = (await openCard(page, FIELDS.opacity.card)).locator(`[data-scrub="${FIELDS.opacity.name}"]`)
      return [knob, knob.locator('xpath=following-sibling::*[1]')]
    },
  },
  {
    name: "Add a frame's height and Add",
    open: async (page) => {
      await frameButton(page)
      const height = page.getByTestId('own-height').locator('xpath=ancestor::*[@data-knob][1]')
      return [height, page.getByTestId('own-size').getByRole('button', { name: 'Add', exact: true })]
    },
  },
]

/** One frame holding a box, `box`, at BOX, and a headline, `headline`, under it. */
export const numberFieldsDesign = (): DesignInput =>
  frameDesign({
    name: 'Number fields',
    nodes: {
      box: {
        type: 'graphic',
        parentId: 'sq',
        index: 'a0',
        name: 'Box',
        props: {
          x: BOX.x,
          y: BOX.y,
          width: BOX.width,
          height: BOX.height,
          opacity: BOX.opacity,
          shape: { kind: 'rect', cornerRadius: 24 },
          fills: [{ type: 'solid', color: '#3D6BFFFF' }],
        },
      },
      headline: {
        type: 'text',
        parentId: 'sq',
        index: 'a1',
        name: 'Headline',
        props: {
          x: BOX.x,
          y: 520,
          width: 600,
          height: 90,
          boxMode: 'autoHeight',
          text: 'Summer sale',
          style: { fontFamily: 'Noto Sans', fontSize: HEADLINE_SIZE, fontWeight: 400, color: '#111111FF' },
        },
      },
    },
  })

/** Where an input's caret or selection is, what it holds, and whether it has the focus. */
export const caretOf = (input: Locator) =>
  input.evaluate((el: HTMLInputElement) => ({
    value: el.value,
    start: el.selectionStart,
    end: el.selectionEnd,
    focused: document.activeElement === el,
  }))

/**
 * The colours a field with its whole value selected shows, as drawn: the selection behind the last
 * digit, the field's fill beside its label, and the digits' colour.
 */
export async function selectionColours(knob: Locator, input: Locator) {
  const ck = await loadCanvasKit()
  const shot = decodePng(ck, new Uint8Array(await knob.screenshot({ animations: 'disabled' })))
  const [k, i] = [await knob.boundingBox(), await input.boundingBox()]
  if (!k || !i) throw new Error('no field on screen')
  const scale = shot.width / k.width
  const right = (i.x + i.width - k.x) * scale
  const top = (i.y - k.y) * scale
  const digit = (await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) * 0.6 * scale
  const selection = commonest(shot, right - digit, top + 2 * scale, right - scale, top + i.height * scale - 2 * scale)
  const field = commonest(shot, 2 * scale, (k.height / 2 - 2) * scale, 6 * scale, (k.height / 2 + 2) * scale)
  const digits = await input.evaluate((el) =>
    getComputedStyle(el, '::selection').color.match(/\d+/g)?.slice(0, 3).map(Number),
  )
  return { selection, field, digits: digits as Rgb }
}

/** WCAG 2.2's contrast ratio between two colours. */
export function contrast(a: Rgb, b: Rgb) {
  const luminance = (rgb: Rgb) => {
    const [r, g, bl] = rgb.map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0)
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

/** The commonest colour in a region of a picture, which over a field's flat fill is that fill. */
function commonest(shot: Pixels, x0: number, y0: number, x1: number, y1: number): Rgb {
  const counts = new Map<string, number>()
  for (let y = Math.round(y0); y < Math.round(y1); y++)
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      const key = rgbaAt(shot, x, y).slice(0, 3).join(',')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return (top?.[0] ?? '0,0,0').split(',').map(Number) as Rgb
}
