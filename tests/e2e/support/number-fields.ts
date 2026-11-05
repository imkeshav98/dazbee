// The number fields' checks: a design with one box to type into and scrub, the screens they run
// at (the phone's a touch screen), and the fields they press, by the name each field's input has.
import { decodePng, type Pixels, rgbaAt } from '@dazbee/pixels/pixels'
import { loadCanvasKit } from '@dazbee/renderer/node'
import type { DesignInput } from '@dazbee/schema'

import { SCREEN_SIZES } from './layout.ts'
import { frameDesign } from './seed.ts'
import type { Locator } from './test.ts'

/** A colour's red, green and blue. */
export type Rgb = [number, number, number]

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

/** The fields pressed: two of Position's Advanced, and Opacity, whose fill spans its 0 to 100%. */
export const FIELDS = {
  x: { card: 'layout-card', name: 'X position' },
  y: { card: 'layout-card', name: 'Y position' },
  rotation: { card: 'layout-card', name: 'Rotation in degrees' },
  opacity: { card: 'appearance-card', name: 'Opacity' },
} as const

/** One frame holding one box, `box`, at BOX. */
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
