// The design the Arrange ⋯ specs open, and a reader of the top bar's items: a text, a shape over
// another, a turned shape, and two shapes in an auto layout row, in one frame.
import type { Page } from '@playwright/test'

import type { DesignInput } from '@dazbee/schema'

import { frameDesign } from './seed.ts'

const solid = (color: string) => [{ type: 'solid' as const, color }]
const rect = (
  name: string,
  index: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
  parentId = 'sq',
) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name,
  props: { x, y, width: 200, height: 160, shape: { kind: 'rect' as const }, fills: solid('#14213DFF'), ...extra },
})

/** A text, a shape over another, a turned shape, and two shapes in an auto layout row, in one frame. */
export const arrangeDesign = (): DesignInput =>
  frameDesign({
    name: 'Top bar more',
    fills: solid('#FFF8F0FF'),
    nodes: {
      under: rect('Under', 'a0', 160, 340, { fills: solid('#FCA311FF') }),
      shape: rect('Shape', 'a1', 120, 300),
      words: {
        type: 'text',
        parentId: 'sq',
        index: 'a2',
        name: 'Words',
        props: {
          x: 80,
          y: 60,
          width: 600,
          height: 90,
          boxMode: 'autoHeight',
          text: 'Weekend sale',
          style: { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 400, color: '#111111FF' },
        },
      },
      turned: rect('Turned', 'a3', 640, 300, { width: 160, height: 100, rotation: 30, fills: solid('#E0262BFF') }),
      stack: {
        type: 'box',
        parentId: 'sq',
        index: 'a4',
        name: 'Stack',
        props: {
          x: 120,
          y: 680,
          width: 420,
          height: 140,
          fills: solid('#2A9D8FFF'),
          layout: { direction: 'row', gap: 12, padding: { top: 12, right: 12, bottom: 12, left: 12 } },
        },
      },
      one: rect('One', 'a0', 0, 0, { width: 100, height: 100 }, 'stack'),
      two: rect('Two', 'a1', 0, 0, { width: 100, height: 100, fills: solid('#FFFFFFFF') }, 'stack'),
    },
  })

/** The top bar's items, by their keys, in order. */
export const barItems = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="top-bar"] [data-item]')].map((el) => el.dataset.item),
  )
