// The number fields' checks: a design with one box to type into and scrub, the screens they run
// at (the phone's a touch screen), and the fields they press, by the name each field's input has.
import type { DesignInput } from '@dazbee/schema'

import { SCREEN_SIZES } from './layout.ts'
import { frameDesign } from './seed.ts'

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
