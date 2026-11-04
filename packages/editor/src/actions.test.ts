import { describe, expect, it } from 'vitest'

import { mergedProps } from '@dazbee/doc'
import { render } from '@dazbee/renderer'
import type { DesignInput } from '@dazbee/schema'

import { type ActionsDeps, editorActions } from './actions.ts'
import { type Frame, frameGrid } from './canvas/grid.ts'
import { editorAutoLayoutDrag } from './gestures/auto-layout-drag.ts'
import { editorTransformDrag } from './gestures/transform-drag.ts'
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
 * One page in one format: three squares in a row with uneven gaps, a layer locked in place, and a
 * row laid out by auto layout holding one square.
 */
const DESIGN: DesignInput = {
  meta: { schemaVersion: 5, designId: 'd', name: 'D', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'One', order: 'a0' } },
  nodes: {
    a: rect('p1', 'a0', { x: 100, y: 100, width: 100, height: 100 }),
    b: rect('p1', 'a1', { x: 250, y: 300, width: 100, height: 100 }),
    c: rect('p1', 'a2', { x: 700, y: 120, width: 100, height: 100 }),
    pin: { ...rect('p1', 'a3', { x: 700, y: 700, width: 50, height: 50 }), lock: { move: true } },
    row: {
      type: 'frame',
      parentId: 'p1',
      index: 'a4',
      name: 'Row',
      props: { x: 100, y: 500, width: 300, height: 100, layout: { direction: 'row' } },
    },
    inRow: rect('row', 'a0', { x: 0, y: 0, width: 50, height: 50 }),
  },
}

/** The actions on a real session, selection and drags over the one frame, logging what they ask of the view, the tools and the pen. */
function harness(penDrawing = false) {
  const session = sessionOf(DESIGN)
  const frames = frameGrid(session.design()).frames
  const frame = frames[0] as Frame
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => frames, changed: () => {} })
  const boxes = testBoxes(session, selection, frames)
  const scenes = { scene: (f: Frame) => render(session.design(), f.pageId, f.formatId, undefined, measure) }
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
      frames: () => frames,
      frameOf: (key) => frames.find((f) => f.key === key),
      firstPage: () => 'p1',
      fitAll: () => log.push('fitAll'),
      fitArea: (area) => log.push(`fitArea ${JSON.stringify(area)}`),
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
  /** A layer's x and y in the frame's format. */
  const at = (id: string) => {
    const p = mergedProps(session.design(), 'format:sq', id) as { x: number; y: number }
    return { x: p.x, y: p.y }
  }
  return { actions, session, selection, frame, log, at }
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
      selection.select(['a'], frame.key)
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
      selection.select(['a', 'b'], frame.key)
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
      selection.select(['a', 'b'], frame.key)
      actions.perform('group')
      const [group] = selection.current()?.ids ?? []
      expect(session.design().nodes[group ?? '']?.type).toBe('group')
      expect(session.design().nodes.a?.parentId).toBe(group)
    })

    it('aligns the selected layers to the left one, as one undo step', () => {
      const { actions, session, selection, frame, at } = harness()
      selection.select(['a', 'b'], frame.key)
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

    it('aligns one layer to the format', () => {
      const { actions, selection, frame, at } = harness()
      selection.select(['a'], frame.key)
      actions.perform('alignRight')
      expect(at('a')).toEqual({ x: 980, y: 100 })
    })

    it('spaces the selected layers evenly between the outer ones', () => {
      const { actions, selection, frame, at } = harness()
      selection.select(['a', 'b', 'c'], frame.key)
      actions.perform('distributeHorizontal')
      expect(at('a')).toEqual({ x: 100, y: 100 })
      expect(at('b')).toEqual({ x: 400, y: 300 })
      expect(at('c')).toEqual({ x: 700, y: 120 })
    })

    it('says auto layout places the layers in a flow, and aligns the rest', () => {
      const { actions, selection, frame, at, log } = harness()
      selection.select(['b', 'c', 'inRow'], frame.key)
      actions.perform('alignTop')
      expect(log).toContain('placedByLayout')
      expect(at('b')).toEqual({ x: 250, y: 120 })
      expect(at('c')).toEqual({ x: 700, y: 120 })
      expect(at('inRow')).toEqual({ x: 0, y: 0 })
    })

    it('nudges by a pixel, or ten with Shift, each press one undo step', () => {
      const { actions, session, selection, frame, at } = harness()
      selection.select(['a'], frame.key)
      actions.perform('nudgeRight')
      actions.perform('nudgeDownFar')
      expect(at('a')).toEqual({ x: 101, y: 110 })
      session.undo()
      expect(at('a')).toEqual({ x: 101, y: 100 })
    })

    it('nudges a layer in a flow along it, which says why it can go no further', () => {
      const { actions, selection, frame, log } = harness()
      selection.select(['inRow'], frame.key)
      actions.perform('nudgeRight')
      expect(log).toContain('flowEnd')
    })

    it('selects every top-level layer of the page that can be picked', () => {
      const { actions, selection, frame } = harness()
      actions.perform('selectAll')
      expect(selection.current()).toEqual({ frame: frame.key, ids: ['a', 'b', 'c', 'row'] })
    })

    it('locks the selected layers, then unlocks them when every one is locked', () => {
      const { actions, session, selection, frame } = harness()
      selection.select(['a'], frame.key)
      actions.perform('lock')
      expect(session.design().nodes.a?.lock).toMatchObject({ move: true, style: true, content: true })
      actions.perform('lock')
      expect(session.design().nodes.a?.lock?.move).toBeFalsy()
    })

    it('hides the selected layers in this format only, keeping them selected', () => {
      const { actions, session, selection, frame } = harness()
      selection.select(['a'], frame.key)
      actions.perform('hide')
      expect(session.design().overrides['format:sq']?.a).toEqual({ visible: false })
      expect(selection.current()?.ids).toEqual(['a'])
    })

    it('draws the overlay after a change to the layers', () => {
      const { actions, selection, frame, log } = harness()
      selection.select(['a'], frame.key)
      actions.perform('nudgeLeft')
      expect(log).toEqual(['overlay'])
    })
  })

  describe('fitSelection', () => {
    it('fits the box around the selection, or every frame with none', () => {
      const { actions, selection, frame, log } = harness()
      actions.fitSelection()
      selection.select(['a', 'b'], frame.key)
      actions.fitSelection()
      expect(log).toEqual([
        'fitAll',
        `fitArea ${JSON.stringify({ x: frame.x + 100, y: frame.y + 100, width: 250, height: 300 })}`,
      ])
    })
  })

  describe('hideInEveryFormat', () => {
    it('hides layers in every format as one undo step, and shows them again', () => {
      const { actions, session } = harness()
      expect(actions.hideInEveryFormat(['a'], true)).toBe(true)
      expect(session.design().nodes.a?.props.visible).toBe(false)
      actions.hideInEveryFormat(['a'], false)
      expect(session.design().nodes.a?.props.visible).not.toBe(false)
    })
  })
})
