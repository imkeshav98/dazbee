// Drawing with a tool: a shape or box dragged out, a text box and an image box, a frame dragged
// out with the Frame tool, and the box being dragged as the overlay shows it.
import { childrenOf, type Session } from '@dazbee/doc'
import { canHold, type Point, type Rect, SIZE_LIMITS } from '@dazbee/schema'

import { type Camera, toScreen } from '../canvas/camera.ts'
import type { Frame } from '../canvas/frames.ts'
import { px } from '../canvas/rulers.ts'
import { laidOut } from '../layers/auto-layout.ts'
import type { EditorBoxes } from '../layers/boxes.ts'
import { boundsOf, type Box, localTo, round } from '../layers/transform.ts'
import { runQuietly } from '../run-quietly.ts'
import type { EditorSelection } from '../selection.ts'
import type { EditorTyping } from '../text/typing.ts'
import type { EditorTools, PlacedAsset } from '../tools.ts'
import {
  clickedRect,
  draggedRect,
  drawsBox,
  type DrawTool,
  imageIn,
  keepRatio,
  newDrawn,
  newImage,
  newText,
} from './draw-tools.ts'
import { CLICK_SLOP } from './press.ts'

/** A shape or box being drawn, from the press until it ends: the new layer and every change the drag makes to it are one undo step. */
export interface ShapeDrag {
  kind: 'draw'
  tool: DrawTool
  frame: Frame
  around: Box[]
  from: Point
  id: string
  moved: boolean
  roots: string[]
  end: () => void
}
/** The box the text tool is dragging out, from the press until it ends. */
export interface TextBoxDrag {
  kind: 'textBox'
  frame: Frame
  around: Box[]
  parentId: string
  from: Point
  to: Point
}
/** The box the image tool is dragging out for its image, from the press until it ends. */
export interface ImageBoxDrag {
  kind: 'imageBox'
  frame: Frame
  around: Box[]
  parentId: string
  from: Point
  to: Point
  asset: PlacedAsset
}

/** The frame the Frame tool is dragging out on the shown page, in world units, from the press until it ends. */
export interface FrameDrag {
  kind: 'frameDraw'
  from: Point
  to: Point
}

/** A drag that draws a new layer or frame. */
export type DrawingDrag = ShapeDrag | TextBoxDrag | ImageBoxDrag | FrameDrag

export interface DrawingDeps {
  canvas: HTMLCanvasElement
  session: Session
  selection: Pick<EditorSelection, 'select'>
  tools: Pick<EditorTools, 'setTool'>
  typing: Pick<EditorTyping, 'stop' | 'start'>
  boxes: Pick<EditorBoxes, 'boxIn' | 'containersOf' | 'parentFor'>
  camera: () => Camera
  /** The page the canvas shows, which a frame drawn with the Frame tool goes on. */
  page: () => string
  /** Groups fit what they hold again after a change inside them, in the same undo step. */
  hug: (ids: string[]) => void
  /** Puts an overlay element over a box in a frame, in design pixels. */
  placeBox: (el: HTMLElement, frame: Frame, box: Rect) => void
  /** Draws the overlay. */
  drawOverlay: () => void
}

