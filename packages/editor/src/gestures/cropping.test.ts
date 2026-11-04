import { describe, expect, it } from 'vitest'

import { loadDesign, mergedProps, openSession } from '@dazbee/doc'
import { type DesignInput, type Paint, parseDesign } from '@dazbee/schema'

import type { Frame } from '../canvas/frames.ts'
import { testBoxes } from '../layers/test-boxes.ts'
import { editorSelection } from '../selection.ts'
import { type CroppingDeps, editorCropping } from './cropping.ts'

/** A box 200 × 100 filled with a square image, which covers it: the image's whole sits 200 × 200 around it. */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'One', order: 'a0' } },
  nodes: {
    photo: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Photo',
      props: {
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        shape: { kind: 'rect' },
        fills: [
          { type: 'solid', color: '#FF0000FF' },
          { type: 'image', assetId: 'a1' },
        ],
      },
    },
  },
}
const SQUARE = { key: 'p1/sq', pageId: 'p1', formatId: 'sq', x: 0, y: 0, width: 1080, height: 1080 } as Frame
const IMAGE = { width: 400, height: 400 }
const pointer = { pointerId: 1 } as PointerEvent

/** Cropping over the design on a real session and selection, at zoom 1 with no containers, logging what it draws. */
function harness() {
  const parsed = parseDesign(DESIGN)
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  const session = openSession(loadDesign(parsed.design))
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => [SQUARE], changed: () => {} })
  /** The fills of the photo in the square. */
  const fills = () => (mergedProps(session.design(), 'format:sq', 'photo') as { fills: Paint[] }).fills
  const deps: CroppingDeps = {
    canvas: { setPointerCapture: () => {} } as unknown as HTMLCanvasElement,
    session,
    selection,
    thumbnails: { ghost: () => '' },
    camera: () => ({ x: 0, y: 0, zoom: 1 }),
    frameOf: (key) => (key === SQUARE.key ? SQUARE : undefined),
    boxes: testBoxes(session, selection, [SQUARE], { a1: IMAGE }),
    outline: () => {
      throw new Error('nothing is drawn in these tests')
    },
    drawOverlay: () => log.push('draw'),
  }
  const cropping = editorCropping(deps)
  selection.crop({ id: 'photo', frame: 'p1/sq' })
  return { cropping, session, selection, log, fills }
}

describe('editorCropping', () => {
  describe('press', () => {
    it('on the image starts a drag that pans it, and on a corner one that scales it', () => {
      const { cropping, log } = harness()
      expect(cropping.press(pointer, { x: 200, y: 150 })).toMatchObject({ kind: 'crop', id: 'photo', corner: null })
      expect(cropping.press(pointer, { x: 297, y: 247 })).toMatchObject({ kind: 'crop', corner: 2 })
      expect(cropping.press(pointer, { x: 102, y: 52 })).toMatchObject({ kind: 'crop', corner: 0 })
      expect(log).toEqual([])
    })

    it('anywhere else ends the crop and draws it gone', () => {
      const { cropping, selection, log } = harness()
      expect(cropping.press(pointer, { x: 600, y: 600 })).toBeNull()
      expect(selection.cropping()).toBeNull()
      expect(log).toEqual(['draw'])
    })

    it('ends a crop whose layer has nothing left to crop', () => {
      const { cropping, selection, log } = harness()
      selection.crop({ id: 'gone', frame: 'p1/sq' })
      expect(cropping.press(pointer, { x: 200, y: 150 })).toBeNull()
      expect(selection.cropping()).toBeNull()
      expect(log).toEqual([])
    })
  })

  describe('drag', () => {
    it("pans the image, kept covering the box, as the fill's own crop in this format", () => {
      const { cropping, fills, log } = harness()
      const drag = cropping.press(pointer, { x: 200, y: 150 })
      if (!drag) throw new Error('no drag')
      cropping.drag(drag, { x: 200, y: 180 })
      expect(fills()[1]).toMatchObject({ type: 'image', fit: 'crop', crop: { x: 0, y: 40, width: 400, height: 200 } })
      // Past the box's edge, the image stops there.
      cropping.drag(drag, { x: 200, y: 500 })
      expect(fills()[1]).toMatchObject({ crop: { x: 0, y: 0, width: 400, height: 200 } })
      expect(fills()[0]).toMatchObject({ type: 'solid' })
      expect(log).toEqual(['draw', 'draw'])
    })

    it('scales the image from the corner opposite the one dragged', () => {
      const { cropping, fills } = harness()
      const drag = cropping.press(pointer, { x: 300, y: 250 })
      if (!drag) throw new Error('no drag')
      cropping.drag(drag, { x: 400, y: 350 })
      const fill = fills()[1]
      const crop = fill?.type === 'image' ? fill.crop : undefined
      expect(crop?.x).toBe(0)
      expect(crop?.y).toBeCloseTo(66.67, 2)
      expect(crop?.width).toBeCloseTo(266.67, 2)
      expect(crop?.height).toBeCloseTo(133.33, 2)
    })
  })

  describe('release', () => {
    it('ends the drag: everything it wrote is one undo step', () => {
      const { cropping, session, fills } = harness()
      const drag = cropping.press(pointer, { x: 200, y: 150 })
      if (!drag) throw new Error('no drag')
      cropping.drag(drag, { x: 200, y: 170 })
      cropping.drag(drag, { x: 200, y: 180 })
      cropping.release(drag)
      expect(session.inGesture()).toBe(false)
      session.undo()
      expect(fills()[1]).toMatchObject({ type: 'image', fit: 'fill' })
      expect(session.canUndo()).toBe(false)
    })
  })
})
