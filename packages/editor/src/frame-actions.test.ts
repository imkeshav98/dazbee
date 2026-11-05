import { describe, expect, it } from 'vitest'

import type { DesignInput } from '@dazbee/schema'

import { type Frame, pageFrames } from './canvas/frames.ts'
import { editorFrameActions } from './frame-actions.ts'
import { sessionOf } from './layers/test-boxes.ts'
import { editorSelection } from './selection.ts'

const rect = (parentId: string, index: string, box: { x: number; y: number; width: number; height: number }) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name: 'Rect',
  props: { ...box, shape: { kind: 'rect' as const } },
})
/** One page with a square frame holding a square and a row laid out by auto layout, and a wide frame holding a copy of the square. */
const DESIGN: DesignInput = {
  meta: { designId: 'd', name: 'D' },
  pages: { p1: { name: 'One', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1200, height: 628, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    a: { ...rect('sq', 'a0', { x: 100, y: 100, width: 100, height: 100 }), link: 'a' },
    row: {
      type: 'box',
      parentId: 'sq',
      link: 'row',
      index: 'a1',
      name: 'Row',
      props: { x: 100, y: 500, width: 300, height: 100, layout: { direction: 'row' } },
    },
    inRow: { ...rect('row', 'a0', { x: 0, y: 0, width: 50, height: 50 }), link: 'inRow' },
    'wide-a': { ...rect('wide', 'a0', { x: 100, y: 100, width: 100, height: 100 }), link: 'a' },
  },
}

/** The frame actions on a real session and selection, logging what they ask of the view, the tools and the overlay. */
function harness() {
  const session = sessionOf(DESIGN)
  const frames = pageFrames(session.design(), 'p1').frames
  const [frame, wide] = frames as [Frame, Frame]
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => frames, changed: () => {} })
  const frameActions = editorFrameActions({
    session,
    view: {
      page: () => 'p1',
      showArea: (area) => log.push(`showArea ${JSON.stringify(area)}`),
    },
    tools: { setTool: (tool) => log.push(`tool ${tool}`) },
    frameName: (width, height) => `Size ${width}×${height}`,
    selection,
    drawOverlay: () => log.push('overlay'),
  })
  /** The layers whose parent is a frame. */
  const layersOf = (frameId: string) => Object.values(session.design().nodes).filter((n) => n.parentId === frameId)
  return { frameActions, session, selection, frame, wide, log, layersOf }
}

