import { describe, expect, it } from 'vitest'

import { loadDesign, openSession } from '@dazbee/doc'
import { type DesignInput, parseDesign } from '@dazbee/schema'

import type { Frame } from '../canvas/frames.ts'
import { testBoxes } from '../layers/test-boxes.ts'
import { editorSelection } from '../selection.ts'
import { editorPen, type PenDeps } from './pen.ts'

const ZIG = { x: 100, y: 100, width: 100, height: 100, shape: { kind: 'path' as const, d: 'M0 0 L100 0 L100 100' } }
/** One page with a square and a wide frame, beside each other, each with its copy of a path of three anchors. */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1200, height: 628, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    zig: { type: 'graphic', parentId: 'sq', link: 'zig', index: 'a0', name: 'Zig', props: ZIG },
    'wide-zig': { type: 'graphic', parentId: 'wide', link: 'zig', index: 'a0', name: 'Zig', props: ZIG },
  },
}
const SQUARE: Frame = { id: 'sq', pageId: 'p1', name: 'Square', x: 0, y: 0, width: 1080, height: 1080 }
const WIDE: Frame = { id: 'wide', pageId: 'p1', name: 'Wide', x: 1280, y: 0, width: 1200, height: 628 }
const FRAMES = [SQUARE, WIDE]

/** A press or move of the pointer, Shift held or not. */
const pointer = (shift = false) => ({ pointerId: 1, shiftKey: shift, altKey: false }) as PointerEvent

/** The pen over the design on a real session and selection, at zoom 1 with no containers, logging what it asks for. */
function harness() {
  const parsed = parseDesign(DESIGN)
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  const session = openSession(loadDesign(parsed.design))
  const log: string[] = []
  const frameOf = (id: string | undefined) => FRAMES.find((f) => f.id === id)
  const selection = editorSelection({ drawn: () => session.design(), frames: () => FRAMES, changed: () => {} })
  const boxes = testBoxes(session, selection, FRAMES)
  const deps: PenDeps = {
    canvas: { setPointerCapture: () => {} } as unknown as HTMLCanvasElement,
    session,
    selection,
    tools: { setTool: (tool) => log.push(`tool ${tool}`) },
    typing: { stop: () => log.push('stop typing') },
    camera: () => ({ x: 0, y: 0, zoom: 1 }),
    drawn: () => session.design(),
    frameOf,
    boxes,
    hug: (ids) => log.push(`hug ${ids.join(',')}`),
    drawOverlay: () => log.push('draw'),
  }
  const pen = editorPen(deps)
  /** Presses the pen at a point in a frame, and lets go. */
  const click = (x: number, y: number, frame = SQUARE) => {
    pen.down(pointer(), { frame, p: { x, y } })
    pen.up()
  }
  const made = () => Object.keys(session.design().nodes).filter((id) => id !== 'zig' && id !== 'wide-zig')
  /** A layer's anchors in the square frame. */
  const anchors = (id: string) => boxes.pathIn(SQUARE, id)?.path[0]?.anchors
  /** Edits the zig's points, none selected. */
  const editZig = () => {
    selection.select(['zig'], 'sq')
    selection.editPath({ id: 'zig', frameId: 'sq' })
  }
  return { pen, session, selection, log, click, made, anchors, editZig }
}

