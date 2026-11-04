// Drawing new layers with a tool: a shape or frame dragged out, a text box and an image box, and
// the box being dragged as the overlay shows it.
import { childrenOf, type Session } from '@dazbee/doc'
import { canHold, type Design, type Point, type Rect } from '@dazbee/schema'

import type { Camera } from '../canvas/camera.ts'
import { type Frame, scope } from '../canvas/grid.ts'
import { laidOut } from '../layers/auto-layout.ts'
import type { EditorBoxes } from '../layers/boxes.ts'
import { boundsOf, type Box, localTo, round } from '../layers/transform.ts'
import { runQuietly } from '../run-quietly.ts'
import type { EditorSelection } from '../selection.ts'
import type { EditorTyping } from '../text/typing.ts'
import type { EditorTools, PlacedAsset } from '../tools.ts'
import { clickedBox, drawnBox, type DrawTool, imageIn, keepRatio, newDrawn, newImage, newText } from './draw-tools.ts'
import { CLICK_SLOP } from './press.ts'

/** A shape or frame being drawn, from the press until it ends: the new layer and every change the drag makes to it are one undo step. */
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

/** A drag that draws a new layer. */
export type DrawingDrag = ShapeDrag | TextBoxDrag | ImageBoxDrag

/** Whether a gesture is one that draws a new layer. */
export const isDrawing = (g: { kind: string } | null): g is DrawingDrag =>
  g?.kind === 'draw' || g?.kind === 'textBox' || g?.kind === 'imageBox'

export interface DrawingDeps {
  canvas: HTMLCanvasElement
  session: Session
  selection: Pick<EditorSelection, 'select'>
  tools: Pick<EditorTools, 'setTool'>
  typing: Pick<EditorTyping, 'stop' | 'start'>
  boxes: Pick<EditorBoxes, 'boxIn' | 'containersOf' | 'parentFor'>
  camera: () => Camera
  /** The design as last drawn. */
  drawn: () => Design
  /** Groups fit what they hold again after a change inside them, in the same undo step. */
  hug: (ids: string[]) => void
  /** Puts an overlay element over a box in a frame, in design pixels. */
  placeBox: (el: HTMLElement, frame: Frame, box: Rect) => void
  /** Draws the overlay. */
  drawOverlay: () => void
}

export interface EditorDrawing {
  /** The box a text or image box drag is drawing, as the overlay shows it; nothing for a shape. */
  parts(g: DrawingDrag): HTMLElement[]
  /**
   * A press with a shape or frame tool: the new layer, in the group or frame gone into when it can
   * hold it, and a drag that sizes it, one undo step until it is released. Null when it can't be made.
   */
  pressShape(e: PointerEvent, shape: DrawTool, at: { frame: Frame; p: Point }): ShapeDrag | null
  /** A press with the text tool: a drag of the box the text will have, or a click for text that grows with its words. */
  pressText(e: PointerEvent, at: { frame: Frame; p: Point }): TextBoxDrag
  /** A press with the image tool and its image: a drag of the box the image will cover, or a click for its own size. */
  pressImage(e: PointerEvent, at: { frame: Frame; p: Point }, asset: PlacedAsset): ImageBoxDrag
  /** Follows the pointer: a shape grows to it; a box's corner goes to it, Shift keeping an image's shape. */
  drag(g: DrawingDrag, p: Point, shift: boolean, alt: boolean): void
  /**
   * Ends a drawing gesture, its layer selected and the select tool back. A shape's undo step
   * closes; a text box's layer is made and typed into, one undo step until typing stops; an
   * image box's layer is made, one undo step.
   */
  release(g: DrawingDrag): void
}