describe('editorFrameActions', () => {
  describe('addFrame', () => {
    it('adds an empty white frame of a size to the shown page, named from its size, past its rightmost frame, picks it and shows it, the select tool back, as one undo step', () => {
      const { frameActions, session, selection, log } = harness()
      selection.select(['a'], 'sq')
      const layers = Object.keys(session.design().nodes).length
      const id = frameActions.addFrame({ width: 300, height: 250 }) ?? ''
      // 200 px past the wide frame, which ends at 2480, its top lined up with the wide frame's.
      expect(session.design().frames[id]).toMatchObject({
        pageId: 'p1',
        name: 'Size 300×250',
        width: 300,
        height: 250,
        x: 2680,
        y: 0,
        fills: [{ type: 'solid', color: '#FFFFFFFF' }],
      })
      expect(Object.keys(session.design().nodes)).toHaveLength(layers)
      expect(selection.pickedFrame()).toBe(id)
      expect(selection.current()).toBeNull()
      expect(log).toEqual([
        'tool select',
        `showArea ${JSON.stringify({ x: 2680, y: 0, width: 300, height: 250 })}`,
        'overlay',
      ])
      session.undo()
      expect(session.design().frames[id]).toBeUndefined()
      expect(session.canUndo()).toBe(false)
      session.redo()
      expect(session.design().frames[id]).toMatchObject({ width: 300, height: 250, x: 2680, y: 0 })
    })

    it('adds nothing for a size past the limits, leaving the tool and the picked frame be', () => {
      const { frameActions, session, selection, wide, log } = harness()
      selection.pickFrame(wide.id)
      for (const size of [
        { width: 49, height: 600 },
        { width: 8001, height: 1000 },
        { width: 50, height: 601 },
        { width: 300.5, height: 250 },
      ])
        expect(frameActions.addFrame(size)).toBeNull()
      expect(Object.keys(session.design().frames).sort()).toEqual(['sq', 'wide'])
      expect(selection.pickedFrame()).toBe(wide.id)
      expect(log).toEqual([])
      expect(session.canUndo()).toBe(false)
    })

    it('adds a frame at the limits: 50 px on its short side, 8000 on its long one, and 12 times as long as wide', () => {
      const { frameActions, session } = harness()
      for (const size of [
        { width: 50, height: 600 },
        { width: 8000, height: 667 },
      ]) {
        const id = frameActions.addFrame(size) ?? ''
        expect(session.design().frames[id]).toMatchObject(size)
      }
    })
  })

  describe('addSize', () => {
    it('adds a size of a frame, under its name, holding linked copies of its layers laid out to fit, and picks it and shows it, as one undo step', () => {
      const { frameActions, session, selection, frame, log, layersOf } = harness()
      selection.pickFrame(frame.id)
      const id = frameActions.addSize(frame.id, { width: 540, height: 1080 }) ?? ''
      expect(session.design().frames[id]).toMatchObject({
        pageId: 'p1',
        name: 'Square',
        width: 540,
        height: 1080,
        x: 2680,
      })
      const copies = layersOf(id)
      expect(copies.map((node) => node.link).sort()).toEqual(['a', 'row'])
      // Half as wide: A's centre moves with the width, and its size scales by the smaller ratio.
      expect(copies.find((node) => node.link === 'a')?.props).toMatchObject({ x: 50, y: 125, width: 50, height: 50 })
      expect(selection.pickedFrame()).toBe(id)
      expect(log).toEqual([
        'tool select',
        `showArea ${JSON.stringify({ x: 2680, y: 0, width: 540, height: 1080 })}`,
        'overlay',
      ])
      session.undo()
      expect(session.design().frames[id]).toBeUndefined()
      expect(layersOf(id)).toEqual([])
      expect(session.canUndo()).toBe(false)
      session.redo()
      expect(
        layersOf(id)
          .map((node) => node.link)
          .sort(),
      ).toEqual(['a', 'row'])
    })

    it('adds nothing for a frame gone or a size past the limits, leaving the tool and the picked frame be', () => {
      const { frameActions, session, selection, frame, log } = harness()
      selection.pickFrame(frame.id)
      expect(frameActions.addSize('gone', { width: 300, height: 250 })).toBeNull()
      expect(frameActions.addSize(frame.id, { width: 49, height: 600 })).toBeNull()
      expect(Object.keys(session.design().frames).sort()).toEqual(['sq', 'wide'])
      expect(selection.pickedFrame()).toBe(frame.id)
      expect(log).toEqual([])
      expect(session.canUndo()).toBe(false)
    })
  })

  describe('showAdded', () => {
    it('picks a frame just added and shows it whole beside the chrome, the select tool back', () => {
      const { frameActions, selection, wide, log } = harness()
      selection.select(['a'], 'sq')
      frameActions.showAdded(wide.id)
      expect(selection.pickedFrame()).toBe(wide.id)
      expect(selection.current()).toBeNull()
      expect(log).toEqual([
        'tool select',
        `showArea ${JSON.stringify({ x: 1280, y: 0, width: 1200, height: 628 })}`,
        'overlay',
      ])
    })

    it('does nothing for a frame gone', () => {
      const { frameActions, selection, log } = harness()
      frameActions.showAdded('gone')
      expect(selection.pickedFrame()).toBeNull()
      expect(log).toEqual([])
    })
  })
})