export interface EditorDrawing {
  /** The box a text, image box or frame drag is drawing, as the overlay shows it; nothing for a shape. */
  parts(g: DrawingDrag): HTMLElement[]
  /**
   * A press with a tool of the shape menu: the new layer, in the group or box gone into when it can
   * hold it, and a drag that sizes it, one undo step until it is released. Null when it can't be made.
   */
  pressShape(e: PointerEvent, shape: DrawTool, at: { frame: Frame; p: Point }): ShapeDrag | null
  /** A press with the text tool: a drag of the box the text will have, or a click for text that grows with its words. */
  pressText(e: PointerEvent, at: { frame: Frame; p: Point }): TextBoxDrag
  /** A press with the image tool and its image: a drag of the box the image will cover, or a click for its own size. */
  pressImage(e: PointerEvent, at: { frame: Frame; p: Point }, asset: PlacedAsset): ImageBoxDrag
  /** A press with the Frame tool, anywhere on the stage, at a world point: a drag of the frame it adds to the shown page. */
  pressFrame(e: PointerEvent, world: Point): FrameDrag
  /**
   * Follows the pointer: a shape grows to it; a box's corner goes to it, Shift keeping an image's
   * shape. A frame's point is in world units, the others' in their frame's design pixels.
   */
  drag(g: DrawingDrag, p: Point, shift: boolean, alt: boolean): void
  /**
   * Ends a drawing gesture, its layer selected and the select tool back. A shape's undo step
   * closes; a text box's layer is made and typed into, one undo step until typing stops; an
   * image box's layer is made, one undo step. A frame dragged out is added, one undo step, with
   * nothing selected; a click adds none.
   */
  release(g: DrawingDrag): void
}

/** The name a frame drawn with the Frame tool gets. */
const FRAME_NAME = 'Frame'

/** Whether a gesture is one that draws a new layer or frame. */
export const isDrawing = (g: { kind: string } | null): g is DrawingDrag =>
  g?.kind === 'draw' || g?.kind === 'textBox' || g?.kind === 'imageBox' || g?.kind === 'frameDraw'

