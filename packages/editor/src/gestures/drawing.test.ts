import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DesignInput } from '@dazbee/schema'

import { type Frame, pageFrames } from '../canvas/frames.ts'
import { hug } from '../layers/hug.ts'
import { sessionOf, testBoxes } from '../layers/test-boxes.ts'
import { editorSelection } from '../selection.ts'
import { type DrawingDeps, editorDrawing, isDrawing } from './drawing.ts'

const WHITE = [{ type: 'solid' as const, color: '#FFFFFFFF' }]
/** One page with one frame, holding a rect and a dot beside each other. */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: { sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, fills: WHITE, order: 'a0' } },
  nodes: {
    rect: {
      type: 'graphic',
      parentId: 'sq',
      link: 'rect',
      index: 'a0',
      name: 'Rect',
      props: { x: 100, y: 100, width: 50, height: 50, shape: { kind: 'rect' } },
    },
    dot: {
      type: 'graphic',
      parentId: 'sq',
      link: 'dot',
      index: 'a1',
      name: 'Dot',
      props: { x: 400, y: 400, width: 10, height: 10, shape: { kind: 'ellipse' } },
    },
  },
}
const pointer = { pointerId: 1 } as PointerEvent
const PHOTO = { id: 'a1', name: 'Photo', width: 400, height: 200 }

/** Drawing over the design on a real session and selection, at zoom 1 with world 0, 0 at the stage's corner, logging what it asks for. */
function harness() {
  const session = sessionOf(DESIGN)
  const frames = pageFrames(session.design(), 'p1').frames
  const frame = frames[0] as Frame
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => frames, changed: () => {} })
  const deps: DrawingDeps = {
    canvas: { setPointerCapture: () => {} } as unknown as HTMLCanvasElement,
    session,
    selection,
    tools: { setTool: (tool) => log.push(`tool ${tool}`) },
    typing: {
      stop: () => log.push('stop typing'),
      start: (id, at, offset, endGesture, created) => {
        log.push(`type into ${at} at ${offset}${created ? ', made for it' : ''}`)
        endGesture?.()
      },
    },
    boxes: testBoxes(session, selection, frames),
    camera: () => ({ x: 0, y: 0, zoom: 1 }),
    page: () => 'p1',
    frameName: (width, height) => (width === 300 && height === 300 ? 'Frame' : `${width} by ${height}`),
    hug: (ids) => {
      log.push(`hug ${ids.join(',')}`)
      hug(session, ids)
    },
    placeBox: () => {},
    drawOverlay: () => log.push('draw'),
  }
  const drawing = editorDrawing(deps)
  const at = (x: number, y: number) => ({ frame, p: { x, y } })
  const made = () => Object.keys(session.design().nodes).filter((id) => id !== 'rect' && id !== 'dot')
  const props = (id: string) => session.design().nodes[id]?.props as Record<string, unknown> | undefined
  /** The frames the design has besides the square one. */
  const madeFrames = () => Object.entries(session.design().frames).filter(([id]) => id !== 'sq')
  /** Draws a frame with the Frame tool from one world point to another, as the pointer does. */
  const drawFrame = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const drag = drawing.pressFrame(pointer, from)
    drawing.drag(drag, to, false, false)
    drawing.release(drag)
    return drag
  }
  return { drawing, session, selection, log, at, made, props, madeFrames, drawFrame }
}

/** An element as the drawing builds one: its class, data and style. */
const fakeElement = () => ({
  className: '',
  dataset: {} as Record<string, string>,
  style: {} as Record<string, string>,
})

describe('isDrawing', () => {
  it('says whether a gesture draws a new layer', () => {
    expect(isDrawing({ kind: 'draw' })).toBe(true)
    expect(isDrawing({ kind: 'textBox' })).toBe(true)
    expect(isDrawing({ kind: 'imageBox' })).toBe(true)
    expect(isDrawing({ kind: 'frameDraw' })).toBe(true)
    expect(isDrawing({ kind: 'move' })).toBe(false)
    expect(isDrawing(null)).toBe(false)
  })
})

