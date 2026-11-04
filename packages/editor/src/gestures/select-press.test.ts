import { describe, expect, it } from 'vitest'

import { render } from '@dazbee/renderer'
import type { DesignInput, Point } from '@dazbee/schema'

import type { Frame } from '../canvas/grid.ts'
import { hitTest } from '../canvas/hit-test.ts'
import { measure, sessionOf, testBoxes } from '../layers/test-boxes.ts'
import { editorSelection } from '../selection.ts'
import { editorSelectPress, type SelectPressDeps } from './select-press.ts'
import type { MarqueeDrag, MoveDrag, ResizeDrag } from './transform-drag.ts'

const rect = (parentId: string, index: string, box: { x: number; y: number; width: number; height: number }) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name: 'Rect',
  props: { rotation: 0, ...box, shape: { kind: 'rect' as const } },
})
/** A frame holding a dot, a box beside it, and a pin locked in place, on one page in a square. */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
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
    box: rect('p1', 'a1', { x: 600, y: 100, width: 100, height: 100 }),
    pin: { ...rect('p1', 'a2', { x: 600, y: 700, width: 10, height: 10 }), lock: { move: true } },
  },
}
const SQUARE = { key: 'p1/sq', pageId: 'p1', formatId: 'sq', x: 0, y: 0, width: 1080, height: 1080 } as Frame

/**
 * The select tool's press over the design on a real session, selection and box queries, at zoom 1
 * with the frame at the canvas's corner, so screen points are design pixels. Logs what it asks of
 * the drags, typing and the canvas.
 */
function harness(handle: ResizeDrag['handle'] | null = null) {
  const session = sessionOf(DESIGN)
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => [SQUARE], changed: () => {} })
  const boxes = testBoxes(session, selection, [SQUARE])
  const deps: SelectPressDeps = {
    canvas: { setPointerCapture: () => log.push('capture') },
    view: {
      camera: () => ({ x: 0, y: 0, zoom: 1 }),
      frames: () => [SQUARE],
      frameOf: (key) => (key === SQUARE.key ? SQUARE : undefined),
    },
    selection,
    boxes,
    typing: { stop: () => log.push('stop typing') },
    transformDrag: {
      handleUnder: () => (handle ? { kind: 'resize', handle } : null),
      pressHandle: (_e, _screen, grab) => {
        log.push(`press handle ${grab.kind}`)
        return { kind: 'resize' } as ResizeDrag
      },
      pressMove: (_frame, _around, _p, ids) => {
        log.push(`press move ${ids.join(' ')}`)
        return { kind: 'move' } as MoveDrag
      },
    },
    autoLayoutDrag: { press: () => null },
  }
  const select = editorSelectPress(deps)
  /** A press at a point, with Shift held when asked, on the layer a press there finds. */
  const press = (p: Point, shiftKey = false) => {
    const deepest = hitTest(render(session.design(), 'p1', 'sq', undefined, measure).layers, p, boxes.pickable)
    return select.press({ pointerId: 1, shiftKey } as PointerEvent, p, { frame: SQUARE, p }, deepest)
  }
  return { select, selection, press, log }
}

describe('editorSelectPress', () => {
  describe('press', () => {
    it('selects the layer on the page under the press, ending typing, and starts moving it', () => {
      const { selection, press, log } = harness()
      expect(press({ x: 115, y: 125 })).toEqual({ kind: 'move' })
      expect(selection.current()).toEqual({ ids: ['card'], frame: 'p1/sq' })
      expect(log).toEqual(['stop typing', 'capture', 'press move card'])
    })

    it('adds a layer to the selection with Shift, or takes it out again', () => {
      const { selection, press } = harness()
      selection.select(['box'], SQUARE.key)
      expect(press({ x: 115, y: 125 }, true)).toEqual({ kind: 'move' })
      expect(selection.current()?.ids).toEqual(['box', 'card'])
      expect(press({ x: 115, y: 125 }, true)).toBeNull()
      expect(selection.current()?.ids).toEqual(['box'])
    })

    it('starts a marquee on nothing, letting the selection go', () => {
      const { selection, press, log } = harness()
      selection.select(['box'], SQUARE.key)
      expect(press({ x: 900, y: 900 })).toEqual({
        kind: 'marquee',
        from: { x: 900, y: 900 },
        to: { x: 900, y: 900 },
        base: [],
        baseFrame: null,
      })
      expect(selection.current()).toBeNull()
      expect(log).toEqual(['stop typing', 'capture'])
    })

    it('grabs a handle of the selection under the press', () => {
      const { selection, press, log } = harness('se')
      selection.select(['box'], SQUARE.key)
      expect(press({ x: 700, y: 200 })).toEqual({ kind: 'resize' })
      expect(log).toEqual(['stop typing', 'press handle resize'])
    })
  })

  describe('moved', () => {
    it('keeps a press a click until the pointer has gone more than the slop from it', () => {
      const { select, selection, press } = harness()
      selection.select(['card', 'box'], SQUARE.key)
      press({ x: 115, y: 125 })
      expect(select.moved({ x: 117, y: 126 })).toBe(false)
      expect(select.moved({ x: 125, y: 125 })).toBe(true)
      expect(select.moved({ x: 115, y: 125 })).toBe(true)
    })
  })

  describe('release', () => {
    it('selects alone the one of several selected layers a click picked, unless it became a drag', () => {
      const { select, selection, press } = harness()
      selection.select(['card', 'box'], SQUARE.key)
      press({ x: 115, y: 125 })
      select.release(null)
      expect(selection.current()?.ids).toEqual(['card'])
      selection.select(['card', 'box'], SQUARE.key)
      press({ x: 115, y: 125 })
      select.moved({ x: 140, y: 140 })
      select.release(null)
      expect(selection.current()?.ids).toEqual(['card', 'box'])
    })

    it('picks the page under a marquee that stayed a click, and the locked layer it was pressed on', () => {
      const { select, selection, press } = harness()
      select.release(press({ x: 900, y: 900 }) as MarqueeDrag)
      expect(selection.pickedPage()).toBe('p1')
      select.release(press({ x: 605, y: 705 }) as MarqueeDrag)
      expect(selection.current()).toEqual({ ids: ['pin'], frame: 'p1/sq' })
    })

    it('lets the page go after a marquee that was dragged', () => {
      const { select, selection, press } = harness()
      selection.pickPage('p1')
      const marquee = press({ x: 900, y: 900 }) as MarqueeDrag
      marquee.to = { x: 1000, y: 1000 }
      select.release(marquee)
      expect(selection.pickedPage()).toBeNull()
    })
  })

  describe('cancel', () => {
    it('forgets the locked layer a press on it would select', () => {
      const { select, selection, press } = harness()
      const marquee = press({ x: 605, y: 705 }) as MarqueeDrag
      select.cancel()
      select.release(marquee)
      expect(selection.current()).toBeNull()
    })
  })
})
