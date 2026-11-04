import { describe, expect, it } from 'vitest'

import type { SceneLayer } from '@dazbee/renderer'
import type { DesignInput } from '@dazbee/schema'

import { type Frame, frameGrid } from '../canvas/grid.ts'
import { editorSelection } from '../selection.ts'
import { visibleIn } from './boxes.ts'
import { sessionOf, testBoxes } from './test-boxes.ts'

const rect = (
  parentId: string,
  index: string,
  box: { x: number; y: number; width: number; height: number; rotation?: number },
  extra: Record<string, unknown> = {},
) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name: 'Rect',
  props: { rotation: 0, ...box, shape: { kind: 'rect' as const }, ...extra },
})
const STYLE = { fontFamily: 'Noto Sans', fontSize: 20, color: '#000000FF' }
/**
 * One page in a square and a wide format: a frame holding a dot (moved and hidden in the wide
 * format) and a tag, a group turned 90° holding a square, a row laid out by auto layout, a path, a photo
 * with an image fill over a solid one, a layer locked in place, and a text that grows with its words.
 */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D', kind: 'single', primaryFormatId: 'sq' },
  formats: {
    sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
    wide: { name: 'Wide', width: 1200, height: 628, order: 'a1' },
  },
  pages: { p1: { name: 'One', order: 'a0' } },
  nodes: {
    card: {
      type: 'frame',
      parentId: 'p1',
      index: 'a0',
      name: 'Card',
      props: { x: 100, y: 100, width: 400, height: 300 },
    },
    dot: rect('card', 'a0', { x: 110, y: 120, width: 30, height: 40 }),
    tag: rect('card', 'a1', { x: 300, y: 300, width: 20, height: 20 }),
    turned: {
      type: 'group',
      parentId: 'p1',
      index: 'a1',
      name: 'Turned',
      props: { x: 600, y: 100, width: 200, height: 200, rotation: 90 },
    },
    inside: rect('turned', 'a0', { x: 600, y: 100, width: 20, height: 20 }),
    row: {
      type: 'frame',
      parentId: 'p1',
      index: 'a2',
      name: 'Row',
      props: { x: 100, y: 500, width: 300, height: 100, layout: { direction: 'row', gap: 10 } },
    },
    a: rect('row', 'a0', { x: 0, y: 0, width: 50, height: 50 }),
    b: rect('row', 'a1', { x: 0, y: 0, width: 60, height: 50 }),
    zig: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a3',
      name: 'Zig',
      props: { x: 100, y: 700, width: 100, height: 100, shape: { kind: 'path', d: 'M0 0 L100 0 L100 100' } },
    },
    photo: rect(
      'p1',
      'a4',
      { x: 300, y: 700, width: 200, height: 100 },
      {
        fills: [
          { type: 'solid', color: '#FF0000FF' },
          { type: 'image', assetId: 'a1' },
        ],
      },
    ),
    pin: { ...rect('p1', 'a5', { x: 600, y: 700, width: 10, height: 10 }), lock: { move: true } },
    label: {
      type: 'text',
      parentId: 'p1',
      index: 'a6',
      name: 'Label',
      props: { x: 700, y: 700, width: 20, height: 24, text: 'Hi', boxMode: 'autoWidth', style: STYLE },
    },
  },
  overrides: { 'format:wide': { dot: { x: 150, visible: false } } },
}

/** The box queries over the design on a real session and selection, in its square and wide frames. */
function harness() {
  const session = sessionOf(DESIGN)
  const frames = frameGrid(session.design()).frames
  const selection = editorSelection({ drawn: () => session.design(), frames: () => frames, changed: () => {} })
  const boxes = testBoxes(session, selection, frames, { a1: { width: 400, height: 400 } })
  const [square, wide] = frames as [Frame, Frame]
  return { session, selection, boxes, square, wide }
}
const layer = (id: string) => ({ id }) as SceneLayer