export function editorDrawing({
  canvas,
  session,
  selection,
  tools,
  typing,
  boxes: { boxIn, containersOf, parentFor },
  camera,
  page,
  hug,
  placeBox,
  drawOverlay,
}: DrawingDeps): EditorDrawing {
  /**
   * Where a box a tool drags out starts: in the group or box double-clicked into if it can hold
   * a layer of `type`, otherwise in the frame, at the press as layers there see it.
   */
  function boxStart(at: { frame: Frame; p: Point }, type: 'text' | 'graphic') {
    const now = session.design()
    const parentId = parentFor(at.frame, type, now)
    const around = containersOf(at.frame, parentId, now)
    const from = localTo(at.p, around)
    return { frame: at.frame, around, parentId, from, to: from }
  }
  /** The box a text or image box gesture dragged, or null when the press stayed a click. */
  function draggedBox(g: { from: Point; to: Point }) {
    const dragged = Math.max(Math.abs(g.to.x - g.from.x), Math.abs(g.to.y - g.from.y)) * camera().zoom >= CLICK_SLOP
    return dragged
      ? {
          x: Math.min(g.from.x, g.to.x),
          y: Math.min(g.from.y, g.to.y),
          width: Math.abs(g.to.x - g.from.x),
          height: Math.abs(g.to.y - g.from.y),
        }
      : null
  }
  /**
   * The box the text tool (#47), the image tool or the Frame tool is drawing, drawn as a marquee is
   * and marked with the gesture's kind; nothing for a shape, which draws itself.
   */
  function boxParts(gesture: DrawingDrag) {
    if (gesture.kind === 'draw') return []
    const box = document.createElement('div')
    box.className = 'marquee'
    box.dataset[gesture.kind] = ''
    const rect = {
      x: Math.min(gesture.from.x, gesture.to.x),
      y: Math.min(gesture.from.y, gesture.to.y),
      width: Math.abs(gesture.to.x - gesture.from.x),
      height: Math.abs(gesture.to.y - gesture.from.y),
    }
    if (gesture.kind !== 'frameDraw') {
      placeBox(box, gesture.frame, rect)
      return [box]
    }
    const at = toScreen(camera(), rect)
    Object.assign(box.style, {
      left: px(at.x),
      top: px(at.y),
      width: px(rect.width * camera().zoom),
      height: px(rect.height * camera().zoom),
    })
    return [box]
  }

  /**
   * Starts drawing a shape (#44) or a box where the pointer went down: inside the group, box or
   * boolean double-clicked into if the press is in it and it can hold it, otherwise in the frame.
   * The new layer and every change the drag makes to it are one undo step.
   */
  function startDrawing(e: PointerEvent, shape: DrawTool, at: { frame: Frame; p: Point }): ShapeDrag | null {
    typing.stop()
    const now = session.design()
    const parentId = parentFor(at.frame, drawsBox(shape) ? 'box' : 'graphic', now)
    const around = containersOf(at.frame, parentId, now)
    const from = localTo(at.p, around)
    const end = session.beginGesture()
    let id = ''
    if (
      !runQuietly(() => {
        id = session.run('node.create', { parentId, layer: newDrawn(shape) })
      })
    ) {
      end()
      return null
    }
    canvas.setPointerCapture(e.pointerId)
    const gesture: ShapeDrag = {
      kind: 'draw',
      tool: shape,
      frame: at.frame,
      around,
      from,
      id,
      moved: false,
      roots: [id],
      end,
    }
    runQuietly(() => session.run('node.update', { ids: [id], patch: draggedRect(shape, from, from, false, false) }))
    return gesture
  }
  /** A press with the text tool (#47): a click makes text that grows as it is typed, a drag a box of that size. */
  function startTextBox(e: PointerEvent, at: { frame: Frame; p: Point }): TextBoxDrag {
    typing.stop()
    canvas.setPointerCapture(e.pointerId)
    return { kind: 'textBox', ...boxStart(at, 'text') }
  }
  /**
   * A press with the image tool once its image is picked: a click places the image at its own size
   * (at most half the frame's), centred there; a drag places it covering the box dragged, which
   * Shift keeps to the image's shape. In the group or box double-clicked into if it can hold it.
   */
  function startImageBox(e: PointerEvent, at: { frame: Frame; p: Point }, asset: PlacedAsset): ImageBoxDrag {
    typing.stop()
    canvas.setPointerCapture(e.pointerId)
    return { kind: 'imageBox', ...boxStart(at, 'graphic'), asset }
  }
  /** A press with the Frame tool: a drag of the frame it adds, from the press, in world units. */
  function startFrame(e: PointerEvent, world: Point): FrameDrag {
    typing.stop()
    canvas.setPointerCapture(e.pointerId)
    return { kind: 'frameDraw', from: world, to: world }
  }
  /** Follows the pointer: a shape grows to it, Shift and Alt as `draggedRect` takes them; a box's corner goes to it, Shift keeping an image's shape. */
  function drag(g: DrawingDrag, p: Point, shift: boolean, alt: boolean) {
    if (g.kind === 'draw') {
      drawTo(g, p, shift, alt)
      return
    }
    g.to = g.kind === 'imageBox' && shift ? keepRatio(g.from, p, g.asset) : p
    drawOverlay()
  }
  /** Grows the shape being drawn to the pointer; a few screen pixels count as a click still. */
  function drawTo(g: ShapeDrag, p: Point, shift: boolean, alt: boolean) {
    if (!g.moved && Math.hypot(p.x - g.from.x, p.y - g.from.y) * camera().zoom < CLICK_SLOP) return
    g.moved = true
    runQuietly(() => session.run('node.update', { ids: [g.id], patch: draggedRect(g.tool, g.from, p, shift, alt) }))
  }
  /** Ends a drawing gesture: makes or finishes its layer, which is selected, and the select tool comes back. */
  function release(g: DrawingDrag) {
    if (g.kind === 'draw') finishDrawing(g)
    else if (g.kind === 'textBox') finishTextBox(g)
    else if (g.kind === 'imageBox') finishImageBox(g)
    else finishFrame(g)
  }
  /**
   * A click draws the shape at its usual size; either way the new shape is selected and the select
   * tool comes back. A box dragged around layers beside it takes them in, in the same undo step.
   */
  function finishDrawing(g: ShapeDrag) {
    if (!g.moved) runQuietly(() => session.run('node.update', { ids: [g.id], patch: clickedRect(g.tool, g.from) }))
    if (drawsBox(g.tool) && g.moved) enclose(g.frame, g.id)
    hug([g.id])
    g.end()
    selection.select([g.id], g.frame.key)
    tools.setTool('select')
  }
  /**
   * Moves the layers beside a new box that lie wholly inside it, as drawn in this frame, into it.
   * Layers locked in place stay where they are, and so does everything in an auto layout box,
   * where the layout, not the drag, places the new box.
   */
  function enclose(frame: Frame, id: string) {
    const now = session.design()
    const parent = now.nodes[id]?.parentId ?? ''
    const box = boxIn(frame, id, now)
    if (!box || laidOut(id, now)) return
    const inside = childrenOf(now, parent).flatMap(([child, node]) => {
      const b = child !== id && !node.lock?.move && boxIn(frame, child, now)
      if (!b) return []
      const shown = boundsOf([b])
      const fits =
        shown.x >= box.x &&
        shown.y >= box.y &&
        shown.x + shown.width <= box.x + box.width &&
        shown.y + shown.height <= box.y + box.height
      return fits && canHold('box', now.nodes[child]?.type ?? '') ? [child] : []
    })
    if (inside.length > 0) runQuietly(() => session.run('node.enclose', { id, ids: inside }))
  }
  /** Makes the text layer the text tool drew and starts typing into it, one undo step with the typing. */
  function finishTextBox(g: TextBoxDrag) {
    const box = draggedBox(g)
    const end = session.beginGesture()
    let id = ''
    if (
      !runQuietly(() => {
        id = session.run('node.create', {
          parentId: g.parentId,
          layer: newText(
            round(g.from.x),
            round(g.from.y),
            box && { width: round(box.width), height: round(box.height), x: round(box.x), y: round(box.y) },
          ),
        })
      })
    ) {
      end()
      return
    }
    tools.setTool('select')
    selection.select([id], g.frame.key)
    typing.start(id, g.frame.key, 0, end, true)
  }
  /** Places the image the image tool drew, one undo step; it is selected and the select tool comes back. */
  function finishImageBox(g: ImageBoxDrag) {
    const box = draggedBox(g)
    const layer = box
      ? imageIn(g.asset, {
          x: round(box.x),
          y: round(box.y),
          width: Math.max(1, round(box.width)),
          height: Math.max(1, round(box.height)),
        })
      : newImage(g.asset, g.from, g.frame)
    let id = ''
    if (
      !runQuietly(() =>
        session.gesture(() => {
          id = session.run('node.create', { parentId: g.parentId, layer })
          hug([id])
        }),
      )
    )
      return
    tools.setTool('select')
    selection.select([id], g.frame.key)
  }
  /**
   * Adds the frame the Frame tool dragged out to the shown page, empty and named Frame, on whole
   * pixels and held within the size limits, one undo step; a click adds none. Nothing is selected
   * after, and the select tool comes back.
   */
  function finishFrame(g: FrameDrag) {
    tools.setTool('select')
    if (!draggedBox(g)) return
    const x = Math.round(Math.min(g.from.x, g.to.x))
    const y = Math.round(Math.min(g.from.y, g.to.y))
    const size = withinSizeLimits(
      Math.round(Math.max(g.from.x, g.to.x)) - x,
      Math.round(Math.max(g.from.y, g.to.y)) - y,
    )
    if (runQuietly(() => session.run('frame.add', { pageId: page(), name: FRAME_NAME, x, y, ...size })))
      selection.select([], '')
  }

  return {
    parts: boxParts,
    pressShape: startDrawing,
    pressText: startTextBox,
    pressImage: startImageBox,
    pressFrame: startFrame,
    drag,
    release,
  }
}

/** A frame's size pushed into the size limits: each side 50 to 8000 px, the short side grown until it is at most 12 times shorter. */
function withinSizeLimits(width: number, height: number) {
  const { minSide, maxSide, maxRatio } = SIZE_LIMITS
  const side = (n: number) => Math.min(maxSide, Math.max(minSide, n))
  const w = side(width)
  const h = side(height)
  if (w > h * maxRatio) return { width: w, height: Math.ceil(w / maxRatio) }
  if (h > w * maxRatio) return { width: Math.ceil(h / maxRatio), height: h }
  return { width: w, height: h }
}
