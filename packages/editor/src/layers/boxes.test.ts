import { describe, expect, it } from 'vitest'

import type { SceneLayer } from '@dazbee/renderer'
import type { DesignInput } from '@dazbee/schema'

import { type Frame, pageFrames } from '../canvas/frames.ts'
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
 * The square frame's layers: a box holding a dot and a tag, a group turned 90° holding a square, a
 * row laid out by auto layout, a path, a photo with an image fill over a solid one, a layer locked
 * in place, and a text that grows with its words.
 */
const SQUARE_LAYERS: DesignInput['nodes'] = {
  card: {
    type: 'box',
    parentId: 'sq',
    link: 'card',
    index: 'a0',
    name: 'Card',
    props: { x: 100, y: 100, width: 400, height: 300 },
  },
  dot: { ...rect('card', 'a0', { x: 110, y: 120, width: 30, height: 40 }), link: 'dot' },
  tag: { ...rect('card', 'a1', { x: 300, y: 300, width: 20, height: 20 }), link: 'tag' },
  turned: {
    type: 'group',
    parentId: 'sq',
    link: 'turned',
    index: 'a1',
    name: 'Turned',
    props: { x: 600, y: 100, width: 200, height: 200, rotation: 90 },
  },
  inside: { ...rect('turned', 'a0', { x: 600, y: 100, width: 20, height: 20 }), link: 'inside' },
  row: {
    type: 'box',
    parentId: 'sq',
    link: 'row',
    index: 'a2',
    name: 'Row',
    props: { x: 100, y: 500, width: 300, height: 100, layout: { direction: 'row', gap: 10 } },
  },
  a: { ...rect('row', 'a0', { x: 0, y: 0, width: 50, height: 50 }), link: 'a' },
  b: { ...rect('row', 'a1', { x: 0, y: 0, width: 60, height: 50 }), link: 'b' },
  zig: {
    type: 'graphic',
    parentId: 'sq',
    link: 'zig',
    index: 'a3',
    name: 'Zig',
    props: { x: 100, y: 700, width: 100, height: 100, shape: { kind: 'path', d: 'M0 0 L100 0 L100 100' } },
  },
  photo: {
    ...rect(
      'sq',
      'a4',
      { x: 300, y: 700, width: 200, height: 100 },
      {
        fills: [
          { type: 'solid', color: '#FF0000FF' },
          { type: 'image', assetId: 'a1' },
        ],
      },
    ),
    link: 'photo',
  },
  pin: { ...rect('sq', 'a5', { x: 600, y: 700, width: 10, height: 10 }), link: 'pin', lock: { move: true } },
  label: {
    type: 'text',
    parentId: 'sq',
    link: 'label',
    index: 'a6',
    name: 'Label',
    props: { x: 700, y: 700, width: 20, height: 24, text: 'Hi', boxMode: 'autoWidth', style: STYLE },
  },
}
/**
 * One page with a square frame and a wide one. The square holds SQUARE_LAYERS; the wide frame holds
 * a copy of each, `wide-<id>`, linked to it, its dot moved and hidden.
 */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1200, height: 628, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    ...SQUARE_LAYERS,
    ...Object.fromEntries(
      Object.entries(SQUARE_LAYERS).map(([id, node]) => [
        `wide-${id}`,
        { ...node, parentId: node.parentId === 'sq' ? 'wide' : `wide-${node.parentId}` },
      ]),
    ),
    'wide-dot': {
      ...rect('wide-card', 'a0', { x: 150, y: 120, width: 30, height: 40 }, { visible: false }),
      link: 'dot',
    },
  },
}

/** The box queries over the design on a real session and selection, in its square and wide frames. */
function harness() {
  const session = sessionOf(DESIGN)
  const frames = pageFrames(session.design(), 'p1').frames
  const selection = editorSelection({ drawn: () => session.design(), frames: () => frames, changed: () => {} })
  const boxes = testBoxes(session, selection, frames, { a1: { width: 400, height: 400 } })
  const [square, wide] = frames as [Frame, Frame]
  return { session, selection, boxes, square, wide }
}
const layer = (id: string) => ({ id }) as SceneLayer

describe('visibleIn', () => {
  it('says whether a layer shows: its copy in another frame may be hidden while it shows', () => {
    const { session } = harness()
    expect(visibleIn(session.design(), 'dot')).toBe(true)
    expect(visibleIn(session.design(), 'wide-dot')).toBe(false)
  })
})

