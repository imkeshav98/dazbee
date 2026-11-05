import { describe, expect, it } from 'vitest'

import { render } from '@dazbee/renderer'
import type { DesignInput } from '@dazbee/schema'

import { type ActionsDeps, editorActions } from './actions.ts'
import { type Frame, pageFrames } from './canvas/frames.ts'
import { editorAutoLayoutDrag } from './gestures/select/auto-layout-drag.ts'
import { editorTransformDrag } from './gestures/select/transform-drag.ts'
import { hug } from './layers/hug.ts'
import { measure, sessionOf, testBoxes } from './layers/test-boxes.ts'
import { editorSelection } from './selection.ts'

const rect = (parentId: string, index: string, box: { x: number; y: number; width: number; height: number }) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name: 'Rect',
  props: { ...box, shape: { kind: 'rect' as const } },
})
/**
 * One page with a square frame and a wide one. The square holds three squares in a row with uneven
 * gaps, a layer locked in place, and a row laid out by auto layout holding one square; the wide
 * frame holds a copy of the first square.
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
    b: { ...rect('sq', 'a1', { x: 250, y: 300, width: 100, height: 100 }), link: 'b' },
    c: { ...rect('sq', 'a2', { x: 700, y: 120, width: 100, height: 100 }), link: 'c' },
    pin: { ...rect('sq', 'a3', { x: 700, y: 700, width: 50, height: 50 }), link: 'pin', lock: { move: true } },
    row: {
      type: 'box',
      parentId: 'sq',
      link: 'row',
      index: 'a4',
      name: 'Row',
      props: { x: 100, y: 500, width: 300, height: 100, layout: { direction: 'row' } },
    },
    inRow: { ...rect('row', 'a0', { x: 0, y: 0, width: 50, height: 50 }), link: 'inRow' },
    'wide-a': { ...rect('wide', 'a0', { x: 100, y: 100, width: 100, height: 100 }), link: 'a' },
  },
}

/** The actions on a real session, selection and drags over the page's frames, logging what they ask of the view, the tools and the pen. */
function harness(penDrawing = false) {
  const session = sessionOf(DESIGN)
  const frames = pageFrames(session.design(), 'p1').frames
  const [frame, wide] = frames as [Frame, Frame]
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => frames, changed: () => {} })
  const boxes = testBoxes(session, selection, frames)
  const scenes = { scene: (f: Frame) => render(session.design(), f.id, undefined, measure) }
  const hugAll = (ids: string[]) => hug(session, ids)
  const camera = () => ({ x: 0, y: 0, zoom: 1 })
  const transformDrag = editorTransformDrag({
    canvas: {} as HTMLCanvasElement,
    session,
    scenes,
    selection,
    typing: { editing: () => null, fitText: () => {} },
    boxes,
    camera,
    frames: () => frames,
    hug: hugAll,
    notify: () => {},
    placeBox: () => {},
  })
  const autoLayoutDrag = editorAutoLayoutDrag({
    session,
    boxes,
    camera,
    hug: hugAll,
    notify: (notice) => log.push(notice),
    outline: () => {
      throw new Error('nothing is drawn in these tests')
    },
  })
  const deps: ActionsDeps = {
    session,
    view: {
      design: () => session.design(),
      frameOf: (key) => frames.find((f) => f.id === key),
      page: () => 'p1',
      // The wide frame is in the middle of the view.
      nearestFrame: () => wide,
      fitAll: () => log.push('fitAll'),
      fitArea: (area) => log.push(`fitArea ${JSON.stringify(area)}`),
      showArea: (area) => log.push(`showArea ${JSON.stringify(area)}`),
      zoomTo: (zoom) => log.push(`zoomTo ${zoom}`),
      zoomIn: () => log.push('zoomIn'),
      zoomOut: () => log.push('zoomOut'),
      toggleRulers: () => log.push('toggleRulers'),
      viewChanged: () => log.push('viewChanged'),
    },
    tools: { setTool: (tool) => log.push(`tool ${tool}`) },
    selection,
    scenes,
    boxes,
    pen: {
      drawing: () => penDrawing,
      finish: () => log.push('pen finish'),
      deletePoints: () => (log.push('pen deletePoints'), true),
    },
    transformDrag,
    autoLayoutDrag,
    notify: (notice) => log.push(notice),
    drawOverlay: () => log.push('overlay'),
  }
  const actions = editorActions(deps)
  /** A layer's x and y. */
  const at = (id: string) => {
    const p = session.design().nodes[id]?.props as { x: number; y: number }
    return { x: p.x, y: p.y }
  }
  return { actions, session, selection, frame, wide, log, at }
}

