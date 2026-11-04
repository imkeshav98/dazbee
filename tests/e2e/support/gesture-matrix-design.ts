// The gesture matrix's design (support/gesture-matrix.ts) and the tables that name its layers: the
// subjects, what each container holds, each path's colour, each layer auto layout places, the two
// layers beside each subject, and the leaves.
import type { DesignInput } from '@dazbee/schema'

import { frameDesign, linkedFrames, type Seeded } from './seed.ts'

type Node = Seeded

/** The layers the matrix acts on, each selected alone (or with two beside it, to distribute). */
export const SUBJECTS = [
  'shape',
  'group',
  'gA',
  'box',
  'boxInner',
  'auto',
  'aFixed',
  'aFill',
  'aHug',
  'aAbs',
  'col',
  'colA',
  'bool',
  'mask',
  'masked',
  'tWide',
  'tTall',
  'tFixed',
  'photo',
  'turned',
  'tInner',
  'autoTurned',
  'atA',
  'pen',
  'paths',
] as const
export type Subject = (typeof SUBJECTS)[number]
/** What each container holds. */
export const HOLDS: Record<string, readonly string[]> = {
  group: ['gA', 'gB'],
  bool: ['bA', 'bB'],
  maskGroup: ['mask', 'masked'],
  box: ['boxInner'],
  auto: ['aFixed', 'aFill', 'aHug', 'aAbs'],
  aHug: ['aHugIn'],
  turned: ['tInner'],
  col: ['colA', 'colB'],
  autoTurned: ['atA', 'atB'],
  paths: ['pA', 'pB'],
}
/** Each path's colour, to find where its drawing is in an export. */
export const PATH_INK: Record<string, [number, number, number]> = {
  pen: [0x13, 0xc4, 0xa3],
  pA: [0xc4, 0x13, 0x90],
  pB: [0x7a, 0x13, 0xc4],
}
/** Each layer auto layout places, by the box whose flow it is in. */
export const FLOW: Record<string, string> = {
  aFixed: 'auto',
  aFill: 'auto',
  aHug: 'auto',
  colA: 'col',
  colB: 'col',
  atA: 'autoTurned',
  atB: 'autoTurned',
}
/** Two layers beside each subject that can be distributed with it. */
export const BESIDE: Record<string, [string, string]> = {
  shape: ['group', 'box'],
  group: ['shape', 'box'],
  box: ['shape', 'group'],
  bool: ['shape', 'group'],
  photo: ['shape', 'group'],
  aFixed: ['aFill', 'aHug'],
  aFill: ['aFixed', 'aHug'],
  aHug: ['aFixed', 'aFill'],
}
export const LEAVES = [
  'shape',
  'gA',
  'gB',
  'boxInner',
  'aFixed',
  'aFill',
  'aHugIn',
  'aAbs',
  'colA',
  'colB',
  'bA',
  'bB',
  'mask',
  'masked',
  'tWide',
  'tTall',
  'tFixed',
  'photo',
  'tInner',
  'atA',
  'atB',
  'pen',
  'pA',
  'pB',
]

const rect = (
  name: string,
  parentId: string,
  index: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  extra: Record<string, unknown> = {},
): Node =>
  ({
    type: 'graphic',
    parentId,
    index,
    name,
    props: { x, y, width, height, shape: { kind: 'rect' }, fills: [{ type: 'solid', color }], ...extra },
  }) as Node
/** A box with a notch cut into its bottom, drawn in that box, so its drawing reaches each edge. */
const path = (
  name: string,
  parentId: string,
  index: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): Node =>
  ({
    type: 'graphic',
    parentId,
    index,
    name,
    props: {
      x,
      y,
      width,
      height,
      shape: {
        kind: 'path',
        d: `M0 0 L${width} 0 L${width} ${height} L${width / 2} ${height * 0.7} L0 ${height} Z`,
        drawnIn: { width, height },
      },
      fills: [{ type: 'solid', color }],
    },
  }) as Node
