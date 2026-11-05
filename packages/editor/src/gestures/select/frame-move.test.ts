import { describe, expect, it } from 'vitest'

import type { DesignInput, Point } from '@dazbee/schema'

import type { Frame } from '../../canvas/frames.ts'
import { sessionOf } from '../../layers/test-boxes.ts'
import { dragFrame, type FrameMoveDrag, pressFrame, releaseFrame } from './frame-move.ts'

/** Two frames on one page, the square holding a dot. */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1200, height: 628, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    dot: {
      type: 'graphic',
      parentId: 'sq',
      link: 'dot',
      index: 'a0',
      name: 'Dot',
      props: { x: 10, y: 10, width: 40, height: 40, rotation: 0, shape: { kind: 'ellipse' } },
    },
  },
}
const SQUARE: Frame = { id: 'sq', pageId: 'p1', name: 'Square', x: 0, y: 0, width: 1080, height: 1080 }

function harness() {
  const session = sessionOf(DESIGN)
  const drag = (...args: [FrameMoveDrag, Point, Point, boolean]) => dragFrame(session, ...args)
  const where = (id: string) => {
    const frame = session.design().frames[id]
    return frame && { x: frame.x, y: frame.y }
  }
  return { session, drag, where }
}

describe('frame moves', () => {
  describe('dragFrame', () => {
    it('moves the frame by how far the pointer went, in whole design pixels, its layers with it', () => {
      const { session, drag, where } = harness()
      const g = pressFrame(SQUARE, { x: 100, y: 100 }, { x: 40, y: 40 })
      drag(g, { x: 150, y: 130 }, { x: 140.4, y: 99.6 }, false)
      expect(where('sq')).toEqual({ x: 100, y: 60 })
      drag(g, { x: 160, y: 140 }, { x: 240, y: 340 }, false)
      expect(where('sq')).toEqual({ x: 200, y: 300 })
      expect(session.design().nodes.dot?.props).toMatchObject({ x: 10, y: 10 })
      expect(where('wide')).toEqual({ x: 1280, y: 0 })
    })

    it('waits until the pointer has gone further than a click may wander', () => {
      const { drag, where } = harness()
      const g = pressFrame(SQUARE, { x: 100, y: 100 }, { x: 40, y: 40 })
      drag(g, { x: 102, y: 101 }, { x: 60, y: 50 }, false)
      expect(where('sq')).toEqual({ x: 0, y: 0 })
      drag(g, { x: 110, y: 100 }, { x: 60, y: 50 }, false)
      expect(where('sq')).toEqual({ x: 20, y: 10 })
    })

    it('keeps to the axis it went furthest along with Shift', () => {
      const { drag, where } = harness()
      const g = pressFrame(SQUARE, { x: 100, y: 100 }, { x: 0, y: 0 })
      drag(g, { x: 200, y: 120 }, { x: 300, y: 40 }, true)
      expect(where('sq')).toEqual({ x: 300, y: 0 })
      drag(g, { x: 120, y: 200 }, { x: 40, y: 500 }, true)
      expect(where('sq')).toEqual({ x: 0, y: 500 })
    })

    it('leaves a frame another tab deleted mid-drag be', () => {
      const { session, drag } = harness()
      const g = pressFrame(SQUARE, { x: 100, y: 100 }, { x: 0, y: 0 })
      drag(g, { x: 200, y: 200 }, { x: 100, y: 100 }, false)
      session.run('frame.delete', { frameId: 'sq' })
      expect(() => drag(g, { x: 300, y: 300 }, { x: 200, y: 200 }, false)).not.toThrow()
      releaseFrame(g)
    })
  })

  describe('releaseFrame', () => {
    it('makes the whole drag one undo step', () => {
      const { session, drag, where } = harness()
      const g = pressFrame(SQUARE, { x: 100, y: 100 }, { x: 0, y: 0 })
      for (const d of [20, 40, 80]) drag(g, { x: 100 + d, y: 100 }, { x: d, y: 0 }, false)
      releaseFrame(g)
      expect(where('sq')).toEqual({ x: 80, y: 0 })
      session.run('frame.update', { frameId: 'sq', name: 'Sale' })
      session.undo()
      expect(where('sq')).toEqual({ x: 80, y: 0 })
      session.undo()
      expect(where('sq')).toEqual({ x: 0, y: 0 })
      expect(session.canUndo()).toBe(false)
      session.redo()
      expect(where('sq')).toEqual({ x: 80, y: 0 })
    })

    it('writes nothing for a press that never moved', () => {
      const { session } = harness()
      releaseFrame(pressFrame(SQUARE, { x: 100, y: 100 }, { x: 0, y: 0 }))
      expect(session.canUndo()).toBe(false)
    })
  })
})
