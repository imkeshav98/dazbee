// Where layers are in a frame, read from the document: their boxes as layers see them and as
// drawn, the containers around them, the selection's box and handles, what a drag snaps to, a
// path's points, the image fill a crop works on, and the parent a new layer goes in.
import type { Image } from '@dazbee/canvaskit'
import { ancestorsOf, childrenOf, frameIdOf, type Session } from '@dazbee/doc'
import { render, type SceneLayer } from '@dazbee/renderer'
import { canHold, type Design, type ImagePaint, type Paint, pathScale, type Point, type Rect } from '@dazbee/schema'

import type { Frame } from '../canvas/frames.ts'
import type { HitOptions } from '../canvas/hit-test.ts'
import { findLayer, type FrameScenes } from '../canvas/scenes.ts'
import { coverCrop, imageRect, type Size } from '../gestures/crop/crop.ts'
import { offsetPath, parsePath, type PenPath, scalePath } from '../gestures/pen/path.ts'
import type { EditorResources } from '../resources.ts'
import type { EditorSelection } from '../selection.ts'
import { laidOut, placedInside, propIn } from './auto-layout.ts'
import { boundsOf, type Box, centreOf, drawnFrom, type Handle, HANDLES, normalAngle, turn } from './transform.ts'

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

/**
 * The box the handles go on: a single layer's own, turned with it, or the unturned box around
 * several. `box` is as the layers inside their containers see it, which gestures work in;
 * `drawn` is where it is in the frame once the containers turn it; `around` are the containers.
 */
export interface SelectionBox {
  frame: Frame
  box: Box
  drawn: Box
  around: Box[]
}

export interface BoxesDeps {
  session: Session
  scenes: Pick<FrameScenes, 'scene' | 'measure' | 'hit'>
  resources: Pick<EditorResources, 'resources' | 'bytes'>
  selection: Pick<EditorSelection, 'current' | 'entered'>
  /** The design as last drawn. */
  drawn: () => Design
  /** The shown page's frame with an id, as last drawn, if there is one. */
  frameOf: (id: string | undefined) => Frame | undefined
}

export interface EditorBoxes {
  /** A layer's box in its frame, as layers inside its containers see it: auto layout's, or its own. */
  boxIn(frame: Frame, id: string, from?: Design): Box | null
  /** The groups and boxes a layer is inside, outermost first, each as its position, size and turn in a frame. */
  containersOf(frame: Frame, parentId: string | undefined, from?: Design): Box[]
  /** A layer's box as it is drawn in its frame, turned by its containers. */
  drawnBoxOf(frame: Frame, id: string, from?: Design): Box | null
  /** Whether a point in a frame is inside a layer as it is drawn there. */
  drawnContains(frame: Frame, id: string, p: Point, from: Design): boolean
  /** The boxes a transform of layers changes, as they are now: the layers and those under them that no flow places. */
  startBoxes(frame: Frame, ids: string[]): Map<string, Box>
  /** The box the selection's handles go on, with where it is drawn and its containers; null with nothing selected. */
  selectionBox(): SelectionBox | null
  /** The selected layers that aren't inside another selected one: the ones a transform moves. */
  roots(from?: Design): string[]
  /** Whether a layer can be gathered by select all or a marquee: it isn't locked in place. */
  pickable(layer: SceneLayer): boolean
  /** Whether the selection is locked in place: it shows no handles and a press can't move it. */
  lockedSelection(): boolean
  /** The handles the selection has. */
  handlesFor(): readonly Handle[]
  /** The boxes a drag of layers in a frame can snap to, besides the frame; null inside a turned container. */
  snapBoxes(frame: Frame, ids: string[], around: Box[]): Rect[] | null
  /** A path layer's path in a frame, with its box and what turns it: its containers, then the layer. */
  pathIn(frame: Frame, id: string, from?: Design): { path: PenPath; box: Box; around: Box[] } | null
  /** The image fill a crop of a layer in a frame works on, or null when it has none to crop. */
  cropTarget(frame: Frame, id: string, from?: Design): CropTarget | null
  /** Where layers in a flow are drawn in their frame, for a command that wraps them; none in no flow. */
  drawnInFlow(ids: string[]): Record<string, Omit<Box, 'rotation'>> | undefined
  /** Whether every layer of a frame that two designs both hold is drawn in the same place, at the same size and turn, in each. */
  drawnAlike(frameId: string, before: Design, after: Design): boolean
  /** Where a new layer of a type that a tool makes in a frame goes: the group or box gone into, or the frame. */
  parentFor(frame: Frame, type: string, now: Design): string
  /**
   * The deepest layer a press, a click, a hover or a tap picks at a point of a frame: the one that
   * shows there, as `hitTest` tells it, with the selected layers counted as it counts them.
   */
  pickAt(frame: Frame, p: Point, options?: HitOptions): SceneLayer | null
  /** The layer locked in place that a press at a point lands on, the one a click there would select; null when it is not locked. */
  lockedAt(frame: Frame, p: Point): string | null
  /** What a press on a layer picks: a selected layer it is in, what is directly in the group gone into, or else the top-level layer that holds it. */
  target(hitId: string, frame: string): string
  /** Whether a layer is inside the group or box gone into, not the container itself. */
  insideEntered(id: string): boolean
  /** A layer's box as it is drawn in a frame, in design pixels, without its turn; null when it has none. */
  drawnRect(frame: Frame, id: string): Rect | null
}

