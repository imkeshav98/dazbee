// The pointer on the stage: presses, drags, double-clicks and the wheel, each routed to the
// behaviour that owns its gesture, with panning, the hover outline and the cursor.
import type { Session } from '@dazbee/doc'
import { isContainer, type Point } from '@dazbee/schema'

import { type Camera, toWorld } from '../canvas/camera.ts'
import { resizeCursor, ROTATE_CURSOR } from '../canvas/cursors.ts'
import type { Frame } from '../canvas/grid.ts'
import { hitTest } from '../canvas/hit-test.ts'
import type { FrameScenes } from '../canvas/scenes.ts'
import type { EditorView } from '../canvas/view.ts'
import type { EditorBoxes } from '../layers/boxes.ts'
import { type Box, localTo } from '../layers/transform.ts'
import { type EditorSelection, isPath } from '../selection.ts'
import { paragraphAt, wordAt } from '../text/text-edit.ts'
import type { EditorTyping } from '../text/typing.ts'
import type { EditorTools } from '../tools.ts'
import type { EditorAutoLayoutDrag, ReorderDrag } from './auto-layout-drag.ts'
import type { CropDrag, EditorCropping } from './cropping.ts'
import { isDrawTool } from './draw-tools.ts'
import { type EditorDrawing, type ImageBoxDrag, isDrawing, type ShapeDrag, type TextBoxDrag } from './drawing.ts'
import type { EditorPen, PathDrag } from './pen.ts'
import type { EditorSelectPress } from './select-press.ts'
import type { EditorTransformDrag, MarqueeDrag, MoveDrag, ResizeDrag, RotateDrag } from './transform-drag.ts'

/** What a drag on the stage is doing, from pointer down to up. */
export type Gesture =
  | MoveDrag
  | ResizeDrag
  | ReorderDrag
  | RotateDrag
  | MarqueeDrag
  | { kind: 'textSelect'; frame: Frame; around: Box[] }
  | TextBoxDrag
  | ImageBoxDrag
  | CropDrag
  | ShapeDrag
  | PathDrag

export interface PointerDeps {
  canvas: HTMLCanvasElement
  session: Pick<Session, 'design'>
  view: Pick<EditorView, 'camera' | 'design' | 'onStage' | 'pointAt' | 'setCamera' | 'viewport' | 'zoomTo'>
  tools: Pick<EditorTools, 'tool' | 'imageToPlace' | 'snapping'>
  selection: Pick<
    EditorSelection,
    'current' | 'hover' | 'cropping' | 'pathEditing' | 'enter' | 'select' | 'selectKeepingModes' | 'crop' | 'editPath'
  >
  scenes: Pick<FrameScenes, 'scene'>
  boxes: Pick<EditorBoxes, 'pickable' | 'selectionBox' | 'cropTarget' | 'target' | 'lockedAt'>
  typing: Pick<EditorTyping, 'editing' | 'caretFromPoint' | 'caretTo' | 'selectText' | 'start' | 'stop'>
  pen: Pick<EditorPen, 'drawing' | 'down' | 'move' | 'up' | 'pressPoints' | 'dragPoints' | 'releasePoints'>
  cropping: Pick<EditorCropping, 'press' | 'drag' | 'release'>
  drawing: Pick<EditorDrawing, 'pressShape' | 'pressImage' | 'pressText' | 'drag' | 'release'>
  transformDrag: Pick<EditorTransformDrag, 'handleUnder' | 'marquee' | 'drag' | 'release' | 'clearGuides'>
  autoLayoutDrag: Pick<EditorAutoLayoutDrag, 'drag' | 'release'>
  /** What the select tool's press picks, and what it selects once it ends as a click. */
  selectPress: EditorSelectPress
  /** Removes the pointer's listeners once it aborts. */
  signal: AbortSignal
  /** Draws the overlay. */
  drawOverlay: () => void
}

export interface EditorPointer {
  /** The drag on the stage, from its press until it ends, or null. */
  gesture(): Gesture | null
  /** Where the pointer last was over the stage, in client coordinates, or null. */
  pointerAt(): Point | null
  /** Outlines the layer under the pointer, as a move there does; returns whether the hover changed. */
  rehover(): boolean
  /** Shows the cursor for the tool, a pan, or the handle under the pointer. */
  showCursor(): void
  /** Ends the drag on the stage, as a pointerup does. */
  endDrag(): void
  /**
   * Picks what a right-click at `client` (client coordinates) acts on: the selection when the point
   * is on it, else the layer there, selected, locked or not. Returns the selected layers.
   */
  selectAt(client: Point): string[]
  /** Space held pans with a drag. Returns whether the key was the pointer's, so nothing else acts on it. */
  keyDown(e: KeyboardEvent): boolean
  /** Space let go stops the pan it held. */
  keyUp(e: KeyboardEvent): void
  /** The window losing focus lets go of space. */
  blur(): void
}

