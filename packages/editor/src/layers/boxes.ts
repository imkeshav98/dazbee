// Where layers are in a frame, read from the document: their boxes as layers see them and as
// drawn, the containers around them, the selection's box, a path's points, the image fill a crop
// works on, and the parent a new layer goes in.
import type { Image } from '@dazbee/canvaskit'
import { ancestorsOf, mergedProps, type Session } from '@dazbee/doc'
import { render, type SceneLayer } from '@dazbee/renderer'
import {
  canHold,
  type Design,
  formatScope,
  type ImagePaint,
  type Paint,
  pathScale,
  type Point,
  type Rect,
} from '@dazbee/schema'

import { type Frame, scope } from '../canvas/grid.ts'
import { findLayer, type FrameScenes } from '../canvas/scenes.ts'
import { coverCrop, imageRect, type Size } from '../gestures/crop.ts'
import { offsetPath, parsePath, type PenPath, scalePath } from '../gestures/path.ts'
import type { EditorResources } from '../resources.ts'
import type { EditorSelection } from '../selection.ts'
import { laidOut, propIn } from './auto-layout.ts'
import { boundsOf, type Box, centreOf, drawnFrom, type Handle, HANDLES, turn } from './transform.ts'

/**
 * The image fill a crop works on (#48): the topmost of a layer's fills in a frame, with where the
 * whole image sits for the crop it shows now, the image and its size, and the layer's box with
 * its containers, the box last.
 */
export interface CropTarget {
  fills: Paint[]
  index: number
  fill: ImagePaint
  image: Image
  size: Size
  box: Box
  rect: Rect
  around: Box[]
}

export interface BoxesDeps {
  session: Session
  scenes: Pick<FrameScenes, 'scene' | 'measure'>
  resources: Pick<EditorResources, 'resources' | 'bytes'>
  selection: Pick<EditorSelection, 'current' | 'entered'>
  /** The design as last drawn. */
  drawn: () => Design
  /** The frame of the grid as last drawn with a key, if there is one. */
  frameOf: (key: string | undefined) => Frame | undefined
}

export interface EditorBoxes {
  boxIn(frame: Frame, id: string, from?: Design): Box | null
  parentFor(frame: Frame, type: string, now: Design): string
  containersOf(frame: Frame, parentId: string | undefined, from?: Design): Box[]
  drawnBoxOf(frame: Frame, id: string, from?: Design): Box | null
  pickable(layer: SceneLayer): boolean
  lockedSelection(): boolean
  handlesFor(): readonly Handle[]
  roots(from?: Design): string[]
  selectionBox(): { frame: Frame; box: Box; drawn: Box; around: Box[] } | null
  pathIn(frame: Frame, id: string, from?: Design): { path: PenPath; box: Box; around: Box[] } | null
  cropTarget(frame: Frame, id: string, from?: Design): CropTarget | null
  drawnInFlow(ids: string[], pageId: string): Record<string, Record<string, Omit<Box, 'rotation'>>> | undefined
  drawnContains(frame: Frame, id: string, p: Point, from: Design): boolean
}

export const visibleIn = (now: Design, frame: Frame, id: string) => {
  const value = now.overrides[scope(frame)]?.[id]?.visible ?? now.nodes[id]?.props.visible
  return value !== false
}