describe('editorDrawing', () => {
  describe('a shape', () => {
    it('is made at the press, stops typing, and grows with the drag once it passes the click slop', () => {
      const { drawing, session, log, at, made, props } = harness()
      const drag = drawing.pressShape(pointer, 'rect', at(200, 200))
      if (!drag) throw new Error('no drag')
      const [id] = made()
      expect(drag).toMatchObject({ kind: 'draw', tool: 'rect', id, moved: false, roots: [id] })
      expect(session.inGesture()).toBe(true)
      expect(log).toEqual(['stop typing'])
      drawing.drag(drag, { x: 201, y: 201 }, false, false)
      expect(drag.moved).toBe(false)
      drawing.drag(drag, { x: 260, y: 240 }, false, false)
      expect(props(id as string)).toMatchObject({ x: 200, y: 200, width: 60, height: 40 })
    })

    it('ends as one undo step, selected, with the select tool back', () => {
      const { drawing, session, selection, log, at, made } = harness()
      const drag = drawing.pressShape(pointer, 'rect', at(200, 200))
      if (!drag) throw new Error('no drag')
      drawing.drag(drag, { x: 260, y: 240 }, false, false)
      drawing.release(drag)
      const [id] = made()
      expect(session.inGesture()).toBe(false)
      expect(selection.current()).toEqual({ ids: [id], frameId: 'sq' })
      expect(log.slice(1)).toEqual([`hug ${id}`, 'tool select'])
      session.undo()
      expect(made()).toEqual([])
    })

    it('draws a click at its usual size, centred where it landed', () => {
      const { drawing, at, made, props } = harness()
      const drag = drawing.pressShape(pointer, 'ellipse', at(500, 500))
      if (!drag) throw new Error('no drag')
      drawing.release(drag)
      expect(props(made()[0] as string)).toMatchObject({ x: 450, y: 450, width: 100, height: 100 })
    })

    it('goes into the group or box gone into, when it can hold it', () => {
      const { drawing, session, selection, at, made } = harness()
      session.run('node.group', { ids: ['rect'] })
      const group = session.design().nodes.rect?.parentId as string
      selection.enter(group)
      const drag = drawing.pressShape(pointer, 'rect', at(110, 110))
      expect(session.design().nodes[drag?.id ?? '']?.parentId).toBe(group)
      expect(made()).toHaveLength(2)
    })
  })

  describe('a box drawn with the Box tool', () => {
    it('is a white box named Box that takes in the layers wholly inside it, in the same undo step', () => {
      const { drawing, session, at, made } = harness()
      const drag = drawing.pressShape(pointer, 'box', at(50, 50))
      if (!drag) throw new Error('no drag')
      drawing.drag(drag, { x: 300, y: 300 }, false, false)
      drawing.release(drag)
      expect(session.design().nodes[drag.id]).toMatchObject({
        type: 'box',
        name: 'Box',
        props: { fills: [{ type: 'solid', color: '#FFFFFFFF' }] },
      })
      expect(session.design().nodes.rect?.parentId).toBe(drag.id)
      expect(session.design().nodes.dot?.parentId).toBe('sq')
      session.undo()
      expect(made()).toEqual([])
      expect(session.design().nodes.rect?.parentId).toBe('sq')
    })

    it('draws a click 200 across, centred where it landed', () => {
      const { drawing, at, made, props } = harness()
      const drag = drawing.pressShape(pointer, 'box', at(500, 500))
      if (!drag) throw new Error('no drag')
      drawing.release(drag)
      expect(props(made()[0] as string)).toMatchObject({ x: 400, y: 400, width: 200, height: 200 })
    })
  })

  describe('a text box', () => {
    it('follows the drag, then makes the text and starts typing into it in the same undo step', () => {
      const { drawing, session, selection, log, at, made, props } = harness()
      const drag = drawing.pressText(pointer, at(200, 200))
      expect(drag).toMatchObject({ kind: 'textBox', parentId: 'sq', from: { x: 200, y: 200 } })
      drawing.drag(drag, { x: 400, y: 260 }, false, false)
      expect(drag.to).toEqual({ x: 400, y: 260 })
      drawing.release(drag)
      const [id] = made()
      expect(props(id as string)).toMatchObject({ x: 200, y: 200, width: 200, height: 60, boxMode: 'fixed' })
      expect(selection.current()).toEqual({ ids: [id], frameId: 'sq' })
      expect(log).toEqual(['stop typing', 'draw', 'tool select', 'type into sq at 0, made for it'])
      expect(session.inGesture()).toBe(false)
      session.undo()
      expect(made()).toEqual([])
    })

    it('makes text that grows with its words from a click', () => {
      const { drawing, at, made, props } = harness()
      drawing.release(drawing.pressText(pointer, at(200, 200)))
      expect(props(made()[0] as string)).toMatchObject({ x: 200, y: 200, boxMode: 'autoWidth' })
    })
  })

  describe('an image box', () => {
    it('places the image at its own size, centred on a click, as one undo step', () => {
      const { drawing, session, selection, log, at, made, props } = harness()
      drawing.release(drawing.pressImage(pointer, at(500, 500), PHOTO))
      const [id] = made()
      expect(props(id as string)).toMatchObject({ x: 300, y: 400, width: 400, height: 200 })
      expect(selection.current()).toEqual({ ids: [id], frameId: 'sq' })
      expect(log).toEqual(['stop typing', `hug ${id}`, 'tool select'])
      session.undo()
      expect(made()).toEqual([])
    })

    it("covers the box dragged, which Shift keeps to the image's shape", () => {
      const { drawing, at, made, props } = harness()
      const drag = drawing.pressImage(pointer, at(100, 100), PHOTO)
      drawing.drag(drag, { x: 300, y: 150 }, true, false)
      expect(drag.to).toEqual({ x: 300, y: 200 })
      drawing.release(drag)
      expect(props(made()[0] as string)).toMatchObject({ x: 100, y: 100, width: 200, height: 100 })
    })
  })

  describe('a frame drawn with the Frame tool', () => {
    beforeEach(() => {
      vi.stubGlobal('document', { createElement: fakeElement })
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('follows the drag in world units, anywhere on the stage, shown as a box of its own', () => {
      const { drawing, log } = harness()
      const drag = drawing.pressFrame(pointer, { x: 1200, y: 100 })
      expect(drag).toEqual({ kind: 'frameDraw', from: { x: 1200, y: 100 }, to: { x: 1200, y: 100 } })
      drawing.drag(drag, { x: 1500, y: 400 }, false, false)
      expect(drag.to).toEqual({ x: 1500, y: 400 })
      expect(log).toEqual(['stop typing', 'draw'])
      const [shown] = drawing.parts(drag) as unknown as ReturnType<typeof fakeElement>[]
      expect(shown).toMatchObject({
        className: 'marquee',
        dataset: { frameDraw: '' },
        style: { left: '1200px', top: '100px', width: '300px', height: '300px' },
      })
    })

    it('adds an empty white frame named Frame where it was dragged, on whole pixels, as one undo step', () => {
      const { session, selection, log, madeFrames, drawFrame } = harness()
      selection.select(['rect'], 'sq')
      drawFrame({ x: 1500.4, y: 400.6 }, { x: 1200.4, y: 100.6 })
      const [made] = madeFrames()
      expect(made?.[1]).toMatchObject({
        pageId: 'p1',
        name: 'Frame',
        x: 1200,
        y: 101,
        width: 300,
        height: 300,
        fills: WHITE,
      })
      expect(made?.[1].order).toBe('a1')
      expect(Object.values(session.design().nodes).filter((n) => n.parentId === made?.[0])).toEqual([])
      expect(selection.current()).toBeNull()
      expect(log.at(-1)).toBe('tool select')
      session.undo()
      expect(madeFrames()).toEqual([])
    })

    it('holds the size it adds within the size limits: sides of 50 to 8000 px, up to 12 times as long as wide', () => {
      const { madeFrames, drawFrame } = harness()
      drawFrame({ x: 0, y: 0 }, { x: 20, y: 10 })
      drawFrame({ x: 0, y: 0 }, { x: 1300, y: 60 })
      drawFrame({ x: 0, y: 0 }, { x: 70, y: 9000 })
      expect(madeFrames().map(([, f]) => `${f.width}×${f.height}`)).toEqual(['50×50', '1300×109', '667×8000'])
    })

    it('names the frame it adds as the app names a frame of its size', () => {
      const { madeFrames, drawFrame } = harness()
      drawFrame({ x: 0, y: 0 }, { x: 400, y: 200 })
      expect(madeFrames().map(([, f]) => f.name)).toEqual(['400 by 200'])
    })

    it('adds nothing for a click, and the select tool comes back', () => {
      const { log, madeFrames, drawFrame } = harness()
      drawFrame({ x: 300, y: 300 }, { x: 301, y: 302 })
      expect(madeFrames()).toEqual([])
      expect(log.at(-1)).toBe('tool select')
    })
  })
})