describe('editorBoxes', () => {
  describe('boxIn', () => {
    it("reads a layer's own box in its frame, and its copy's in the other", () => {
      const { boxes, square, wide } = harness()
      expect(boxes.boxIn(square, 'dot')).toEqual({ x: 110, y: 120, width: 30, height: 40, rotation: 0 })
      expect(boxes.boxIn(wide, 'wide-dot')).toEqual({ x: 150, y: 120, width: 30, height: 40, rotation: 0 })
      expect(boxes.boxIn(square, 'gone')).toBeNull()
    })

    it('takes the box auto layout gives a layer in a flow, from the scene', () => {
      const { boxes, square } = harness()
      expect(boxes.boxIn(square, 'a')).toMatchObject({ x: 100, y: 500, width: 50, height: 50 })
      expect(boxes.boxIn(square, 'b')).toMatchObject({ x: 160, y: 500, width: 60, height: 50 })
    })
  })

  describe('containersOf', () => {
    it('gives the groups and boxes a layer is inside, outermost first, as boxes', () => {
      const { boxes, square } = harness()
      expect(boxes.containersOf(square, 'turned')).toEqual([{ x: 600, y: 100, width: 200, height: 200, rotation: 90 }])
      expect(boxes.containersOf(square, 'sq')).toEqual([])
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
    it('says whether a point in the frame is inside a layer as drawn', () => {
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
      selection.select(['inside'], square.id)
      expect(boxes.selectionBox()).toMatchObject({
        frame: square,
        box: { x: 600, y: 100, width: 20, height: 20, rotation: 0 },
        drawn: { rotation: 90 },
        around: [{ x: 600, y: 100, rotation: 90 }],
      })
      selection.select(['dot', 'zig'], square.id)
      expect(boxes.selectionBox()?.box).toEqual({ x: 100, y: 120, width: 100, height: 680, rotation: 0 })
    })
  })

  describe('roots', () => {
    it('leaves out selected layers inside another selected layer, and layers that are gone', () => {
      const { session, selection, boxes, square } = harness()
      selection.select(['dot', 'card', 'zig'], square.id)
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
      selection.select(['dot', 'pin'], square.id)
      expect(boxes.lockedSelection()).toBe(true)
    })
  })

  describe('handlesFor', () => {
    it('gives every handle, none while locked, and no top or bottom one to text that grows with its words', () => {
      const { selection, boxes, square } = harness()
      expect(boxes.handlesFor()).toEqual([])
      selection.select(['dot'], square.id)
      expect(boxes.handlesFor()).toHaveLength(8)
      selection.select(['label'], square.id)
      expect(boxes.handlesFor()).toEqual(['nw', 'ne', 'e', 'se', 'sw', 'w'])
      selection.select(['pin'], square.id)
      expect(boxes.handlesFor()).toEqual([])
    })
  })

  describe('snapBoxes', () => {
    it("gives the frame's other top-level layers as drawn, leaving out those holding the dragged ones", () => {
      const { boxes, square } = harness()
      const besideZig = boxes.snapBoxes(square, ['zig'], [])
      expect(besideZig).toHaveLength(6)
      expect(besideZig).toContainEqual({ x: 100, y: 100, width: 400, height: 300, rotation: 0 })
      expect(besideZig).not.toContainEqual({ x: 100, y: 700, width: 100, height: 100, rotation: 0 })
    })

    it('inside a group or box, adds the container and the layers beside the dragged ones that show in the frame', () => {
      const { boxes, square, wide } = harness()
      const dot = { x: 110, y: 120, width: 30, height: 40, rotation: 0 }
      const inSquare = boxes.snapBoxes(square, ['tag'], [])
      expect(inSquare).toHaveLength(8)
      expect(inSquare?.slice(-2)).toEqual([{ x: 100, y: 100, width: 400, height: 300, rotation: 0 }, dot])
      expect(boxes.snapBoxes(wide, ['wide-tag'], [])).toHaveLength(7)
      expect(boxes.snapBoxes(wide, ['wide-tag'], [])).not.toContainEqual({ ...dot, x: 150 })
    })

    it('gives none inside a turned container, whose lines do not run along the frame', () => {
      const { boxes, square } = harness()
      expect(
        boxes.snapBoxes(square, ['inside'], [{ x: 600, y: 100, width: 200, height: 200, rotation: 90 }]),
      ).toBeNull()
    })
  })

  describe('pathIn', () => {
    it("gives a path layer's path in its frame, with its box and what turns it", () => {
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
    it('gives where layers in a flow are drawn in their frame, and none for layers in no flow', () => {
      const { boxes } = harness()
      expect(boxes.drawnInFlow(['b'])).toEqual({ b: { x: 160, y: 500, width: 60, height: 50 } })
      expect(boxes.drawnInFlow(['wide-a', 'wide-b'])).toEqual({
        'wide-a': { x: 100, y: 500, width: 50, height: 50 },
        'wide-b': { x: 160, y: 500, width: 60, height: 50 },
      })
      expect(boxes.drawnInFlow(['dot'])).toBeUndefined()
    })
  })

  describe('parentFor', () => {
    it("puts a new layer in the group or box gone into when it can hold it, else at the frame's top level", () => {
      const { session, selection, boxes, square } = harness()
      expect(boxes.parentFor(square, 'graphic', session.design())).toBe('sq')
      selection.enter('card')
      expect(boxes.parentFor(square, 'graphic', session.design())).toBe('card')
      selection.enter('zig')
      expect(boxes.parentFor(square, 'graphic', session.design())).toBe('sq')
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
    it('picks the top-level layer, a selected layer the press is in, or what is directly in the group gone into', () => {
      const { selection, boxes, square, wide } = harness()
      expect(boxes.target('dot', square.id)).toBe('card')
      selection.select(['dot'], square.id)
      expect(boxes.target('dot', square.id)).toBe('dot')
      expect(boxes.target('wide-dot', wide.id)).toBe('wide-card')
      selection.select([], square.id)
      selection.enter('card')
      expect(boxes.target('dot', square.id)).toBe('dot')
      expect(boxes.target('inside', square.id)).toBe('turned')
    })
  })

  describe('insideEntered', () => {
    it('says whether a layer is inside the group or box gone into, not the container itself', () => {
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
      expect(boxes.drawnRect(wide, 'wide-dot')).toEqual({ x: 150, y: 120, width: 30, height: 40 })
      expect(boxes.drawnRect(square, 'gone')).toBeNull()
    })
  })
})
