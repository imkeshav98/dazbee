import { describe, expect, it } from 'vitest'

import { childrenOf } from '@dazbee/doc'
import type { DesignInput } from '@dazbee/schema'

import { type Frame, pageFrames } from '../canvas/frames.ts'
import { hug } from '../layers/hug.ts'
import { sessionOf, testBoxes } from '../layers/test-boxes.ts'
import { editorSelection } from '../selection.ts'
import { type AutoLayoutDragDeps, editorAutoLayoutDrag } from './auto-layout-drag.ts'

const square = (parentId: string, index: string) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name: 'Square',
  props: { x: 0, y: 0, width: 50, height: 50, shape: { kind: 'rect' as const } },
})
const row = (parentId: string) => ({
  type: 'box' as const,
  parentId,
  index: 'a0',
  name: 'Row',
  props: { x: 100, y: 100, width: 300, height: 100, layout: { direction: 'row' as const } },
})
const FREE = { x: 600, y: 600, width: 50, height: 50, shape: { kind: 'rect' as const } }
/**
 * One page with a square and a wide frame, each holding its copy of a row laid out by auto layout
 * with three squares in it, and of one square beside it.
 */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1200, height: 628, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    row: { ...row('sq'), link: 'row' },
    one: { ...square('row', 'a0'), link: 'one' },
    two: { ...square('row', 'a1'), link: 'two' },
    three: { ...square('row', 'a2'), link: 'three' },
    free: { ...square('sq', 'a1'), link: 'free', props: FREE },
    'wide-row': { ...row('wide'), link: 'row' },
    'wide-one': { ...square('wide-row', 'a0'), link: 'one' },
    'wide-two': { ...square('wide-row', 'a1'), link: 'two' },
    'wide-three': { ...square('wide-row', 'a2'), link: 'three' },
    'wide-free': { ...square('wide', 'a1'), link: 'free', props: FREE },
  },
}

/** Drags in the row on a real session and selection, at zoom 1 over the square frame, logging what they tell. */
function harness() {
  const session = sessionOf(DESIGN)
  const frames = pageFrames(session.design(), 'p1').frames
  const frame = frames[0] as Frame
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => frames, changed: () => {} })
  const boxes = testBoxes(session, selection, frames)
  const deps: AutoLayoutDragDeps = {
    session,
    boxes,
    camera: () => ({ x: 0, y: 0, zoom: 1 }),
    hug: (ids) => {
      log.push(`hug ${ids.join(',')}`)
      hug(session, ids)
    },
    notify: (notice) => log.push(notice),
    outline: () => {
      throw new Error('nothing is drawn in these tests')
    },
  }
  const reorder = editorAutoLayoutDrag(deps)
  const order = () => childrenOf(session.design(), 'row').map(([id]) => id)
  /** The wide frame's layers as they are now. */
  const wideCopies = () => Object.entries(session.design().nodes).filter(([id]) => id.startsWith('wide-'))
  return { reorder, session, log, frame, frames, order, wideCopies }
}

describe('editorAutoLayoutDrag', () => {
  describe('press', () => {
    it('starts a drag of layers all in one flow, as one undo step', () => {
      const { reorder, session, frame } = harness()
      const drag = reorder.press(frame, [], { x: 125, y: 125 }, ['one'])
      expect(drag).toMatchObject({ kind: 'reorder', parentId: 'row', roots: ['one'], moved: false, outside: false })
      expect(drag?.boxes.get('one')).toMatchObject({ x: 100, y: 100 })
      expect(session.inGesture()).toBe(true)
    })

    it('starts none for layers in no flow, or not all in it', () => {
      const { reorder, session, frame } = harness()
      expect(reorder.press(frame, [], { x: 625, y: 625 }, ['free'])).toBeNull()
      expect(reorder.press(frame, [], { x: 125, y: 125 }, ['one', 'free'])).toBeNull()
      expect(session.inGesture()).toBe(false)
    })
  })

  describe('drag', () => {
    it('waits for the click slop, then follows the point to its place in the flow, or out of it', () => {
      const { reorder, frame } = harness()
      const drag = reorder.press(frame, [], { x: 125, y: 125 }, ['one'])
      if (!drag) throw new Error('no drag')
      reorder.drag(drag, { x: 126, y: 126 })
      expect(drag.moved).toBe(false)
      reorder.drag(drag, { x: 240, y: 125 })
      expect(drag).toMatchObject({ moved: true, slot: 2, near: { id: 'three', after: true }, outside: false })
      reorder.drag(drag, { x: 160, y: 125 })
      expect(drag).toMatchObject({ slot: 0, near: { id: 'two', after: false } })
      reorder.drag(drag, { x: 500, y: 125 })
      expect(drag.outside).toBe(true)
    })
  })

  describe('release', () => {
    it('drops the layers into their new place in the flow, one undo step, leaving the copies in the other frame be', () => {
      const { reorder, session, log, frame, order, wideCopies } = harness()
      const copies = wideCopies()
      const drag = reorder.press(frame, [], { x: 125, y: 125 }, ['one'])
      if (!drag) throw new Error('no drag')
      reorder.drag(drag, { x: 240, y: 125 })
      reorder.release(drag)
      expect(order()).toEqual(['two', 'three', 'one'])
      expect(wideCopies()).toEqual(copies)
      expect(log).toEqual(['hug one'])
      expect(session.inGesture()).toBe(false)
      session.undo()
      expect(order()).toEqual(['one', 'two', 'three'])
    })

    it("takes the layers out of the box to the frame's top level, where they were dropped; the copies in the other frame stay", () => {
      const { reorder, session, frame, order, wideCopies } = harness()
      const copies = wideCopies()
      const drag = reorder.press(frame, [], { x: 125, y: 125 }, ['one'])
      if (!drag) throw new Error('no drag')
      reorder.drag(drag, { x: 525, y: 325 })
      reorder.release(drag)
      expect(order()).toEqual(['two', 'three'])
      expect(session.design().nodes.one?.parentId).toBe('sq')
      expect(session.design().nodes.one?.props).toMatchObject({ x: 500, y: 300 })
      expect(wideCopies()).toEqual(copies)
    })

    it('writes nothing for a drag that stayed a click, or a drop where they were', () => {
      const { reorder, session, frame } = harness()
      const click = reorder.press(frame, [], { x: 125, y: 125 }, ['one'])
      if (!click) throw new Error('no drag')
      reorder.release(click)
      const back = reorder.press(frame, [], { x: 125, y: 125 }, ['one'])
      if (!back) throw new Error('no drag')
      reorder.drag(back, { x: 110, y: 125 })
      reorder.release(back)
      expect(session.canUndo()).toBe(false)
    })
  })

  describe('nudge', () => {
    it('moves layers one place along the flow, as one undo step', () => {
      const { reorder, session, order } = harness()
      reorder.nudge(['one'], 1, 0, session.design())
      expect(order()).toEqual(['two', 'one', 'three'])
      reorder.nudge(['one'], -1, 0, session.design())
      expect(order()).toEqual(['one', 'two', 'three'])
    })

    it('says why it does nothing: across the flow auto layout decides, and past its end there is no place', () => {
      const { reorder, session, log, order } = harness()
      reorder.nudge(['one'], 0, 1, session.design())
      reorder.nudge(['one'], -1, 0, session.design())
      reorder.nudge(['three'], 1, 0, session.design())
      expect(log).toEqual(['placedByLayout', 'flowEnd', 'flowEnd'])
      expect(order()).toEqual(['one', 'two', 'three'])
    })
  })
})
