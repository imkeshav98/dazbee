import { describe, expect, it } from 'vitest'

import { render } from '@dazbee/renderer'
import type { DesignInput, Point } from '@dazbee/schema'

import type { Frame } from '../../canvas/frames.ts'
import { hitTest } from '../../canvas/hit-test.ts'
import { testLooks } from '../../canvas/test-looks.ts'
import { measure, sessionOf, testBoxes } from '../../layers/test-boxes.ts'
import { editorSelection } from '../../selection.ts'
import { editorFrameMove } from './frame-move.ts'
import { editorSelectPress, type SelectPressDeps } from './select-press.ts'
import type { MarqueeDrag, MoveDrag, ResizeDrag } from './transform-drag.ts'

const rect = (parentId: string, index: string, box: { x: number; y: number; width: number; height: number }) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name: 'Rect',
  props: { rotation: 0, ...box, shape: { kind: 'rect' as const } },
})
/** A box holding a dot, a square beside it, and a pin locked in place, in one square frame. */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: { sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' } },
  nodes: {
    card: {
      type: 'box',
      parentId: 'sq',
      link: 'card',
      index: 'a0',
      name: 'Card',
      props: { x: 100, y: 100, width: 400, height: 300 },
    },
    dot: { ...rect('card', 'a0', { x: 110, y: 120, width: 30, height: 40 }), link: 'dot' },
    box: { ...rect('sq', 'a1', { x: 600, y: 100, width: 100, height: 100 }), link: 'box' },
    pin: { ...rect('sq', 'a2', { x: 600, y: 700, width: 10, height: 10 }), link: 'pin', lock: { move: true } },
  },
}
const SQUARE: Frame = { id: 'sq', pageId: 'p1', name: 'Square', x: 0, y: 0, width: 1080, height: 1080 }
const looks = testLooks()

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
      design: () => session.design(),
      frames: () => [SQUARE],
      frameOf: (key) => (key === SQUARE.id ? SQUARE : undefined),
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
    frameMove: editorFrameMove({ session }),
  }
  const select = editorSelectPress(deps)
  /** A press at a point, with Shift held when asked, on the layer a press there finds. */
  const press = (p: Point, shiftKey = false) => {
    const deepest = hitTest(render(session.design(), 'sq', undefined, measure).layers, p, looks, {
      pickable: boxes.pickable,
    })
    return select.press({ pointerId: 1, shiftKey } as PointerEvent, p, { frame: SQUARE, p }, deepest)
  }
  /** A press off every frame, on empty canvas. */
  const pressOff = (p: Point, shiftKey = false) =>
    select.press({ pointerId: 1, shiftKey } as PointerEvent, p, null, null)
  return { select, selection, press, pressOff, log }
}