describe('editorPen', () => {
  describe('drawing a path', () => {
    it('stops typing and lets the selection go, then makes the layer at the second anchor', () => {
      const { pen, session, selection, log, click, made, anchors } = harness()
      selection.select(['zig'], 'sq')
      click(100, 300)
      expect(pen.drawing()).toBe(true)
      expect(log[0]).toBe('stop typing')
      expect(selection.current()).toBeNull()
      expect(made()).toEqual([])
      click(200, 350)
      const [id = ''] = made()
      expect(anchors(id)).toEqual([
        { x: 100, y: 300 },
        { x: 200, y: 350 },
      ])
      expect(session.design().nodes[id]?.props).toMatchObject({ x: 100, y: 300, width: 100, height: 50 })
    })

    it('finishes as one undo step: the new layer selected, its groups fitted, the select tool back', () => {
      const { pen, session, selection, log, click, made } = harness()
      click(100, 300)
      click(200, 350)
      pen.finish()
      const [id] = made()
      expect(pen.drawing()).toBe(false)
      expect(selection.current()).toEqual({ ids: [id], frameId: 'sq' })
      expect(log).toContain(`hug ${id}`)
      expect(log.at(-2)).toBe('tool select')
      session.undo()
      expect(made()).toEqual([])
      expect(session.canUndo()).toBe(false)
    })

    it('makes nothing when finished with one anchor, and still brings the select tool back', () => {
      const { pen, session, log, click, made } = harness()
      click(100, 300)
      pen.finish()
      expect(made()).toEqual([])
      expect(log).toContain('tool select')
      expect(session.canUndo()).toBe(false)
      // Finishing again does nothing.
      const told = log.length
      pen.finish()
      expect(log).toHaveLength(told)
    })

    it('closes the path with a press on its first anchor, finishing it as the press ends', () => {
      const { pen, session, click, made } = harness()
      click(100, 300)
      click(200, 300)
      click(200, 400)
      pen.down(pointer(), { frame: SQUARE, p: { x: 101, y: 301 } })
      expect(pen.drawing()).toBe(true)
      pen.up()
      expect(pen.drawing()).toBe(false)
      const [id] = made()
      const node = session.design().nodes[id ?? '']
      expect(node?.type === 'graphic' && node.props.shape.kind === 'path' && node.props.shape.d).toMatch(/Z$/)
    })

    it('pulls smooth handles out of the anchor a press placed once it drags past a click', () => {
      const { pen, click, made, anchors } = harness()
      click(100, 300)
      pen.down(pointer(), { frame: SQUARE, p: { x: 200, y: 300 } })
      pen.move(pointer(), { x: 202, y: 300 })
      pen.up()
      expect(anchors(made()[0] ?? '')?.[1]).toEqual({ x: 200, y: 300 })
      pen.down(pointer(), { frame: SQUARE, p: { x: 300, y: 300 } })
      pen.move(pointer(), { x: 300, y: 340 })
      pen.up()
      click(400, 300)
      expect(anchors(made()[0] ?? '')?.[2]).toEqual({ x: 300, y: 300, in: { x: 300, y: 260 }, out: { x: 300, y: 340 } })
    })

    it('turns the new segment to 45° with Shift', () => {
      const { pen, click, made, anchors } = harness()
      click(100, 300)
      pen.down(pointer(true), { frame: SQUARE, p: { x: 200, y: 310 } })
      pen.up()
      expect(anchors(made()[0] ?? '')?.[1]?.y).toBe(300)
    })

    it('finishes the path when a press lands in another frame, and starts a new one there', () => {
      const { pen, session, log, click, made } = harness()
      click(100, 300)
      click(200, 300)
      const [first] = made()
      click(1300, 100, WIDE)
      expect(log).toContain(`hug ${first}`)
      expect(log).toContain('tool select')
      expect(pen.drawing()).toBe(true)
      expect(made()).toEqual([first])
      expect(session.canUndo()).toBe(true)
    })
  })

  describe("editing a path's points", () => {
    it('selects the anchor pressed and drags the selected anchors past a click, as one undo step', () => {
      const { pen, session, selection, log, editZig, anchors } = harness()
      const copy = session.design().nodes['wide-zig']
      editZig()
      const drag = pen.pressPoints(pointer(), { frame: SQUARE, p: { x: 200, y: 100 } })
      expect(drag?.kind).toBe('path')
      expect(selection.pathEditing()?.selected).toEqual([{ contour: 0, index: 1 }])
      if (!drag) return
      pen.dragPoints(drag, { x: 201, y: 100 }, false, false)
      expect(anchors('zig')?.[1]).toEqual({ x: 200, y: 100 })
      pen.dragPoints(drag, { x: 230, y: 110 }, false, false)
      expect(anchors('zig')?.[1]).toEqual({ x: 230, y: 110 })
      // The copy in the wide frame stays as it was.
      expect(session.design().nodes['wide-zig']).toEqual(copy)
      pen.releasePoints(drag)
      expect(log).toContain('hug zig')
      session.undo()
      expect(anchors('zig')?.[1]).toEqual({ x: 200, y: 100 })
      expect(session.canUndo()).toBe(false)
    })

    it('keeps an anchor drag to one axis with Shift', () => {
      const { pen, editZig, anchors } = harness()
      editZig()
      const drag = pen.pressPoints(pointer(), { frame: SQUARE, p: { x: 200, y: 100 } })
      if (drag) pen.dragPoints(drag, { x: 230, y: 110 }, true, false)
      expect(anchors('zig')?.[1]).toEqual({ x: 230, y: 100 })
    })

    it('adds an anchor to the selection with Shift, or takes it away', () => {
      const { pen, selection, editZig } = harness()
      editZig()
      pen.pressPoints(pointer(), { frame: SQUARE, p: { x: 200, y: 100 } })
      pen.pressPoints(pointer(true), { frame: SQUARE, p: { x: 100, y: 100 } })
      expect(selection.pathEditing()?.selected).toEqual([
        { contour: 0, index: 1 },
        { contour: 0, index: 0 },
      ])
      pen.pressPoints(pointer(true), { frame: SQUARE, p: { x: 200, y: 100 } })
      expect(selection.pathEditing()?.selected).toEqual([{ contour: 0, index: 0 }])
    })

    it('adds an anchor where a press lands on a segment, selected', () => {
      const { pen, selection, editZig, anchors } = harness()
      editZig()
      pen.pressPoints(pointer(), { frame: SQUARE, p: { x: 150, y: 100 } })
      expect(anchors('zig')).toHaveLength(4)
      expect(anchors('zig')?.[1]).toMatchObject({ x: 150, y: 100 })
      expect(selection.pathEditing()?.selected).toEqual([{ contour: 0, index: 1 }])
    })

    it('leaves the points with a press off the path, which then does what it would have, and draws', () => {
      const { pen, selection, log, editZig } = harness()
      editZig()
      expect(pen.pressPoints(pointer(), { frame: SQUARE, p: { x: 600, y: 600 } })).toBeNull()
      expect(selection.pathEditing()).toBeNull()
      expect(selection.current()).toEqual({ ids: ['zig'], frameId: 'sq' })
      expect(log).toEqual(['draw'])
      expect(pen.pressPoints(pointer(), null)).toBeNull()
    })

    it('deletes the selected anchors as one undo step, and the layer once none would be left', () => {
      const { pen, session, selection, editZig, anchors } = harness()
      editZig()
      expect(pen.deletePoints()).toBe(false)
      selection.pickAnchors([{ contour: 0, index: 2 }])
      expect(pen.deletePoints()).toBe(true)
      expect(anchors('zig')).toHaveLength(2)
      expect(selection.pathEditing()?.selected).toEqual([])
      session.undo()
      expect(anchors('zig')).toHaveLength(3)
      selection.pickAnchors([0, 1, 2].map((index) => ({ contour: 0, index })))
      pen.deletePoints()
      expect(session.design().nodes.zig).toBeUndefined()
    })
  })
})