/** Whether a layer shows: it isn't hidden. */
export const visibleIn = (now: Design, id: string) => now.nodes[id]?.props.visible !== false

export function editorBoxes({ session, scenes, resources, selection, drawn, frameOf }: BoxesDeps): EditorBoxes {
  /**
   * A layer's box in its frame, read from the document. Hidden layers have one too, so they move
   * with a group and stay selected.
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
    const p = node.props as {
      x: number
      y: number
      width: number
      height: number
      rotation?: number
    }
    return { x: p.x, y: p.y, width: p.width, height: p.height, rotation: p.rotation ?? 0 }
  }

  /**
   * Where a new layer of `type` that a tool makes in a frame goes: into the group, box or boolean
   * double-clicked into if it can hold it, otherwise onto the frame itself.
   */
  function parentFor(frame: Frame, type: string, now: Design) {
    const entered = selection.entered()
    const inside = entered ? now.nodes[entered] : undefined
    return entered && inside && canHold(inside.type, type) ? entered : frame.id
  }
  /** The groups and boxes a layer is inside, outermost first, each as its position, size and turn in a frame. */
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
    const frame = frameOf(current?.frameId)
    if (!current || !frame || lockedSelection()) return []
    const [only] = current.ids
    if (
      current.ids.length === 1 &&
      only &&
      drawn().nodes[only]?.type === 'text' &&
      propIn(only, 'boxMode', drawn()) !== 'fixed'
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
   * The boxes a transform changes: each root and every layer under it, as they are now. A layer
   * auto layout places inside a root is left out: its box puts it where it goes.
   */
  function startBoxes(frame: Frame, ids: string[]) {
    const now = session.design()
    const boxes = new Map<string, Box>()
    const add = (id: string, root: string) => {
      if (id !== root && placedInside(id, root, now)) return
      const box = boxIn(frame, id, now)
      if (box) boxes.set(id, box)
      for (const [child] of childrenOf(now, id)) add(child, root)
    }
    for (const id of ids) add(id, id)
    return boxes
  }
  /** The box the handles go on, with where it is drawn and its containers. */
  function selectionBox(): SelectionBox | null {
    const current = selection.current()
    const frame = current && frameOf(current.frameId)
    if (!frame || !current) return null
    const now = session.design()
    const boxes = current.ids.map((id) => boxIn(frame, id, now)).filter((b): b is Box => b !== null)
    if (boxes.length === 0) return null
    const box = boxes.length === 1 ? (boxes[0] as Box) : boundsOf(boxes)
    const around = containersOf(frame, now.nodes[current.ids[0] ?? '']?.parentId, now)
    return { frame, box, drawn: drawnFrom(box, around), around }
  }

  /**
   * What a drag in a frame can snap to besides the frame: its top-level layers as drawn and, inside
   * a group or box, the layers beside the dragged ones that show there and the container itself.
   * Nothing inside a turned container snaps, since its lines don't run along the frame.
   */
  function snapBoxes(frame: Frame, ids: string[], around: Box[]): Rect[] | null {
    if (around.some((b) => b.rotation !== 0)) return null
    const now = session.design()
    const holds = (id: string) => ids.some((selected) => ancestorsOf(now, selected).includes(id))
    const others: Rect[] = scenes
      .scene(frame)
      .layers.filter((layer) => !holds(layer.id))
      .map((layer) => boundsOf([layer.props]))
    const parent = now.nodes[ids[0] ?? '']?.parentId
    if (parent && now.nodes[parent]) {
      const box = boxIn(frame, parent, now)
      if (box) others.push(box)
      for (const [id] of childrenOf(now, parent)) {
        const sibling = !ids.includes(id) && visibleIn(now, id) && boxIn(frame, id, now)
        if (sibling) others.push(boundsOf([sibling]))
      }
    }
    return others
  }

  /**
   * A path layer's path in one frame, in the coordinates of its parent before the layer turns it
   * (#45), with its box and what turns it: its containers, then the layer itself.
   */
  function pathIn(frame: Frame, id: string, from: Design = session.design()) {
    const node = from.nodes[id]
    const box = boxIn(frame, id, from)
    if (node?.type !== 'graphic' || !box) return null
    const { shape } = node.props
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
    const { fills } = node.props as { fills: Paint[] }
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
   * Where layers inside a box with auto layout are drawn in their frame, for a command that wraps
   * them; none for layers in no flow.
   */
  function drawnInFlow(ids: string[]): Record<string, Omit<Box, 'rotation'>> | undefined {
    const now = session.design()
    const first = ids[0] ?? ''
    const parent = now.nodes[now.nodes[first]?.parentId ?? '']
    const frameId = frameIdOf(now, first)
    if (parent?.type !== 'box' || !parent.props.layout || frameId === undefined) return undefined
    const boxes: Record<string, Omit<Box, 'rotation'>> = {}
    const walk = (layers: SceneLayer[]) => {
      for (const l of layers) {
        if (ids.includes(l.id))
          boxes[l.id] = { x: l.props.x, y: l.props.y, width: l.props.width, height: l.props.height }
        walk(l.children)
      }
    }
    walk(render(now, frameId, undefined, scenes.measure(), resources.bytes().variables).layers)
    return boxes
  }
  /**
   * Whether every layer of a frame that two designs both hold is drawn in the same place, at the
   * same size and turn, in each, within what rounding to hundredths leaves.
   */
  function drawnAlike(frameId: string, before: Design, after: Design) {
    const now = drawnLayers(frameId, after)
    return [...drawnLayers(frameId, before)].every(([id, was]) => {
      const is = now.get(id)
      return (
        !is ||
        ((['x', 'y', 'width', 'height'] as const).every((k) => Math.abs(is[k] - was[k]) < 0.05) &&
          Math.abs(normalAngle(is.rotation - was.rotation)) < 0.05)
      )
    })
  }
  /** Where each layer of a frame is drawn in a design, turned with the containers around it. */
  function drawnLayers(frameId: string, from: Design) {
    const boxes = new Map<string, Box>()
    const walk = (layers: SceneLayer[], around: Box[]) => {
      for (const l of layers) {
        const box = {
          x: l.props.x,
          y: l.props.y,
          width: l.props.width,
          height: l.props.height,
          rotation: l.props.rotation,
        }
        boxes.set(l.id, drawnFrom(box, around))
        walk(l.children, [...around, box])
      }
    }
    walk(render(from, frameId, undefined, scenes.measure(), resources.bytes().variables).layers, [])
    return boxes
  }
  /** Whether a point in a frame is inside a layer as it is drawn there. */
  function drawnContains(frame: Frame, id: string, p: Point, from: Design) {
    const box = drawnBoxOf(frame, id, from)
    if (!box) return false
    const q = turn(p, centreOf(box), -box.rotation)
    return q.x >= box.x && q.y >= box.y && q.x <= box.x + box.width && q.y <= box.y + box.height
  }

  /**
   * The locked in place layer a press at `p` lands on, the one a click would select: the topmost
   * layer there, as a click picks it, when that one is locked. A click selects it, so its lock can
   * be undone; a drag from it draws a marquee and moves nothing, it or what lies beneath.
   */
  function pickAt(frame: Frame, p: Point, options: HitOptions = {}) {
    return scenes.hit(frame, p, { ...options, selected: selection.current()?.ids })
  }
  function lockedAt(frame: Frame, p: Point): string | null {
    const top = pickAt(frame, p)
    const id = top ? target(top.id, frame.id) : null
    return id && drawn().nodes[id]?.lock?.move ? id : null
  }
  /**
   * What a press on a layer picks: a selected layer it is in, so the selection moves whole; inside
   * the group or box double-clicked into, what is directly in it; or else the top-level layer that
   * holds it, so a click on a group's child picks the group.
   */
  function target(hitId: string, frame: string) {
    const chain = ancestorsOf(drawn(), hitId)
    const current = selection.current()
    const selected = current?.frameId === frame ? chain.find((id) => current?.ids.includes(id)) : undefined
    const entered = selection.entered()
    const at = entered ? chain.indexOf(entered) : -1
    return selected ?? (at > 0 ? chain[at - 1] : chain.at(-1)) ?? hitId
  }
  /** Whether a layer is inside the entered group or box, not the container itself. */
  function insideEntered(id: string) {
    return ancestorsOf(drawn(), drawn().nodes[id]?.parentId ?? '').some((up) => up === selection.entered())
  }

  function drawnRect(frame: Frame, id: string): Rect | null {
    const box = drawnBoxOf(frame, id)
    return box && { x: box.x, y: box.y, width: box.width, height: box.height }
  }

  return {
    boxIn,
    containersOf,
    drawnBoxOf,
    drawnContains,
    startBoxes,
    selectionBox,
    roots,
    pickable,
    lockedSelection,
    handlesFor,
    snapBoxes,
    pathIn,
    cropTarget,
    drawnInFlow,
    drawnAlike,
    parentFor,
    pickAt,
    lockedAt,
    target,
    insideEntered,
    drawnRect,
  }
}
