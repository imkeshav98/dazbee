// The design the top bar specs open: a layer of each kind the bar has items for, alone and several,
// turned, grouped, in auto layout, masked, locked and hidden, in a Square frame and their linked
// copies in a Story frame.
import type { DesignInput } from '@dazbee/schema'

import { frameDesign, linkedFrames } from './seed.ts'

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

export const topBarDesign = (assetId: string): DesignInput =>
  linkedFrames(
    frameDesign({
      name: 'Top bar',
      fills: solid('#FFF8F0FF'),
      nodes: {
        headline: {
          type: 'text',
          parentId: 'sq',
          index: 'a0',
          name: 'Headline',
          props: {
            x: 60,
            y: 40,
            width: 600,
            height: 90,
            boxMode: 'autoHeight',
            text: 'Summer sale',
            style: { fontFamily: 'Noto Sans', fontSize: 64, fontWeight: 400, color: '#111111FF' },
          },
        },
        box: rect('Box', 'a1', 60, 200),
        star: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a2',
          name: 'Star',
          props: {
            x: 320,
            y: 200,
            width: 180,
            height: 180,
            shape: { kind: 'star', points: 5, innerRadius: 0.5 },
            fills: solid('#E0262BFF'),
          },
        },
        line: {
          type: 'graphic',
          parentId: 'sq',
          index: 'a3',
          name: 'Line',
          props: {
            x: 560,
            y: 260,
            width: 240,
            height: 0,
            shape: { kind: 'line' },
            strokes: [{ paint: { type: 'solid', color: '#111111FF' }, width: 4, align: 'center' }],
          },
        },
        card: {
          type: 'box',
          parentId: 'sq',
          index: 'a4',
          name: 'Card',
          props: { x: 60, y: 440, width: 300, height: 200, fills: solid('#EEF1F6FF'), cornerRadius: 16 },
        },
        inCard: rect('In card', 'a0', 80, 460, { width: 80, height: 60 }, 'card'),
        group: {
          type: 'group',
          parentId: 'sq',
          index: 'a5',
          name: 'Group',
          props: { x: 420, y: 440, width: 260, height: 160 },
        },
        g1: rect('G1', 'a0', 420, 440, { width: 120, height: 160 }, 'group'),
        g2: rect('G2', 'a1', 560, 440, { width: 120, height: 160, fills: solid('#2A9D8FFF') }, 'group'),
        combo: {
          type: 'boolean',
          parentId: 'sq',
          index: 'a6',
          name: 'Combo',
          props: { x: 740, y: 440, width: 280, height: 200, op: 'union', fills: solid('#E0157FFF') },
        },
        c1: {
          type: 'graphic',
          parentId: 'combo',
          index: 'a0',
          name: 'C1',
          props: { x: 740, y: 440, width: 200, height: 200, shape: { kind: 'ellipse' } },
        },
        c2: {
          type: 'graphic',
          parentId: 'combo',
          index: 'a1',
          name: 'C2',
          props: { x: 820, y: 440, width: 200, height: 200, shape: { kind: 'ellipse' } },
        },
        photo: rect('Photo', 'a7', 60, 720, {
          width: 300,
          height: 300,
          fills: [{ type: 'image', assetId, fit: 'fill' }],
        }),
        photoBox: {
          type: 'box',
          parentId: 'sq',
          index: 'a8',
          name: 'Photo box',
          props: { x: 400, y: 720, width: 300, height: 300, fills: [{ type: 'image', assetId, fit: 'fill' }] },
        },
        stack: {
          type: 'box',
          parentId: 'sq',
          index: 'a9',
          name: 'Stack',
          props: {
            x: 740,
            y: 720,
            width: 300,
            height: 120,
            fills: solid('#FCA311FF'),
            layout: { direction: 'row', gap: 12, padding: { top: 12, right: 12, bottom: 12, left: 12 } },
          },
        },
        inStack: rect('In stack', 'a0', 0, 0, { width: 80, height: 80 }, 'stack'),
        turned: rect('Turned', 'b0', 820, 60, { width: 160, height: 100, rotation: 30 }),
        cutter: rect('Cutter', 'b1', 740, 880, {
          width: 120,
          height: 120,
          mask: 'alpha',
          shape: { kind: 'rect', cornerRadius: 30 },
        }),
        locked: { ...rect('Locked', 'b2', 900, 880, { width: 120, height: 120 }), lock: { move: true, resize: true } },
        hidden: rect('Hidden', 'b3', 900, 280, { width: 120, height: 80, visible: false }),
        photoB: rect('Photo B', 'b4', 900, 380, {
          width: 120,
          height: 80,
          fills: [{ type: 'image', assetId, fit: 'fill' }],
        }),
        cardB: {
          type: 'box',
          parentId: 'sq',
          index: 'b5',
          name: 'Card B',
          props: { x: 560, y: 320, width: 160, height: 90, fills: solid('#EEF1F6FF') },
        },
        comboB: {
          type: 'boolean',
          parentId: 'sq',
          index: 'b6',
          name: 'Combo B',
          props: { x: 60, y: 660, width: 140, height: 50, op: 'subtract', fills: solid('#E0157FFF') },
        },
        d1: {
          type: 'graphic',
          parentId: 'comboB',
          index: 'a0',
          name: 'D1',
          props: { x: 60, y: 660, width: 100, height: 50, shape: { kind: 'ellipse' } },
        },
        d2: {
          type: 'graphic',
          parentId: 'comboB',
          index: 'a1',
          name: 'D2',
          props: { x: 100, y: 660, width: 100, height: 50, shape: { kind: 'ellipse' } },
        },
      },
    }),
    [{ id: 'st', name: 'Story', width: 1080, height: 1920, values: { headline: { y: 200 } } }],
  )