export function editorPointer({
  canvas,
  session,
  view,
  tools,
  selection,
  scenes,
  boxes,
  typing,
  pen,
  cropping,
  drawing,
  transformDrag,
  autoLayoutDrag,
  selectPress,
  signal,
  drawOverlay,
}: PointerDeps): EditorPointer {
  const { pointAt } = view
  const { target, lockedAt } = boxes
  /** The drag on the stage, from its press until it ends. */
  let gesture: Gesture | null = null
  /** A pan by a drag: where it started on screen, and the camera then. */
  let pan: { from: Point; camera: Camera } | null = null
  /** Whether space is held, which makes a drag pan. */
  let spaceHeld = false
  /** Whether a press on the stage is held, from its pointerdown until it ends. */
  let pressing = false
  /** Where the pointer last was over the stage, so the hover outline follows edits under it. */
  let pointer: MouseEvent | null = null
  /** The cursor the handle under the pointer asks for, shown when the tool and a pan don't ask for another. */
  let hoverCursor = ''
  const on = { signal }

  function currentGesture() {
    return gesture
  }
  // Screen points are CSS pixels from the canvas's corner.
  const screenOf = (e: MouseEvent): Point => view.onStage({ x: e.clientX, y: e.clientY })
  /** The frame under the pointer and the point in its page's design pixels. */
  function pointIn(e: MouseEvent) {
    return pointAt({ x: e.clientX, y: e.clientY })
  }
  const panning = () => tools.tool() === 'hand' || spaceHeld
  /** Where the pointer last was over the stage, in client coordinates, or null. */
  const pointerAt = () => (pointer ? { x: pointer.clientX, y: pointer.clientY } : null)

  const showCursor = () => {
    const tool = tools.tool()
    const drawing = isDrawTool(tool) || tool === 'pen' || (tool === 'image' && tools.imageToPlace())
    canvas.style.cursor = pan
      ? 'grabbing'
      : panning()
        ? 'grab'
        : drawing
          ? 'crosshair'
          : tool === 'text'
            ? 'text'
            : hoverCursor
  }
  function cursorFor(screen: Point) {
    if (gesture?.kind === 'resize' || gesture?.kind === 'rotate') return
    if (selection.cropping()) {
      // Cropping, the image moves under the pointer; the box's handles are gone (#48).
      hoverCursor = 'move'
      showCursor()
      return
    }
    const under = transformDrag.handleUnder(screen)
    const rotation = boxes.selectionBox()?.drawn.rotation ?? 0
    hoverCursor = !under ? '' : under.kind === 'rotate' ? ROTATE_CURSOR : resizeCursor(under.handle, rotation)
    showCursor()
  }
  function rehover() {
    const at = pointer && !gesture && !panning() ? pointIn(pointer) : null
    const hit = at && hitTest(scenes.scene(at.frame).layers, at.p)
    const next = at && hit ? { id: target(hit.id, at.frame.key), frame: at.frame.key } : null
    return selection.hover(next)
  }

  const endDrag = () => {
    pressing = false
    transformDrag.clearGuides()
    if (pen.drawing() && !pan) {
      pen.up()
      return
    }
    if (isDrawing(gesture)) {
      drawing.release(gesture)
      gesture = null
      showCursor()
      drawOverlay()
      return
    }
    if (gesture?.kind === 'textSelect') {
      gesture = null
      return
    }
    if (gesture?.kind === 'reorder') autoLayoutDrag.release(gesture)
    else if (gesture?.kind === 'path') pen.releasePoints(gesture)
    else if (gesture?.kind === 'crop') cropping.release(gesture)
    else if (gesture && gesture.kind !== 'marquee') transformDrag.release(gesture)
    selectPress.release(gesture?.kind === 'marquee' ? gesture : null)
    gesture = null
    pan = null
    showCursor()
    drawOverlay()
  }
  const cancelDrag = () => {
    // A drag the browser took away drops nothing into a flow, and selects no locked layer.
    if (gesture?.kind === 'reorder') gesture.moved = false
    selectPress.cancel()
    endDrag()
  }

  function selectAt(client: Point): string[] {
    const at = pointAt(client)
    if (!at) return []
    const { frame } = at
    const deepest = hitTest(scenes.scene(frame).layers, at.p)
    if (!deepest) return []
    const id = target(deepest.id, frame.key)
    const current = selection.current()
    if (!(current?.frame === frame.key && current.ids.includes(id))) selection.select([id], frame.key)
    return [...(selection.current()?.ids ?? [])]
  }

  function keyDown(e: KeyboardEvent) {
    if (e.code !== 'Space' || e.metaKey || e.ctrlKey) return false
    e.preventDefault()
    if (!spaceHeld) {
      spaceHeld = true
      showCursor()
    }
    return true
  }
  function keyUp(e: KeyboardEvent) {
    if (e.code !== 'Space') return
    spaceHeld = false
    showCursor()
  }
  function blur() {
    spaceHeld = false
    showCursor()
  }

  canvas.addEventListener(
    'pointerdown',
    (e) => {
      pressing = true
      // Middle button, space or the hand tool pan; nothing else does.
      if (e.button === 1 || (e.button === 0 && panning())) {
        e.preventDefault()
        canvas.setPointerCapture(e.pointerId)
        pan = { from: { x: e.clientX, y: e.clientY }, camera: view.camera() }
        showCursor()
        return
      }
      if (e.button !== 0) return
      const screen = screenOf(e)
      const at = pointIn(e)
      const tool = tools.tool()
      if (isDrawTool(tool)) {
        const drag = at && drawing.pressShape(e, tool, at)
        if (drag) gesture = drag
        return
      }
      if (tool === 'image') {
        const imageToPlace = tools.imageToPlace()
        if (at && imageToPlace) gesture = drawing.pressImage(e, at, imageToPlace)
        return
      }
      if (tool === 'pen') {
        if (at) pen.down(e, at)
        return
      }
      if (tool === 'text') {
        if (at) gesture = drawing.pressText(e, at)
        return
      }
      if (selection.pathEditing()) {
        const drag = pen.pressPoints(e, at)
        if (drag) {
          gesture = drag
          drawOverlay()
          return
        }
      }
      if (selection.cropping()) {
        const drag = cropping.press(e, screen)
        if (drag) {
          gesture = drag
          return
        }
      }
      const deepest = at && hitTest(scenes.scene(at.frame).layers, at.p, boxes.pickable)
      const editing = typing.editing()
      if (at && editing && deepest?.id === editing.id && editing.frame === at.frame.key) {
        // In the text being edited (#47): a press puts the caret there, Shift extends the range to
        // it, a drag selects, and a third click selects the paragraph.
        const offset = typing.caretFromPoint(at.p)
        const node = session.design().nodes[editing.id]
        if (e.detail >= 3 && node?.type === 'text') {
          typing.selectText(paragraphAt(node.props.text, offset))
        } else {
          typing.caretTo(offset, e.shiftKey)
          if (e.detail <= 1) {
            canvas.setPointerCapture(e.pointerId)
            gesture = { kind: 'textSelect', frame: at.frame, around: [] }
          }
        }
        drawOverlay()
        return
      }
      gesture = selectPress.press(e, screen, at, deepest)
      if (gesture) drawOverlay()
    },
    on,
  )

  canvas.addEventListener(
    'pointermove',
    (e) => {
      pointer = e
      if (pan) {
        view.setCamera({
          ...pan.camera,
          x: pan.camera.x + e.clientX - pan.from.x,
          y: pan.camera.y + e.clientY - pan.from.y,
        })
        return
      }
      const screen = screenOf(e)
      if (pen.drawing()) {
        pen.move(e, screen)
        return
      }
      if (!gesture) {
        // Hovering: outline the layer under the pointer and show what a press on a handle would do.
        cursorFor(screen)
        if (rehover()) drawOverlay()
        return
      }
      const world = toWorld(view.camera(), screen)
      if (gesture.kind === 'marquee') {
        gesture.to = world
        transformDrag.marquee(gesture)
        drawOverlay()
        return
      }
      if (!selectPress.moved(screen)) return
      const p = localTo({ x: world.x - gesture.frame.x, y: world.y - gesture.frame.y }, gesture.around)
      if (gesture.kind === 'textSelect') {
        typing.caretTo(typing.caretFromPoint(p), true)
        drawOverlay()
        return
      }
      if (isDrawing(gesture)) {
        drawing.drag(gesture, p, e.shiftKey, e.altKey)
        return
      }
      if (gesture.kind === 'path') {
        pen.dragPoints(gesture, p, e.shiftKey, e.altKey)
        return
      }
      if (gesture.kind === 'crop') {
        cropping.drag(gesture, p)
        return
      }
      // Holding Ctrl (⌘ on a Mac) turns snapping off for as long as it is held.
      const snap = tools.snapping() && !(e.ctrlKey || e.metaKey)
      if (gesture.kind === 'reorder') {
        autoLayoutDrag.drag(gesture, p)
        drawOverlay()
        return
      }
      transformDrag.drag(gesture, p, e.shiftKey, e.altKey, snap)
    },
    on,
  )

  canvas.addEventListener('pointerup', endDrag, on)
  canvas.addEventListener('pointercancel', cancelDrag, on)
  // A press whose pointer capture goes without a pointerup or pointercancel, as when another
  // element takes the pointer, ends as a cancelled one does; after either, nothing is held.
  canvas.addEventListener(
    'lostpointercapture',
    () => {
      if (pressing) cancelDrag()
    },
    on,
  )
  canvas.addEventListener(
    'pointerleave',
    () => {
      pointer = null
      if (selection.hover(null)) drawOverlay()
    },
    on,
  )
  canvas.addEventListener(
    'dblclick',
    (e) => {
      if (panning()) return
      const at = pointIn(e)
      const hit = at && hitTest(scenes.scene(at.frame).layers, at.p, boxes.pickable)
      if (!at || !hit || lockedAt(at.frame, at.p)) return
      const editing = typing.editing()
      if (editing && hit.id === editing.id && editing.frame === at.frame.key) {
        // A double click in the text being edited selects the word there (#47).
        const node = session.design().nodes[editing.id]
        if (node?.type === 'text') typing.selectText(wordAt(node.props.text, typing.caretFromPoint(at.p)))
        drawOverlay()
        return
      }
      const picked = target(hit.id, at.frame.key)
      const container = view.design().nodes[picked]
      if (picked !== hit.id && container && isContainer(container.type)) {
        // Into the group, frame or boolean: what is directly inside it under the pointer gets picked.
        typing.stop()
        selection.enter(picked)
        selection.selectKeepingModes(null)
        selection.select([target(hit.id, at.frame.key)], at.frame.key)
        return
      }
      if (boxes.cropTarget(at.frame, hit.id) && !view.design().nodes[hit.id]?.lock?.style) {
        // Into cropping its image fill (#48).
        typing.stop()
        selection.select([hit.id], at.frame.key)
        selection.crop({ id: hit.id, frame: at.frame.key })
        drawOverlay()
        return
      }
      if (isPath(view.design(), hit.id) && !view.design().nodes[hit.id]?.lock?.style) {
        // Into a path's points (#45).
        typing.stop()
        selection.select([hit.id], at.frame.key)
        selection.editPath({ id: hit.id, frame: at.frame.key })
        drawOverlay()
        return
      }
      if (hit.type !== 'text' || view.design().nodes[hit.id]?.lock?.content) return
      typing.stop()
      selection.selectKeepingModes({ ids: [hit.id], frame: at.frame.key })
      typing.start(hit.id, at.frame.key, 0)
      typing.caretTo(typing.caretFromPoint(at.p))
      drawOverlay()
    },
    on,
  )

  // Wheel and trackpad: scrolling pans; pinching (which Chromium sends as ctrl-wheel) and
  // ctrl- or cmd-wheel zoom about the pointer.
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? view.viewport().height : 1
      if (e.ctrlKey || e.metaKey) {
        const delta = Math.max(-30, Math.min(30, e.deltaY * unit))
        view.zoomTo(view.camera().zoom * Math.exp(-delta * 0.01), screenOf(e))
        return
      }
      const sideways = e.shiftKey && e.deltaX === 0
      const dx = (sideways ? e.deltaY : e.deltaX) * unit
      const dy = (sideways ? 0 : e.deltaY) * unit
      const camera = view.camera()
      view.setCamera({ ...camera, x: camera.x - dx, y: camera.y - dy })
    },
    { ...on, passive: false },
  )

  return {
    gesture: currentGesture,
    pointerAt,
    rehover,
    showCursor,
    endDrag,
    selectAt,
    keyDown,
    keyUp,
    blur,
  }
}