const row = (direction: 'row' | 'column', gap = 20, pad = 20) => ({
  direction,
  gap,
  padding: { top: pad, right: pad, bottom: pad, left: pad },
})

/**
 * A square frame `sq` holding a layer of each kind, spread out so each can be pressed on its own,
 * and a wide frame `wide` holding their linked copies (support/seed.ts, copyIn).
 */
export const matrixDesign = (assetId: string): DesignInput =>
  linkedFrames(
    frameDesign({
      name: 'Gesture matrix',
      nodes: {
        shape: rect('Shape', 'sq', 'a0', 40, 40, 120, 120, '#FF2E7EFF'),
        group: {
          type: 'group',
          parentId: 'sq',
          index: 'a1',
          name: 'Group',
          props: { x: 200, y: 40, width: 200, height: 120 },
        },
        gA: rect('Group A', 'group', 'a0', 200, 40, 90, 120, '#2F6BFFFF'),
        gB: rect('Group B', 'group', 'a1', 310, 40, 90, 120, '#FFB020FF'),
        box: {
          type: 'box',
          parentId: 'sq',
          index: 'a2',
          name: 'Box',
          props: { x: 440, y: 40, width: 200, height: 140, fills: [{ type: 'solid', color: '#EEF1F6FF' }] },
        },
        boxInner: rect('Box inner', 'box', 'a0', 460, 60, 100, 80, '#9747FFFF'),
        auto: {
          type: 'box',
          parentId: 'sq',
          index: 'a3',
          name: 'Auto layout',
          props: {
            x: 40,
            y: 240,
            width: 560,
            height: 160,
            sizing: { width: 'fixed', height: 'hug' },
            fills: [{ type: 'solid', color: '#E6F4EFFF' }],
            layout: row('row'),
          },
        },
        aFixed: rect('Flow fixed', 'auto', 'a0', 0, 0, 120, 120, '#00A88AFF'),
        aFill: rect('Flow fill', 'auto', 'a1', 0, 0, 100, 120, '#1F2329FF', {
          sizing: { width: 'fill', height: 'fixed' },
        }),
        aHug: {
          type: 'box',
          parentId: 'auto',
          index: 'a2',
          name: 'Flow hug',
          props: {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            sizing: { width: 'hug', height: 'hug' },
            fills: [{ type: 'solid', color: '#FFB020FF' }],
            layout: row('row', 0, 30),
          },
        },
        aHugIn: rect('Hug inner', 'aHug', 'a0', 0, 0, 60, 60, '#FF2E7EFF'),
        aAbs: rect('Flow absolute', 'auto', 'a3', 520, 330, 60, 60, '#2F6BFFFF', { absolute: true }),
        col: {
          type: 'box',
          parentId: 'sq',
          index: 'a4',
          name: 'Column',
          props: {
            x: 920,
            y: 240,
            width: 140,
            height: 10,
            sizing: { width: 'fixed', height: 'hug' },
            fills: [{ type: 'solid', color: '#FFF0D6FF' }],
            layout: row('column', 10, 10),
          },
        },
        colA: rect('Column A', 'col', 'a0', 0, 0, 120, 60, '#FF7A2EFF'),
        colB: rect('Column B', 'col', 'a1', 0, 0, 120, 60, '#2F6BFFFF'),
        bool: {
          type: 'boolean',
          parentId: 'sq',
          index: 'a5',
          name: 'Boolean',
          props: {
            x: 680,
            y: 40,
            width: 200,
            height: 140,
            op: 'union',
            fills: [{ type: 'solid', color: '#FF7A2EFF' }],
          },
        },
        bA: rect('Bool A', 'bool', 'a0', 680, 40, 140, 100, '#000000FF'),
        bB: rect('Bool B', 'bool', 'a1', 740, 80, 140, 100, '#000000FF'),
        maskGroup: {
          type: 'group',
          parentId: 'sq',
          index: 'a6',
          name: 'Masked',
          props: { x: 680, y: 260, width: 200, height: 160 },
        },
        mask: {
          type: 'graphic',
          parentId: 'maskGroup',
          index: 'a0',
          name: 'Mask',
          props: {
            x: 680,
            y: 260,
            width: 200,
            height: 160,
            shape: { kind: 'ellipse' },
            fills: [{ type: 'solid', color: '#000000FF' }],
            mask: 'alpha',
          },
        },
        masked: rect('Masked', 'maskGroup', 'a1', 680, 260, 200, 160, '#00A88AFF'),
        tWide: {
          type: 'text',
          parentId: 'sq',
          index: 'a7',
          name: 'Auto width',
          props: {
            x: 40,
            y: 460,
            width: 300,
            height: 60,
            text: 'Auto width',
            boxMode: 'autoWidth',
            style: { fontFamily: 'Noto Sans', fontSize: 44, fontWeight: 700, color: '#1F2329FF' },
          },
        },
        tTall: {
          type: 'text',
          parentId: 'sq',
          index: 'a8',
          name: 'Auto height',
          props: {
            x: 40,
            y: 560,
            width: 320,
            height: 60,
            text: 'Auto height text',
            boxMode: 'autoHeight',
            style: { fontFamily: 'Noto Sans', fontSize: 40, fontWeight: 700, color: '#1F2329FF' },
          },
        },
        tFixed: {
          type: 'text',
          parentId: 'sq',
          index: 'a9',
          name: 'Fixed',
          props: {
            x: 40,
            y: 680,
            width: 320,
            height: 120,
            text: 'Fixed box',
            boxMode: 'fixed',
            style: { fontFamily: 'Noto Sans', fontSize: 40, fontWeight: 700, color: '#1F2329FF' },
          },
        },
        photo: {
          type: 'graphic',
          parentId: 'sq',
          index: 'b0',
          name: 'Photo',
          props: {
            x: 440,
            y: 460,
            width: 300,
            height: 200,
            shape: { kind: 'rect' },
            fills: [{ type: 'image', assetId, fit: 'crop', crop: { x: 200, y: 100, width: 1200, height: 800 } }],
          },
        },
        turned: {
          type: 'box',
          parentId: 'sq',
          index: 'b1',
          name: 'Turned box',
          props: {
            x: 800,
            y: 600,
            width: 200,
            height: 140,
            rotation: 20,
            clip: false,
            fills: [{ type: 'solid', color: '#E8E0FFFF' }],
          },
        },
        tInner: rect('Turned inner', 'turned', 'a0', 830, 630, 90, 60, '#9747FFFF'),
        autoTurned: {
          type: 'box',
          parentId: 'sq',
          index: 'b2',
          name: 'Turned auto layout',
          props: {
            x: 440,
            y: 860,
            width: 300,
            height: 100,
            rotation: 10,
            fills: [{ type: 'solid', color: '#E6F4EFFF' }],
            layout: row('row', 10, 10),
          },
        },
        atA: rect('Turned flow A', 'autoTurned', 'a0', 0, 0, 80, 80, '#FF2E7EFF'),
        atB: rect('Turned flow B', 'autoTurned', 'a1', 0, 0, 80, 80, '#2F6BFFFF'),
        pen: path('Pen path', 'sq', 'b3', 40, 860, 120, 100, '#13C4A3FF'),
        paths: {
          type: 'group',
          parentId: 'sq',
          index: 'b4',
          name: 'Paths',
          props: { x: 200, y: 860, width: 200, height: 100 },
        },
        pA: path('Path A', 'paths', 'a0', 200, 860, 90, 100, '#C41390FF'),
        pB: path('Path B', 'paths', 'a1', 310, 860, 90, 100, '#7A13C4FF'),
      },
    }),
    [{ id: 'wide', name: 'Wide', width: 1920, height: 1080 }],
  )
