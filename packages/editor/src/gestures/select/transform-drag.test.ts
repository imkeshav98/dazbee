import { describe, expect, it } from 'vitest'

import { render } from '@dazbee/renderer'
import type { DesignInput } from '@dazbee/schema'

import { type Frame, pageFrames } from '../../canvas/frames.ts'
import { hug } from '../../layers/hug.ts'
import { measure, sessionOf, testBoxes } from '../../layers/test-boxes.ts'
import type { Box } from '../../layers/transform.ts'
import { editorSelection } from '../../selection.ts'
import { carried, editorTransformDrag, type TransformDrag, type TransformDragDeps } from './transform-drag.ts'

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
  props: { ...box, shape: { kind: 'rect' as const }, ...extra },
})
const words = (parentId: string) => ({
  type: 'text' as const,
  parentId,
  index: 'a4',
  name: 'Words',
  props: {
    x: 700,
    y: 100,
    width: 200,
    height: 48,
    text: 'Hello',
    boxMode: 'fixed' as const,
    style: { fontFamily: 'Noto Sans', fontSize: 20, color: '#000000FF' },
    runs: [{ start: 0, end: 2, style: { fontSize: 40 } }],
  },
})
/**
 * One page with a square frame and a wide one. The square holds two squares side by side, a layer
 * locked in place, a row laid out by auto layout holding one square, and a text with a run of its
 * own size; the wide frame holds copies of the first square and the text.
 */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1200, height: 628, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    a: { ...rect('sq', 'a0', { x: 100, y: 100, width: 100, height: 100 }), link: 'a' },
    b: { ...rect('sq', 'a1', { x: 400, y: 100, width: 100, height: 100 }), link: 'b' },
    pin: { ...rect('sq', 'a2', { x: 700, y: 700, width: 50, height: 50 }), link: 'pin', lock: { move: true } },
    row: {
      type: 'box',
      parentId: 'sq',
      link: 'row',
      index: 'a3',
      name: 'Row',
      props: { x: 100, y: 500, width: 300, height: 100, layout: { direction: 'row' } },
    },
    c: { ...rect('row', 'a0', { x: 0, y: 0, width: 50, height: 50 }), link: 'c' },
    words: { ...words('sq'), link: 'words' },
    'wide-a': { ...rect('wide', 'a0', { x: 100, y: 100, width: 100, height: 100 }), link: 'a' },
    'wide-words': { ...words('wide'), link: 'words' },
  },
}
const pointer = { pointerId: 1 } as PointerEvent

/** The drags over the design on a real session and selection, at zoom 1 over the square frame, logging what they ask for. */
function harness() {
  const session = sessionOf(DESIGN)
  const frames = pageFrames(session.design(), 'p1').frames
  const frame = frames[0] as Frame
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => frames, changed: () => {} })
  const deps: TransformDragDeps = {
    canvas: { setPointerCapture: () => {} } as unknown as HTMLCanvasElement,
    session,
    scenes: { scene: (f) => render(session.design(), f.id, undefined, measure) },
    selection,
    typing: { editing: () => null, fitText: (id) => log.push(`fit ${id}`) },
    boxes: testBoxes(session, selection, frames),
    camera: () => ({ x: 0, y: 0, zoom: 1 }),
    frames: () => frames,
    hug: (ids) => {
      log.push(`hug ${ids.join(',')}`)
      hug(session, ids)
    },
    notify: (notice) => log.push(notice),
    placeBox: () => {},
  }
  const drag = editorTransformDrag(deps)
  /** A layer's box. */
  const boxOf = (id: string) => {
    const p = session.design().nodes[id]?.props as Omit<Box, 'rotation'> & { rotation?: number }
    return { x: p.x, y: p.y, width: p.width, height: p.height, rotation: p.rotation ?? 0 }
  }
  /** The wide frame's copies as they are now. */
  const copies = () => [session.design().nodes['wide-a'], session.design().nodes['wide-words']]
  /** Presses on the selection, as the editor does with the box it is drawn in. */
  const pressSelection = (screen: { x: number; y: number }) => {
    const outer = deps.boxes.selectionBox()
    const grabbed = drag.handleUnder(screen)
    if (!outer || !grabbed) throw new Error('no handle there')
    return drag.pressHandle(pointer, screen, grabbed, outer)
  }
  return { drag, session, selection, log, frame, boxOf, copies, pressSelection, boxes: deps.boxes }
}