export function editorDrawing({
  canvas,
  session,
  selection,
  tools,
  typing,
  boxes: { boxIn, containersOf, parentFor },
  camera,
  drawn,
  hug,
  placeBox,
  drawOverlay,
}: DrawingDeps): EditorDrawing {
  /**
   * Where a box a tool drags out starts: in the group or frame double-clicked into if it can hold
   * a layer of `type`, otherwise on the page, at the press as layers there see it.
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
  /** The box the text tool (#47) or the image tool is drawing, drawn as a marquee is; nothing for a shape, which draws itself. */
  function boxParts(gesture: DrawingDrag) {
    if (gesture.kind === 'draw') return []
    const box = document.createElement('div')
    box.className = 'marquee'
    box.dataset[gesture.kind] = ''
    placeBox(box, gesture.frame, {
      x: Math.min(gesture.from.x, gesture.to.x),
      y: Math.min(gesture.from.y, gesture.to.y),
      width: Math.abs(gesture.to.x - gesture.from.x),
      height: Math.abs(gesture.to.y - gesture.from.y),
    })
    return [box]
  }

  /**
   * Starts drawing a shape (#44) or a frame where the pointer went down: inside the group, frame or
   * boolean double-clicked into if the press is in it and it can hold it, otherwise on the page.
   * The new layer and every change the drag makes to it are one undo step.
   */
  function startDrawing(e: PointerEvent, shape: DrawTool, at: { frame: Frame; p: Point }): ShapeDrag | null {
    typing.stop()
    const now = session.design()
    const parentId = parentFor(at.frame, shape === 'frame' ? 'frame' : 'graphic', now)
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
    runQuietly(() => session.run('node.update', { ids: [id], patch: drawnBox(shape, from, from, false, false) }))
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
   * (at most half the format's), centred there; a drag places it covering the box dragged, which
   * Shift keeps to the image's shape. In the group or frame double-clicked into if it can hold it.
   */
  function startImageBox(e: PointerEvent, at: { frame: Frame; p: Point }, asset: PlacedAsset): ImageBoxDrag {
    typing.stop()
    canvas.setPointerCapture(e.pointerId)
    return { kind: 'imageBox', ...boxStart(at, 'graphic'), asset }
  }
  /** Follows the pointer: a shape grows to it, Shift and Alt as `drawnBox` takes them; a box's corner goes to it, Shift keeping an image's shape. */
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
    runQuietly(() => session.run('node.update', { ids: [g.id], patch: drawnBox(g.tool, g.from, p, shift, alt) }))
  }
  /** Ends a drawing gesture: makes or finishes its layer, which is selected, and the select tool comes back. */
  function release(g: DrawingDrag) {
    if (g.kind === 'draw') finishDrawing(g)
    else if (g.kind === 'textBox') finishTextBox(g)
    else finishImageBox(g)
  }
  /**
   * A click draws the shape at its usual size; either way the new shape is selected and the select
   * tool comes back. A frame dragged around layers beside it takes them in, in the same undo step.
   */
  function finishDrawing(g: ShapeDrag) {
    if (!g.moved) runQuietly(() => session.run('node.update', { ids: [g.id], patch: clickedBox(g.tool, g.from) }))
    if (g.tool === 'frame' && g.moved) enclose(g.frame, g.id)
    hug([g.id])
    g.end()
    selection.select([g.id], g.frame.key)
    tools.setTool('select')
  }
  /**
   * Moves the layers beside a new frame that lie wholly inside it, as drawn in this frame, into it.
   * Layers locked in place stay where they are, and so does everything in an auto layout frame,
   * where the layout, not the drag, places the new frame.
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
      return fits && canHold('frame', now.nodes[child]?.type ?? '') ? [child] : []
    })
    if (inside.length > 0) runQuietly(() => session.run('node.enclose', { id, ids: inside, scope: scope(frame) }))
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
    const format = drawn().formats[g.frame.formatId] ?? g.frame
    const layer = box
      ? imageIn(g.asset, {
          x: round(box.x),
          y: round(box.y),
          width: Math.max(1, round(box.width)),
          height: Math.max(1, round(box.height)),
        })
      : newImage(g.asset, g.from, format)
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

  return {
    parts: boxParts,
    pressShape: startDrawing,
    pressText: startTextBox,
    pressImage: startImageBox,
    drag,
    release,
  }
}