describe('visibleIn', () => {
  it("says whether a layer shows in a frame, with the frame's format's own visibility", () => {
    const { session, square, wide } = harness()
    expect(visibleIn(session.design(), square, 'dot')).toBe(true)
    expect(visibleIn(session.design(), wide, 'dot')).toBe(false)
  })
})

describe('editorBoxes', () => {
  describe('boxIn', () => {
    it("reads a layer's box in a frame: the base with the format's overrides", () => {
      const { boxes, square, wide } = harness()
      expect(boxes.boxIn(square, 'dot')).toEqual({ x: 110, y: 120, width: 30, height: 40, rotation: 0 })
      expect(boxes.boxIn(wide, 'dot')).toEqual({ x: 150, y: 120, width: 30, height: 40, rotation: 0 })
      expect(boxes.boxIn(square, 'gone')).toBeNull()
    })

    it('takes the box auto layout gives a layer in a flow, from the scene', () => {
      const { boxes, square } = harness()
      expect(boxes.boxIn(square, 'a')).toMatchObject({ x: 100, y: 500, width: 50, height: 50 })
      expect(boxes.boxIn(square, 'b')).toMatchObject({ x: 160, y: 500, width: 60, height: 50 })
    })
  })

  describe('containersOf', () => {
    it('gives the groups and frames a layer is inside, outermost first, as boxes', () => {
      const { boxes, square } = harness()
      expect(boxes.containersOf(square, 'turned')).toEqual([{ x: 600, y: 100, width: 200, height: 200, rotation: 90 }])
      expect(boxes.containersOf(square, 'p1')).toEqual([])
    })
  })

  describe('drawnBoxOf', () => {
    it('turns a layer with the containers it is in', () => {
      const { boxes, square } = harness()
      const drawn = boxes.drawnBoxOf(square, 'inside')
      expect(drawn?.rotation).toBe(90)
      expect(drawn?.x).toBeCloseTo(780)
      expect(drawn?.y).toBeCloseTo(100)
      expect(boxes.drawnBoxOf(square, 'dot')).toEqual({ x: 110, y: 120, width: 30, height: 40, rotation: 0 })
    })
  })

  describe('drawnContains', () => {
    it('says whether a point on the page is inside a layer as drawn', () => {
      const { session, boxes, square } = harness()
      expect(boxes.drawnContains(square, 'inside', { x: 790, y: 110 }, session.design())).toBe(true)
      expect(boxes.drawnContains(square, 'inside', { x: 610, y: 110 }, session.design())).toBe(false)
      expect(boxes.drawnContains(square, 'gone', { x: 610, y: 110 }, session.design())).toBe(false)
    })
  })

  describe('startBoxes', () => {
    it('gives the boxes of layers and of those under them, leaving out layers a flow inside them places', () => {
      const { boxes, square } = harness()
      expect([...boxes.startBoxes(square, ['card']).keys()]).toEqual(['card', 'dot', 'tag'])
      expect([...boxes.startBoxes(square, ['row']).keys()]).toEqual(['row'])
      expect([...boxes.startBoxes(square, ['a']).keys()]).toEqual(['a'])
    })
  })

  describe('selectionBox', () => {
    it("is one layer's own box, or the box around several, with where it is drawn and its containers", () => {
      const { selection, boxes, square } = harness()
      expect(boxes.selectionBox()).toBeNull()
      selection.select(['inside'], square.key)
      expect(boxes.selectionBox()).toMatchObject({
        frame: square,
        box: { x: 600, y: 100, width: 20, height: 20, rotation: 0 },
        drawn: { rotation: 90 },
        around: [{ x: 600, y: 100, rotation: 90 }],
      })
      selection.select(['dot', 'zig'], square.key)
      expect(boxes.selectionBox()?.box).toEqual({ x: 100, y: 120, width: 100, height: 680, rotation: 0 })
    })
  })

  describe('roots', () => {
    it('leaves out selected layers inside another selected layer, and layers that are gone', () => {
      const { session, selection, boxes, square } = harness()
      selection.select(['dot', 'card', 'zig'], square.key)
      expect(boxes.roots()).toEqual(['card', 'zig'])
      session.run('node.delete', { ids: ['zig'] })
      expect(boxes.roots()).toEqual(['card'])
    })
  })

  describe('pickable', () => {
    it('leaves out layers locked in place', () => {
      const { boxes } = harness()
      expect(boxes.pickable(layer('pin'))).toBe(false)
      expect(boxes.pickable(layer('dot'))).toBe(true)
    })
  })

  describe('lockedSelection', () => {
    it('says whether a selected layer is locked in place', () => {
      const { selection, boxes, square } = harness()
      expect(boxes.lockedSelection()).toBe(false)
      selection.select(['dot', 'pin'], square.key)
      expect(boxes.lockedSelection()).toBe(true)
    })
  })

  describe('handlesFor', () => {
    it('gives every handle, none while locked, and no top or bottom one to text that grows with its words', () => {
      const { selection, boxes, square } = harness()
      expect(boxes.handlesFor()).toEqual([])
      selection.select(['dot'], square.key)
      expect(boxes.handlesFor()).toHaveLength(8)
      selection.select(['label'], square.key)
      expect(boxes.handlesFor()).toEqual(['nw', 'ne', 'e', 'se', 'sw', 'w'])
      selection.select(['pin'], square.key)
      expect(boxes.handlesFor()).toEqual([])
    })
  })

  describe('snapBoxes', () => {
    it('gives the other layers on the page as drawn, leaving out those holding the dragged ones', () => {
      const { boxes, square } = harness()
      const besideZig = boxes.snapBoxes(square, ['zig'], [])
      expect(besideZig).toHaveLength(6)
      expect(besideZig).toContainEqual({ x: 100, y: 100, width: 400, height: 300, rotation: 0 })
      expect(besideZig).not.toContainEqual({ x: 100, y: 700, width: 100, height: 100, rotation: 0 })
    })

    it('inside a group or frame, adds the container and the layers beside the dragged ones that show in the frame', () => {
      const { boxes, square, wide } = harness()
      const dot = { x: 110, y: 120, width: 30, height: 40, rotation: 0 }
      const inSquare = boxes.snapBoxes(square, ['tag'], [])
      expect(inSquare).toHaveLength(8)
      expect(inSquare?.slice(-2)).toEqual([{ x: 100, y: 100, width: 400, height: 300, rotation: 0 }, dot])
      expect(boxes.snapBoxes(wide, ['tag'], [])).toHaveLength(7)
      expect(boxes.snapBoxes(wide, ['tag'], [])).not.toContainEqual({ ...dot, x: 150 })
    })

    it('gives none inside a turned container, whose lines do not run along the page', () => {
      const { boxes, square } = harness()
      expect(
        boxes.snapBoxes(square, ['inside'], [{ x: 600, y: 100, width: 200, height: 200, rotation: 90 }]),
      ).toBeNull()
    })
  })

  describe('pathIn', () => {
    it("gives a path layer's path on the page, with its box and what turns it", () => {
      const { boxes, square } = harness()
      const zig = boxes.pathIn(square, 'zig')
      expect(zig?.path[0]?.anchors.map((a) => [a.x, a.y])).toEqual([
        [100, 700],
        [200, 700],
        [200, 800],
      ])
      expect(zig?.around).toEqual([{ x: 100, y: 700, width: 100, height: 100, rotation: 0 }])
      expect(boxes.pathIn(square, 'dot')).toBeNull()
    })
  })

  describe('cropTarget', () => {
    it('gives the topmost image fill, with the whole image covering the box', () => {
      const { boxes, square } = harness()
      expect(boxes.cropTarget(square, 'photo')).toMatchObject({
        index: 1,
        fill: { type: 'image', assetId: 'a1' },
        size: { width: 400, height: 400 },
        box: { x: 300, y: 700, width: 200, height: 100 },
        rect: { x: 300, y: 650, width: 200, height: 200 },
        around: [{ x: 300, y: 700, width: 200, height: 100 }],
      })
    })

    it('gives none for a layer with no image fill, or whose image is not here', () => {
      const { session, boxes, square } = harness()
      expect(boxes.cropTarget(square, 'dot')).toBeNull()
      expect(boxes.cropTarget(square, 'card')).toBeNull()
      session.run('node.update', { ids: ['photo'], patch: { fills: [{ type: 'image', assetId: 'other' }] } })
      expect(boxes.cropTarget(square, 'photo')).toBeNull()
    })
  })

  describe('drawnInFlow', () => {
    it('gives where layers in a flow are drawn in every format of their page, and none for layers in no flow', () => {
      const { boxes } = harness()
      expect(boxes.drawnInFlow(['b'], 'p1')).toEqual({
        'format:sq': { b: { x: 160, y: 500, width: 60, height: 50 } },
        'format:wide': { b: { x: 160, y: 500, width: 60, height: 50 } },
      })
      expect(boxes.drawnInFlow(['dot'], 'p1')).toBeUndefined()
    })
  })

  describe('parentFor', () => {
    it('puts a new layer in the group or frame gone into when it can hold it, else on the page', () => {
      const { session, selection, boxes, square } = harness()
      expect(boxes.parentFor(square, 'graphic', session.design())).toBe('p1')
      selection.enter('card')
      expect(boxes.parentFor(square, 'graphic', session.design())).toBe('card')
      selection.enter('zig')
      expect(boxes.parentFor(square, 'graphic', session.design())).toBe('p1')
    })
  })

  describe('lockedAt', () => {
    it('gives the layer locked in place that a press lands on, and none on a layer that moves', () => {
      const { boxes, square } = harness()
      expect(boxes.lockedAt(square, { x: 605, y: 705 })).toBe('pin')
      expect(boxes.lockedAt(square, { x: 115, y: 125 })).toBeNull()
      expect(boxes.lockedAt(square, { x: 1000, y: 1000 })).toBeNull()
    })
  })

  describe('target', () => {
    it('picks the layer on the page, a selected layer the press is in, or what is directly in the group gone into', () => {
      const { selection, boxes, square, wide } = harness()
      expect(boxes.target('dot', square.key)).toBe('card')
      selection.select(['dot'], square.key)
      expect(boxes.target('dot', square.key)).toBe('dot')
      expect(boxes.target('dot', wide.key)).toBe('card')
      selection.select([], square.key)
      selection.enter('card')
      expect(boxes.target('dot', square.key)).toBe('dot')
      expect(boxes.target('inside', square.key)).toBe('turned')
    })
  })

  describe('insideEntered', () => {
    it('says whether a layer is inside the group or frame gone into, not the container itself', () => {
      const { selection, boxes } = harness()
      expect(boxes.insideEntered('dot')).toBe(false)
      selection.enter('card')
      expect(boxes.insideEntered('dot')).toBe(true)
      expect(boxes.insideEntered('card')).toBe(false)
      expect(boxes.insideEntered('zig')).toBe(false)
    })
  })

  describe('drawnRect', () => {
    it("gives a layer's box as drawn in a frame without its turn, and none for a layer that is gone", () => {
      const { boxes, square, wide } = harness()
      expect(boxes.drawnRect(square, 'dot')).toEqual({ x: 110, y: 120, width: 30, height: 40 })
      expect(boxes.drawnRect(wide, 'dot')).toEqual({ x: 150, y: 120, width: 30, height: 40 })
      expect(boxes.drawnRect(square, 'gone')).toBeNull()
    })
  })
})