describe('editorSelectPress', () => {
  describe('press', () => {
    it('selects the top-level layer under the press, ending typing, and starts moving it', () => {
      const { selection, press, log } = harness()
      expect(press({ x: 115, y: 125 })).toEqual({ kind: 'move' })
      expect(selection.current()).toEqual({ ids: ['card'], frameId: 'sq' })
      expect(log).toEqual(['stop typing', 'capture', 'press move card'])
    })

    it('adds a layer to the selection with Shift, or takes it out again', () => {
      const { selection, press } = harness()
      selection.select(['box'], SQUARE.id)
      expect(press({ x: 115, y: 125 }, true)).toEqual({ kind: 'move' })
      expect(selection.current()?.ids).toEqual(['box', 'card'])
      expect(press({ x: 115, y: 125 }, true)).toBeNull()
      expect(selection.current()?.ids).toEqual(['box'])
    })

    it("starts a marquee on a frame's empty area, letting the selection and the group gone into go", () => {
      const { selection, press, log } = harness()
      selection.enter('card')
      selection.select(['dot'], SQUARE.id)
      expect(press({ x: 900, y: 900 })).toEqual({
        kind: 'marquee',
        from: { x: 900, y: 900 },
        to: { x: 900, y: 900 },
        base: [],
        baseFrame: null,
      })
      expect(selection.current()).toBeNull()
      expect(selection.entered()).toBeNull()
      expect(log).toEqual(['stop typing', 'capture'])
    })

    it("starts a marquee on a picked frame's empty area, leaving the frame where it is", () => {
      const { selection, press } = harness()
      selection.pickFrame('sq')
      expect(press({ x: 900, y: 900 })).toMatchObject({ kind: 'marquee', base: [] })
    })

    it('starts a marquee off every frame, letting the selection and the picked frame go', () => {
      const { selection, pressOff, log } = harness()
      selection.select(['box'], SQUARE.id)
      expect(pressOff({ x: 1200, y: 900 })).toEqual({
        kind: 'marquee',
        from: { x: 1200, y: 900 },
        to: { x: 1200, y: 900 },
        base: [],
        baseFrame: null,
      })
      expect(selection.current()).toBeNull()
      expect(log).toEqual(['stop typing', 'capture'])
    })

    it("starts a marquee on a frame's empty area with Shift, adding to the selection", () => {
      const { selection, press } = harness()
      selection.select(['box'], SQUARE.id)
      expect(press({ x: 900, y: 900 }, true)).toMatchObject({ kind: 'marquee', base: ['box'], baseFrame: 'sq' })
      expect(selection.pickedFrame()).toBeNull()
    })

    it('starts a marquee on a locked layer, which a click then selects', () => {
      const { selection, press } = harness()
      expect(press({ x: 605, y: 705 })).toMatchObject({ kind: 'marquee' })
      expect(selection.pickedFrame()).toBeNull()
    })

    it('grabs a handle of the selection under the press', () => {
      const { selection, press, log } = harness('se')
      selection.select(['box'], SQUARE.id)
      expect(press({ x: 700, y: 200 })).toEqual({ kind: 'resize' })
      expect(log).toEqual(['stop typing', 'press handle resize'])
    })
  })

  describe('pressLabel', () => {
    it('picks the frame, ending typing and letting the selection and the group gone into go, and starts moving it', () => {
      const { select, selection, log } = harness()
      selection.enter('card')
      selection.select(['dot'], SQUARE.id)
      expect(select.pressLabel({ pointerId: 1 } as PointerEvent, { x: 40, y: -10 }, 'sq')).toMatchObject({
        kind: 'frameMove',
        frame: SQUARE,
        pressedAt: { x: 40, y: -10 },
        from: { x: 40, y: -10 },
      })
      expect(selection.current()).toBeNull()
      expect(selection.entered()).toBeNull()
      expect(selection.pickedFrame()).toBe('sq')
      expect(log).toEqual(['stop typing', 'capture'])
    })

    it('does nothing for a frame the shown page lacks', () => {
      const { select, selection, log } = harness()
      selection.select(['box'], SQUARE.id)
      expect(select.pressLabel({ pointerId: 1 } as PointerEvent, { x: 40, y: -10 }, 'gone')).toBeNull()
      expect(selection.current()?.ids).toEqual(['box'])
      expect(log).toEqual([])
    })
  })

  describe('moved', () => {
    it('keeps a press a click until the pointer has gone more than the slop from it', () => {
      const { select, selection, press } = harness()
      selection.select(['card', 'box'], SQUARE.id)
      press({ x: 115, y: 125 })
      expect(select.moved({ x: 117, y: 126 })).toBe(false)
      expect(select.moved({ x: 125, y: 125 })).toBe(true)
      expect(select.moved({ x: 115, y: 125 })).toBe(true)
    })
  })

  describe('release', () => {
    it('selects alone the one of several selected layers a click picked, unless it became a drag', () => {
      const { select, selection, press } = harness()
      selection.select(['card', 'box'], SQUARE.id)
      press({ x: 115, y: 125 })
      select.release(null)
      expect(selection.current()?.ids).toEqual(['card'])
      selection.select(['card', 'box'], SQUARE.id)
      press({ x: 115, y: 125 })
      select.moved({ x: 140, y: 140 })
      select.release(null)
      expect(selection.current()?.ids).toEqual(['card', 'box'])
    })

    it('picks the frame a click on its empty area was pressed on, picked or not, and lets it go after a marquee dragged from there', () => {
      const { select, selection, press } = harness()
      select.release(press({ x: 900, y: 900 }) as MarqueeDrag)
      expect(selection.pickedFrame()).toBe('sq')
      select.release(press({ x: 900, y: 900 }) as MarqueeDrag)
      expect(selection.pickedFrame()).toBe('sq')
      const marquee = press({ x: 900, y: 900 }) as MarqueeDrag
      marquee.to = { x: 1000, y: 1000 }
      select.release(marquee)
      expect(selection.pickedFrame()).toBeNull()
    })

    it('selects the locked layer a marquee that stayed a click was pressed on', () => {
      const { select, selection, press } = harness()
      select.release(press({ x: 605, y: 705 }) as MarqueeDrag)
      expect(selection.current()).toEqual({ ids: ['pin'], frameId: 'sq' })
    })

    it('lets the picked frame go after a marquee off every frame, a click or a drag', () => {
      const { select, selection, pressOff } = harness()
      selection.pickFrame('sq')
      select.release(pressOff({ x: 1200, y: 900 }) as MarqueeDrag)
      expect(selection.pickedFrame()).toBeNull()
      selection.pickFrame('sq')
      const marquee = pressOff({ x: 1200, y: 900 }) as MarqueeDrag
      marquee.to = { x: 900, y: 900 }
      select.release(marquee)
      expect(selection.pickedFrame()).toBeNull()
    })

    it('picks the frame under a click in the selection box on no layer', () => {
      const { select, selection, press } = harness()
      selection.select(['card', 'box'], SQUARE.id)
      press({ x: 550, y: 150 })
      select.release(null)
      expect(selection.current()).toBeNull()
      expect(selection.pickedFrame()).toBe('sq')
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