export function editorBoxes({ session, scenes, resources, selection, drawn, frameOf }: BoxesDeps): EditorBoxes {
  /**
   * A layer's box in one frame, read from the document: the base with the format's overrides.
   * Hidden layers have one too, so they move with a group and stay selected.
   */
  function boxIn(frame: Frame, id: string, from: Design = session.design()): Box | null {
    const node = from.nodes[id]
    if (!node) return null
    // Auto layout places and sizes a layer as the scene is built (#46): its box is the scene's.
    if (laidOut(id, from)) {
      const shown = findLayer(scenes.scene(frame).layers, id)
      if (shown)
        return {
          x: shown.props.x,
          y: shown.props.y,
          width: shown.props.width,
          height: shown.props.height,
          rotation: shown.props.rotation,
        }
    }
    const p = mergedProps(from, scope(frame), id) as {
      x: number
      y: number
      width: number
      height: number
      rotation?: number
    }
    return { x: p.x, y: p.y, width: p.width, height: p.height, rotation: p.rotation ?? 0 }
  }

  /**
   * Where a new layer of `type` that a tool makes in a frame goes: into the group, frame or boolean
   * double-clicked into if it can hold it, otherwise onto the frame's page.
   */
  function parentFor(frame: Frame, type: string, now: Design) {
    const entered = selection.entered()
    const inside = entered ? now.nodes[entered] : undefined
    return entered && inside && canHold(inside.type, type) ? entered : frame.pageId
  }
  /** The groups and frames a layer is inside, outermost first, as boxes in a frame. */
  function containersOf(frame: Frame, parentId: string | undefined, from: Design = session.design()): Box[] {
    const boxes: Box[] = []
    for (const up of ancestorsOf(from, parentId ?? '')) {
      const box = boxIn(frame, up, from)
      if (box) boxes.unshift(box)
    }
    return boxes
  }
  /** A layer's box as it is drawn in a frame. */
  function drawnBoxOf(frame: Frame, id: string, from: Design = session.design()) {
    const box = boxIn(frame, id, from)
    return box && drawnFrom(box, containersOf(frame, from.nodes[id]?.parentId, from))
  }
  /** Locked in place layers are left out where layers are gathered: select all and a marquee. */
  const pickable = (layer: SceneLayer) => !drawn().nodes[layer.id]?.lock?.move
  /** Whether the selection is locked in place: it shows no handles and a press can't move it. */
  const lockedSelection = () => Boolean(selection.current()?.ids.some((id) => drawn().nodes[id]?.lock?.move))
  /**
   * The handles the selection has: none while it is locked in place; one text that grows with its
   * words has no top or bottom ones, since only a fixed box has a height of its own.
   */
  function handlesFor(): readonly Handle[] {
    const current = selection.current()
    const frame = frameOf(current?.frame)
    if (!current || !frame || lockedSelection()) return []
    const [only] = current.ids
    if (
      current.ids.length === 1 &&
      only &&
      drawn().nodes[only]?.type === 'text' &&
      propIn(frame, only, 'boxMode', drawn()) !== 'fixed'
    )
      return HANDLES.filter((h) => h !== 'n' && h !== 's')
    return HANDLES
  }

  /** Selected layers that aren't inside another selected layer: the ones a transform moves. */
  function roots(from: Design = session.design()) {
    const ids = selection.current()?.ids ?? []
    const inside = (id: string) => ancestorsOf(from, from.nodes[id]?.parentId ?? '').some((up) => ids.includes(up))
    return ids.filter((id) => from.nodes[id] && !inside(id))
  }
  /**
   * The box the handles go on: a single layer's own, turned with it, or the unturned box around
   * several. `box` is as the layers inside their containers see it, which gestures work in;
   * `drawn` is where it is on the page once the containers turn it; `around` are the containers.
   */
  function selectionBox(): { frame: Frame; box: Box; drawn: Box; around: Box[] } | null {
    const current = selection.current()
    const frame = current && frameOf(current.frame)
    if (!frame || !current) return null
    const now = session.design()
    const boxes = current.ids.map((id) => boxIn(frame, id, now)).filter((b): b is Box => b !== null)
    if (boxes.length === 0) return null
    const box = boxes.length === 1 ? (boxes[0] as Box) : boundsOf(boxes)
    const around = containersOf(frame, now.nodes[current.ids[0] ?? '']?.parentId, now)
    return { frame, box, drawn: drawnFrom(box, around), around }
  }

  /**
   * A path layer's path in one frame, in the coordinates of its parent before the layer turns it
   * (#45), with its box and what turns it: its containers, then the layer itself.
   */
  function pathIn(frame: Frame, id: string, from: Design = session.design()) {
    const node = from.nodes[id]
    const box = boxIn(frame, id, from)
    if (node?.type !== 'graphic' || !box) return null
    const { shape } = mergedProps(from, scope(frame), id) as typeof node.props
    if (shape.kind !== 'path') return null
    try {
      // As it is drawn: scaled from the box it was drawn in to this one. A box squashed flat on an
      // axis keeps the data's length there, so editing it never loses the points.
      const scale = pathScale(shape, box.width, box.height)
      const sx = scale.sx || 1
      const sy = scale.sy || 1
      return {
        path: offsetPath(scalePath(parsePath(shape.d), sx, sy), box.x, box.y),
        box,
        around: [...containersOf(frame, node.parentId, from), box],
      }
    } catch {
      return null
    }
  }
  /**
   * The image fill a crop works on (#48): the topmost of a layer's fills in a frame, with where the
   * whole image sits for the crop it shows now (fill's when it has none of its own), the image and
   * its size, and the layer's box with its containers, the box last.
   */
  function cropTarget(frame: Frame, id: string, from: Design = session.design()): CropTarget | null {
    const node = from.nodes[id]
    const box = boxIn(frame, id, from)
    if (!node || !box || !('fills' in node.props)) return null
    const { fills } = mergedProps(from, scope(frame), id) as { fills: Paint[] }
    const index = fills.findLastIndex((f) => f.type === 'image')
    const fill = fills[index]
    const image = fill?.type === 'image' ? resources.resources().images.get(fill.assetId) : undefined
    if (fill?.type !== 'image' || !image) return null
    const size = { width: image.width(), height: image.height() }
    const crop = fill.fit === 'crop' && fill.crop ? fill.crop : coverCrop(size, box)
    return {
      fills,
      index,
      fill,
      image,
      size,
      box,
      rect: imageRect(crop, size, box),
      around: [...containersOf(frame, node.parentId, from), box],
    }
  }
  /**
   * Where layers inside a frame that has auto layout in any format are drawn, in every format of
   * their page (shown or not), for a command that wraps them; none for layers in no flow.
   */
  function drawnInFlow(
    ids: string[],
    pageId: string,
  ): Record<string, Record<string, Omit<Box, 'rotation'>>> | undefined {
    const now = session.design()
    const parentId = now.nodes[ids[0] ?? '']?.parentId ?? ''
    const parent = now.nodes[parentId]
    const laidOut =
      parent?.type === 'frame' &&
      Object.keys(now.formats).some((f) => mergedProps(now, formatScope(f), parentId).layout)
    if (!laidOut) return undefined
    const drawn: Record<string, Record<string, Omit<Box, 'rotation'>>> = {}
    for (const formatId of Object.keys(now.formats)) {
      const boxes: Record<string, Omit<Box, 'rotation'>> = {}
      const walk = (layers: SceneLayer[]) => {
        for (const l of layers) {
          if (ids.includes(l.id))
            boxes[l.id] = { x: l.props.x, y: l.props.y, width: l.props.width, height: l.props.height }
          walk(l.children)
        }
      }
      walk(render(now, pageId, formatId, undefined, scenes.measure(), resources.bytes().variables).layers)
      drawn[formatScope(formatId)] = boxes
    }
    return drawn
  }
  /** Whether a point on the page is inside a layer as it is drawn in a frame. */
  function drawnContains(frame: Frame, id: string, p: Point, from: Design) {
    const box = drawnBoxOf(frame, id, from)
    if (!box) return false
    const q = turn(p, centreOf(box), -box.rotation)
    return q.x >= box.x && q.y >= box.y && q.x <= box.x + box.width && q.y <= box.y + box.height
  }

  return {
    boxIn,
    parentFor,
    containersOf,
    drawnBoxOf,
    pickable,
    lockedSelection,
    handlesFor,
    roots,
    selectionBox,
    pathIn,
    cropTarget,
    drawnInFlow,
    drawnContains,
  }
}