describe('editorTransformDrag', () => {
  describe('snapWork', () => {
    it('starts at nothing', () => {
      const { drag } = harness()
      expect(drag.snapWork()).toEqual({ gathered: 0, moves: 0, targets: 0 })
    })
  })

  describe('handleUnder', () => {
    it('finds the handle under a point, the zone outside a corner that turns, or nothing', () => {
      const { drag, selection, frame } = harness()
      expect(drag.handleUnder({ x: 200, y: 200 })).toBeNull()
      selection.select(['a'], frame.id)
      expect(drag.handleUnder({ x: 202, y: 198 })).toEqual({ kind: 'resize', handle: 'se' })
      expect(drag.handleUnder({ x: 150, y: 100 })).toEqual({ kind: 'resize', handle: 'n' })
      expect(drag.handleUnder({ x: 215, y: 215 })).toEqual({ kind: 'rotate', corner: 2 })
      expect(drag.handleUnder({ x: 150, y: 150 })).toBeNull()
      expect(drag.handleUnder({ x: 300, y: 300 })).toBeNull()
    })

    it('finds none on a selection locked in place', () => {
      const { drag, selection, frame } = harness()
      selection.select(['pin'], frame.id)
      expect(drag.handleUnder({ x: 750, y: 750 })).toBeNull()
    })
  })

  describe('pressHandle and resize', () => {
    it('resizes from the handle grabbed, as one undo step', () => {
      const { drag, session, selection, frame, boxOf, pressSelection } = harness()
      selection.select(['a'], frame.id)
      const resize = pressSelection({ x: 200, y: 150 })
      expect(resize).toMatchObject({ kind: 'resize', handle: 'e', roots: ['a'] })
      expect(drag.snapWork().gathered).toBe(1)
      if (resize.kind !== 'resize') throw new Error('not a resize')
      drag.drag(resize, { x: 250, y: 150 }, false, false, false)
      expect(boxOf('a')).toMatchObject({ x: 100, y: 100, width: 150, height: 100 })
      drag.drag(resize, { x: 250, y: 150 }, false, true, false)
      expect(boxOf('a')).toMatchObject({ x: 50, width: 200 })
      drag.release(resize)
      session.undo()
      expect(boxOf('a')).toMatchObject({ x: 100, width: 100 })
    })

    it('keeps the shape with Shift on a corner', () => {
      const { drag, selection, frame, boxOf, pressSelection } = harness()
      selection.select(['a'], frame.id)
      const resize = pressSelection({ x: 200, y: 200 })
      drag.drag(resize, { x: 300, y: 220 }, true, false, false)
      expect(boxOf('a')).toMatchObject({ width: 200, height: 200 })
    })

    it("scales a text's sizes from a corner, its own runs' too, leaving its copy in the other frame be", () => {
      const { drag, session, selection, frame, copies, pressSelection } = harness()
      const before = copies()
      selection.select(['words'], frame.id)
      const resize = pressSelection({ x: 900, y: 148 })
      expect(resize).toMatchObject({ kind: 'resize', handle: 'se' })
      drag.drag(resize, { x: 1100, y: 196 }, false, false, false)
      expect(session.design().nodes.words?.props).toMatchObject({
        width: 400,
        height: 96,
        style: { fontSize: 40 },
        runs: [{ start: 0, end: 2, style: { fontSize: 80 } }],
      })
      expect(copies()).toEqual(before)
      drag.release(resize)
      session.undo()
      expect(session.design().nodes.words?.props).toMatchObject({
        style: { fontSize: 20 },
        runs: [{ start: 0, end: 2, style: { fontSize: 40 } }],
      })
    })
  })

  describe('pressHandle and rotate', () => {
    it('turns the layer about its centre from outside a corner, in 15° steps with Shift', () => {
      const { drag, selection, frame, boxOf, pressSelection } = harness()
      selection.select(['a'], frame.id)
      const rotate = pressSelection({ x: 210, y: 210 })
      expect(rotate).toMatchObject({ kind: 'rotate', roots: ['a'] })
      // From the bottom right corner to straight below the centre: an eighth of a turn.
      drag.drag(rotate, { x: 150, y: 220 }, false, false, false)
      expect(boxOf('a').rotation).toBe(45)
      drag.drag(rotate, { x: 160, y: 220 }, true, false, false)
      expect(boxOf('a').rotation % 15).toBe(0)
    })
  })

  describe('pressMove and move', () => {
    it('moves the layers by whole pixels as one undo step, gathering what they snap to once', () => {
      const { drag, session, log, frame, boxOf } = harness()
      const move = drag.pressMove(frame, [], { x: 150, y: 150 }, ['a'])
      expect(session.inGesture()).toBe(true)
      expect(drag.snapWork()).toMatchObject({ gathered: 1, moves: 0 })
      drag.drag(move, { x: 160.4, y: 170.6 }, false, false, false)
      expect(boxOf('a')).toMatchObject({ x: 110, y: 121 })
      expect(drag.snapWork().moves).toBe(0)
      drag.drag(move, { x: 170, y: 190 }, false, false, false)
      drag.release(move)
      expect(log).toEqual(['hug a'])
      expect(session.inGesture()).toBe(false)
      session.undo()
      expect(boxOf('a')).toMatchObject({ x: 100, y: 100 })
    })

    it('moves the layer in its frame, leaving its copy in the other frame be', () => {
      const { drag, frame, boxOf, copies } = harness()
      const before = copies()
      const move = drag.pressMove(frame, [], { x: 150, y: 150 }, ['a'])
      drag.drag(move, { x: 160, y: 150 }, false, false, false)
      expect(boxOf('a')).toMatchObject({ x: 110, y: 100 })
      expect(copies()).toEqual(before)
    })

    it('keeps a move to one axis with Shift', () => {
      const { drag, frame, boxOf } = harness()
      const move = drag.pressMove(frame, [], { x: 150, y: 150 }, ['a'])
      drag.drag(move, { x: 180, y: 160 }, true, false, false)
      expect(boxOf('a')).toMatchObject({ x: 130, y: 100 })
    })

    it('snaps to the layers beside it, counting each move that snaps', () => {
      const { drag, frame, boxOf } = harness()
      const move = drag.pressMove(frame, [], { x: 150, y: 150 }, ['a'])
      const { targets } = drag.snapWork()
      // The frame's other top-level layers (b, pin, row, words) and the frame itself.
      expect(targets).toBe(5)
      drag.drag(move, { x: 347, y: 150 }, false, false, true)
      // The right edge lands on b's left edge, 3 pixels away.
      expect(boxOf('a')).toMatchObject({ x: 300 })
      drag.drag(move, { x: 348, y: 150 }, false, false, true)
      expect(drag.snapWork()).toEqual({ gathered: 1, moves: 2, targets })
    })

    it('leaves layers in a flow among others where they are, and says auto layout places them', () => {
      const { drag, log, frame } = harness()
      const move = drag.pressMove(frame, [], { x: 150, y: 150 }, ['a', 'c'])
      expect(move.roots).toEqual(['a'])
      expect(log).toEqual(['placedByLayout'])
    })
  })

  describe('writeBoxes', () => {
    it('writes only what changed from the start, and a change put back', () => {
      const { drag, session, frame, boxes } = harness()
      const start = boxes.startBoxes(frame, ['a'])
      const was = start.get('a')
      if (!was) throw new Error('no box')
      drag.writeBoxes(frame, start, new Map([['a', { ...was, x: 120 }]]))
      expect(session.design().nodes.a?.props).toMatchObject({ x: 120, y: 100 })
      drag.writeBoxes(frame, start, new Map([['a', { ...was, y: 130 }]]))
      expect(session.design().nodes.a?.props).toMatchObject({ x: 100, y: 130 })
    })
  })

  describe('marquee', () => {
    it('selects the layers it touches that can be picked, with those selected before', () => {
      const { drag, selection, frame } = harness()
      drag.marquee({ kind: 'marquee', from: { x: 50, y: 50 }, to: { x: 450, y: 150 }, base: [], baseFrame: null })
      expect(selection.current()).toEqual({ frameId: frame.id, ids: ['a', 'b'] })
      drag.marquee({
        kind: 'marquee',
        from: { x: 650, y: 650 },
        to: { x: 800, y: 800 },
        base: ['b'],
        baseFrame: frame.id,
      })
      expect(selection.current()).toEqual({ frameId: frame.id, ids: ['b'] })
      drag.marquee({ kind: 'marquee', from: { x: 650, y: 650 }, to: { x: 800, y: 800 }, base: [], baseFrame: null })
      expect(selection.current()).toBeNull()
    })
  })
})

describe('carried', () => {
  it('is the frame and the layers a move, resize or turn carries, and nothing for any other gesture', () => {
    const frame = { id: 'sq' } as Frame
    for (const kind of ['move', 'resize', 'rotate'])
      expect(carried({ kind, frame, roots: ['a', 'b'] } as unknown as TransformDrag)).toEqual({
        frame,
        roots: ['a', 'b'],
      })
    expect(carried({ kind: 'marquee' })).toBeNull()
    expect(carried(null)).toBeNull()
  })
})
