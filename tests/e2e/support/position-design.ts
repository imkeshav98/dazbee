// The design the Position specs open: a text, a shape over another, a turned shape, two shapes in
// an auto layout row, and a group, in one frame.
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

/** A text, a shape over another, a turned shape, two shapes in an auto layout row and a group, in one frame. */
export const positionDesign = (): DesignInput =>
  frameDesign({
    name: 'Position',
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
      group: {
        type: 'group',
        parentId: 'sq',
        index: 'a5',
        name: 'Group',
        props: { x: 620, y: 700, width: 300, height: 120 },
      },
      g1: rect('G1', 'a0', 620, 700, { width: 140, height: 120 }, 'group'),
      g2: rect('G2', 'a1', 780, 700, { width: 140, height: 120, fills: solid('#2A9D8FFF') }, 'group'),
    },
  })
