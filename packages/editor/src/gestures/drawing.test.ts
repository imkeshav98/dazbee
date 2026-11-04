import { describe, expect, it } from 'vitest'

import type { DesignInput } from '@dazbee/schema'

import { type Frame, frameGrid } from '../canvas/grid.ts'
import { hug } from '../layers/hug.ts'
import { sessionOf, testBoxes } from '../layers/test-boxes.ts'
import { editorSelection } from '../selection.ts'
import { type DrawingDeps, editorDrawing, isDrawing } from './drawing.ts'

/** One page in one format, with a rect and a dot beside each other, and a group a new layer can go into. */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'One', order: 'a0' } },
  nodes: {
    rect: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Rect',
      props: { x: 100, y: 100, width: 50, height: 50, shape: { kind: 'rect' } },
    },
    dot: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a1',
      name: 'Dot',
      props: { x: 400, y: 400, width: 10, height: 10, shape: { kind: 'ellipse' } },
    },
  },
}
const pointer = { pointerId: 1 } as PointerEvent
const PHOTO = { id: 'a1', name: 'Photo', width: 400, height: 200 }

/** Drawing over the design on a real session and selection, at zoom 1, logging what it asks for. */
function harness() {
  const session = sessionOf(DESIGN)
  const frames = frameGrid(session.design()).frames
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
    drawn: () => session.design(),
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
  return { drawing, session, selection, log, at, made, props }
}

describe('isDrawing', () => {
  it('says whether a gesture draws a new layer', () => {
    expect(isDrawing({ kind: 'draw' })).toBe(true)
    expect(isDrawing({ kind: 'textBox' })).toBe(true)
    expect(isDrawing({ kind: 'imageBox' })).toBe(true)
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
      expect(selection.current()).toEqual({ ids: [id], frame: 'p1/sq' })
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

    it('goes into the group or frame gone into, when it can hold it', () => {
      const { drawing, session, selection, at, made } = harness()
      session.run('node.group', { ids: ['rect'] })
      const group = session.design().nodes.rect?.parentId as string
      selection.enter(group)
      const drag = drawing.pressShape(pointer, 'rect', at(110, 110))
      expect(session.design().nodes[drag?.id ?? '']?.parentId).toBe(group)
      expect(made()).toHaveLength(2)
    })
  })

  describe('a frame', () => {
    it('takes in the layers wholly inside it, in the same undo step', () => {
      const { drawing, session, at, made } = harness()
      const drag = drawing.pressShape(pointer, 'frame', at(50, 50))
      if (!drag) throw new Error('no drag')
      drawing.drag(drag, { x: 300, y: 300 }, false, false)
      drawing.release(drag)
      expect(session.design().nodes.rect?.parentId).toBe(drag.id)
      expect(session.design().nodes.dot?.parentId).toBe('p1')
      session.undo()
      expect(made()).toEqual([])
      expect(session.design().nodes.rect?.parentId).toBe('p1')
    })
  })

  describe('a text box', () => {
    it('follows the drag, then makes the text and starts typing into it in the same undo step', () => {
      const { drawing, session, selection, log, at, made, props } = harness()
      const drag = drawing.pressText(pointer, at(200, 200))
      expect(drag).toMatchObject({ kind: 'textBox', parentId: 'p1', from: { x: 200, y: 200 } })
      drawing.drag(drag, { x: 400, y: 260 }, false, false)
      expect(drag.to).toEqual({ x: 400, y: 260 })
      drawing.release(drag)
      const [id] = made()
      expect(props(id as string)).toMatchObject({ x: 200, y: 200, width: 200, height: 60, boxMode: 'fixed' })
      expect(selection.current()).toEqual({ ids: [id], frame: 'p1/sq' })
      expect(log).toEqual(['stop typing', 'draw', 'tool select', 'type into p1/sq at 0, made for it'])
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
      expect(selection.current()).toEqual({ ids: [id], frame: 'p1/sq' })
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
})
