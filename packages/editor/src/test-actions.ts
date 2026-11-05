// The actions' test fixtures: a page of two frames, the same with layers laid out by auto layout,
// and the actions over a real session, selection and drags, logging what they ask of the rest.
import { render } from '@dazbee/renderer'
import type { DesignInput } from '@dazbee/schema'

import { type ActionsDeps, editorActions } from './actions.ts'
import { type Frame, pageFrames } from './canvas/frames.ts'
import { editorFrameActions } from './frame-actions.ts'
import { editorAutoLayoutDrag } from './gestures/select/auto-layout-drag.ts'
import { editorTransformDrag } from './gestures/select/transform-drag.ts'
import { hug } from './layers/hug.ts'
import { measure, sessionOf, testBoxes } from './layers/test-boxes.ts'
import { editorSelection } from './selection.ts'

const rect = (
  parentId: string,
  index: string,
  box: { x: number; y: number; width: number; height: number },
  extra: Record<string, unknown> = {},
) => ({
  type: 'graphic' as const,
  parentId,
  index,
  name: 'Rect',
  props: { ...box, shape: { kind: 'rect' as const }, ...extra },
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
const PADDED = (pad: number) => ({ top: pad, right: pad, bottom: pad, left: pad })
/**
 * The design with a row laid out by auto layout lower in the square: a fixed square, a square that
 * fills the row's width, and a box hugging one square inside its padding, laid out by auto layout too.
 */
export const FLOW: DesignInput = {
  ...DESIGN,
  nodes: {
    ...DESIGN.nodes,
    flow: {
      type: 'box',
      parentId: 'sq',
      link: 'flow',
      index: 'a5',
      name: 'Flow',
      props: {
        x: 40,
        y: 800,
        width: 560,
        height: 160,
        sizing: { width: 'fixed', height: 'hug' },
        layout: { direction: 'row', gap: 20, padding: PADDED(20) },
      },
    },
    fixed: { ...rect('flow', 'a0', { x: 0, y: 0, width: 120, height: 120 }), link: 'fixed' },
    filling: {
      ...rect('flow', 'a1', { x: 0, y: 0, width: 100, height: 120 }, { sizing: { width: 'fill', height: 'fixed' } }),
      link: 'filling',
    },
    hugging: {
      type: 'box',
      parentId: 'flow',
      link: 'hugging',
      index: 'a2',
      name: 'Hugging',
      props: {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        sizing: { width: 'hug', height: 'hug' },
        layout: { direction: 'row', gap: 0, padding: PADDED(30) },
      },
    },
    inHug: { ...rect('hugging', 'a0', { x: 0, y: 0, width: 60, height: 60 }), link: 'inHug' },
  },
}

/** The actions on a real session, selection and drags over the page's frames, logging what they ask of the view, the tools and the pen. */
export function harness(penDrawing = false, design = DESIGN) {
  const session = sessionOf(design)
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
  const frameActions = editorFrameActions({
    session,
    view: {
      page: () => 'p1',
      showArea: (area) => log.push(`showArea ${JSON.stringify(area)}`),
      showWhole: (area) => log.push(`showWhole ${JSON.stringify(area)}`),
    },
    tools: { setTool: (tool) => log.push(`tool ${tool}`) },
    frameName: (width, height) => `Size ${width}×${height}`,
    selection,
    drawOverlay: () => log.push('overlay'),
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
    frameActions,
    notify: (notice) => log.push(notice),
    drawOverlay: () => log.push('overlay'),
  }
  const actions = editorActions(deps)
  /** A layer's x and y. */
  const at = (id: string) => {
    const p = session.design().nodes[id]?.props as { x: number; y: number }
    return { x: p.x, y: p.y }
  }
  /** Where each layer of the square is drawn, by id. */
  const drawn = () =>
    Object.fromEntries(
      Object.keys(session.design().nodes)
        .filter((id) => session.design().nodes[id]?.parentId !== 'wide')
        .map((id) => [id, boxes.drawnBoxOf(frame, id)]),
    )
  return { actions, frameActions, session, selection, frame, wide, log, at, drawn }
}