describe('editorActions', () => {
  describe('perform', () => {
    it('zooms and switches tools without a selection, and says it did', () => {
      const { actions, log } = harness()
      expect(actions.perform('zoomToFit')).toBe(true)
      expect(actions.perform('zoomTo100')).toBe(true)
      expect(actions.perform('zoomIn')).toBe(true)
      expect(actions.perform('toggleRulers')).toBe(true)
      expect(actions.perform('toolPen')).toBe(true)
      expect(log).toEqual(['fitAll', 'zoomTo 1', 'zoomIn', 'toggleRulers', 'overlay', 'viewChanged', 'tool pen'])
    })

    it('leaves undo and redo to the editor, which ends what is open first', () => {
      const { actions, session, selection, frame, at } = harness()
      selection.select(['a'], frame.id)
      actions.perform('nudgeRight')
      expect(actions.perform('undo')).toBe(false)
      expect(at('a')).toEqual({ x: 101, y: 100 })
      expect(session.canUndo()).toBe(true)
    })

    it('does nothing to the layers without a selection', () => {
      const { actions, session } = harness()
      expect(actions.perform('delete')).toBe(false)
      expect(actions.perform('alignLeft')).toBe(false)
      expect(session.canUndo()).toBe(false)
    })

    it('ends the pen path with Enter or Escape', () => {
      const { actions, log } = harness(true)
      expect(actions.perform('deselect')).toBe(true)
      expect(log).toEqual(['pen finish'])
    })

    it('deletes the selected layers as one undo step, letting the selection go', () => {
      const { actions, session, selection, frame } = harness()
      selection.select(['a', 'b'], frame.id)
      expect(actions.perform('delete')).toBe(true)
      expect(session.design().nodes.a).toBeUndefined()
      expect(session.design().nodes.b).toBeUndefined()
      expect(selection.current()).toBeNull()
      session.undo()
      expect(session.design().nodes.a).toBeDefined()
      expect(session.design().nodes.b).toBeDefined()
    })

    it('groups the selected layers and selects the group', () => {
      const { actions, session, selection, frame } = harness()
      selection.select(['a', 'b'], frame.id)
      actions.perform('group')
      const [group] = selection.current()?.ids ?? []
      expect(session.design().nodes[group ?? '']?.type).toBe('group')
      expect(session.design().nodes.a?.parentId).toBe(group)
    })

    it('aligns the selected layers to the left one, as one undo step', () => {
      const { actions, session, selection, frame, at } = harness()
      selection.select(['a', 'b'], frame.id)
      actions.perform('alignLeft')
      expect(at('a')).toEqual({ x: 100, y: 100 })
      expect(at('b')).toEqual({ x: 100, y: 300 })
      actions.perform('alignBottom')
      expect(at('a')).toEqual({ x: 100, y: 300 })
      session.undo()
      expect(at('a')).toEqual({ x: 100, y: 100 })
      session.undo()
      expect(at('b')).toEqual({ x: 250, y: 300 })
    })

    it('aligns one layer to its frame', () => {
      const { actions, selection, frame, at } = harness()
      selection.select(['a'], frame.id)
      actions.perform('alignRight')
      expect(at('a')).toEqual({ x: 980, y: 100 })
    })

    it('spaces the selected layers evenly between the outer ones', () => {
      const { actions, selection, frame, at } = harness()
      selection.select(['a', 'b', 'c'], frame.id)
      actions.perform('distributeHorizontal')
      expect(at('a')).toEqual({ x: 100, y: 100 })
      expect(at('b')).toEqual({ x: 400, y: 300 })
      expect(at('c')).toEqual({ x: 700, y: 120 })
    })

    it('says auto layout places the layers in a flow, and aligns the rest', () => {
      const { actions, selection, frame, at, log } = harness()
      selection.select(['b', 'c', 'inRow'], frame.id)
      actions.perform('alignTop')
      expect(log).toContain('placedByLayout')
      expect(at('b')).toEqual({ x: 250, y: 120 })
      expect(at('c')).toEqual({ x: 700, y: 120 })
      expect(at('inRow')).toEqual({ x: 0, y: 0 })
    })

    it('nudges by a pixel, or ten with Shift, each press one undo step', () => {
      const { actions, session, selection, frame, at } = harness()
      selection.select(['a'], frame.id)
      actions.perform('nudgeRight')
      actions.perform('nudgeDownFar')
      expect(at('a')).toEqual({ x: 101, y: 110 })
      session.undo()
      expect(at('a')).toEqual({ x: 101, y: 100 })
    })

    it('nudges a layer in a flow along it, which says why it can go no further', () => {
      const { actions, selection, frame, log } = harness()
      selection.select(['inRow'], frame.id)
      actions.perform('nudgeRight')
      expect(log).toContain('flowEnd')
    })

    it("selects every top-level layer that can be picked of the selection's frame, else of the frame last selected in on the page, else of the frame nearest the middle of the view", () => {
      const { actions, selection, frame, wide } = harness()
      actions.perform('selectAll')
      expect(selection.current()).toEqual({ frameId: wide.id, ids: ['wide-a'] })
      selection.select(['a'], frame.id)
      selection.select([], frame.id)
      actions.perform('selectAll')
      expect(selection.current()).toEqual({ frameId: frame.id, ids: ['a', 'b', 'c', 'row'] })
      selection.select(['wide-a'], wide.id)
      actions.perform('selectAll')
      expect(selection.current()).toEqual({ frameId: wide.id, ids: ['wide-a'] })
    })

    it('locks the selected layers, then unlocks them when every one is locked', () => {
      const { actions, session, selection, frame } = harness()
      selection.select(['a'], frame.id)
      actions.perform('lock')
      expect(session.design().nodes.a?.lock).toMatchObject({ move: true, style: true, content: true })
      actions.perform('lock')
      expect(session.design().nodes.a?.lock?.move).toBeFalsy()
    })

    it('hides the selected layers, keeping them selected, their copies in the other frame left as they are; again shows them', () => {
      const { actions, session, selection, frame } = harness()
      const copy = session.design().nodes['wide-a']
      selection.select(['a'], frame.id)
      actions.perform('hide')
      expect(session.design().nodes.a?.props.visible).toBe(false)
      expect(session.design().nodes['wide-a']).toEqual(copy)
      expect(selection.current()?.ids).toEqual(['a'])
      actions.perform('hide')
      expect(session.design().nodes.a?.props.visible).toBe(true)
    })

    it('lets the picked frame go with Esc, and deletes it with Delete, its layers too and their linked copies left, as one undo step the page hears of', () => {
      const { actions, session, selection, frame, log } = harness()
      actions.onFrameDelete((name) => log.push(`deleted ${name}`))
      selection.pickFrame(frame.id)
      expect(actions.perform('deselect')).toBe(true)
      expect(selection.pickedFrame()).toBeNull()
      selection.pickFrame(frame.id)
      expect(actions.perform('delete')).toBe(true)
      expect(session.design().frames[frame.id]).toBeUndefined()
      expect(session.design().nodes.a).toBeUndefined()
      expect(session.design().nodes['wide-a']).toBeDefined()
      expect(selection.pickedFrame()).toBeNull()
      expect(log).toEqual(['overlay', 'deleted Square', 'overlay'])
      session.undo()
      expect(session.design().frames[frame.id]).toBeDefined()
      expect(session.design().nodes.a).toBeDefined()
      expect(session.canUndo()).toBe(false)
    })

    it('duplicates the picked frame with its layers as linked copies, picking the copy and showing it, as one undo step', () => {
      const { actions, session, selection, frame, log } = harness()
      selection.pickFrame(frame.id)
      expect(actions.perform('duplicate')).toBe(true)
      const copy = selection.pickedFrame() ?? ''
      expect(copy).not.toBe(frame.id)
      const made = session.design().frames[copy]
      expect(made).toMatchObject({ name: 'Square', width: 1080, height: 1080 })
      expect(log).toEqual([
        `showArea ${JSON.stringify({ x: made?.x, y: made?.y, width: 1080, height: 1080 })}`,
        'overlay',
      ])
      const links = Object.values(session.design().nodes)
        .filter((node) => node.parentId === copy)
        .map((node) => node.link)
      expect(links.sort()).toEqual(['a', 'b', 'c', 'pin', 'row'])
      session.undo()
      expect(session.design().frames[copy]).toBeUndefined()
      expect(session.canUndo()).toBe(false)
    })

    it('moves the picked frame by a pixel, or ten with Shift, each press one undo step', () => {
      const { actions, session, selection, wide } = harness()
      selection.pickFrame(wide.id)
      actions.perform('nudgeRight')
      actions.perform('nudgeDownFar')
      actions.perform('nudgeLeftFar')
      actions.perform('nudgeUp')
      expect(session.design().frames[wide.id]).toMatchObject({ x: 1271, y: 9 })
      expect(session.design().nodes['wide-a']?.props).toMatchObject({ x: 100, y: 100 })
      session.undo()
      expect(session.design().frames[wide.id]).toMatchObject({ x: 1271, y: 10 })
    })

    it("leaves the picked frame and its layers be under the layers' other keys", () => {
      const { actions, session, selection, frame } = harness()
      selection.pickFrame(frame.id)
      for (const action of ['group', 'alignLeft', 'lock', 'hide', 'mask', 'bringToFront'] as const)
        expect(actions.perform(action)).toBe(false)
      expect(session.canUndo()).toBe(false)
      expect(selection.pickedFrame()).toBe(frame.id)
    })

    it('selects every layer that can be picked of the picked frame', () => {
      const { actions, selection, frame } = harness()
      selection.pickFrame(frame.id)
      actions.perform('selectAll')
      expect(selection.current()).toEqual({ frameId: frame.id, ids: ['a', 'b', 'c', 'row'] })
      expect(selection.pickedFrame()).toBeNull()
    })

    it('draws the overlay after a change to the layers', () => {
      const { actions, selection, frame, log } = harness()
      selection.select(['a'], frame.id)
      actions.perform('nudgeLeft')
      expect(log).toEqual(['overlay'])
    })
  })

  describe('fitSelection', () => {
    it("fits the box around the selection, else the picked frame, else the shown page's frames", () => {
      const { actions, selection, frame, wide, log } = harness()
      actions.fitSelection()
      selection.select(['a', 'b'], frame.id)
      actions.fitSelection()
      selection.pickFrame(wide.id)
      actions.fitSelection()
      expect(log).toEqual([
        'fitAll',
        `fitArea ${JSON.stringify({ x: frame.x + 100, y: frame.y + 100, width: 250, height: 300 })}`,
        `fitArea ${JSON.stringify({ x: 1280, y: 0, width: 1200, height: 628 })}`,
      ])
    })
  })
})
