// The pointer on the stage: presses, drags, double-clicks and the wheel, each routed to the
// behaviour that owns its gesture, with panning, the hover outline and the cursor.
import { ancestorsOf, type Session } from '@dazbee/doc'
import { isContainer, type Point } from '@dazbee/schema'

import { type Camera, toWorld } from '../canvas/camera.ts'
import { resizeCursor, ROTATE_CURSOR } from '../canvas/cursors.ts'
import { type Frame, frameAt } from '../canvas/grid.ts'
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
import { CLICK_SLOP } from './press.ts'
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
  session: Session
  view: EditorView
  tools: EditorTools
  selection: EditorSelection
  scenes: FrameScenes
  boxes: EditorBoxes
  typing: EditorTyping
  pen: EditorPen
  cropping: EditorCropping
  drawing: EditorDrawing
  transformDrag: EditorTransformDrag
  autoLayoutDrag: EditorAutoLayoutDrag
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
  signal,
  drawOverlay,
}: PointerDeps): EditorPointer {
  const on = { signal }
  const { frameOf } = view
  let gesture: Gesture | null = null
  /**
   * What a click selects alone when the pointer doesn't move first: one of several selected
   * layers, or a layer pressed inside the selection's box, which a drag moves instead; '' for a
   * press there on nothing, which a click deselects.
   */
  let clickedAlone: string | null = null
  /** The locked layer under a press that started a marquee: a click, with no drag, selects it. */
  let lockedClick: { id: string; frame: string } | null = null
  /** Where a press that may still be a click went down, on screen: it drags only once it has gone CLICK_SLOP from there. */
  let pressedAt: Point | null = null
  let pan: { from: Point; camera: Camera } | null = null
  let spaceHeld = false
  /** Whether a press on the stage is held, from its pointerdown until it ends. */
  let pressing = false
  /** Where the pointer last was over the stage, so the hover outline follows edits under it. */
  let pointer: MouseEvent | null = null
  let hoverCursor = ''

  // Pointer: screen points are CSS pixels from the canvas's corner.
  const { pointAt } = view
  const screenOf = (e: MouseEvent): Point => view.onStage({ x: e.clientX, y: e.clientY })
  /** The frame under the pointer and the point in its page's design pixels. */
  function pointIn(e: MouseEvent) {
    return pointAt({ x: e.clientX, y: e.clientY })
  }
  const panning = () => tools.tool() === 'hand' || spaceHeld
  /** Where the pointer last was over the stage, in client coordinates, or null. */
  const pointerAt = () => (pointer ? { x: pointer.clientX, y: pointer.clientY } : null)

  /**
   * The locked in place layer a press at `p` lands on, the one a click would select: the topmost
   * layer there, as a click picks it, when that one is locked. A click selects it, so its lock can
   * be undone; a drag from it draws a marquee and moves nothing, it or what lies beneath.
   */
  function lockedAt(frame: Frame, p: Point): string | null {
    const top = hitTest(scenes.scene(frame).layers, p)
    const id = top ? target(top.id, frame.key) : null
    return id && view.design().nodes[id]?.lock?.move ? id : null
  }
  /**
   * What a press on a layer picks: a selected layer it is in, so the selection moves whole; inside
   * the group or frame double-clicked into, what is directly in it; or else the layer on the page
   * that holds it, so a click on a group's child picks the group.
   */
  function target(hitId: string, frame: string) {
    const chain = ancestorsOf(view.design(), hitId)
    const current = selection.current()
    const selected = current?.frame === frame ? chain.find((id) => current?.ids.includes(id)) : undefined
    const entered = selection.entered()
    const at = entered ? chain.indexOf(entered) : -1
    return selected ?? (at > 0 ? chain[at - 1] : chain.at(-1)) ?? hitId
  }
  /** Whether a layer is inside the entered group or frame, not the container itself. */
  function insideEntered(id: string) {
    return ancestorsOf(view.design(), view.design().nodes[id]?.parentId ?? '').some((up) => up === selection.entered())
  }

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
    // A click on a locked layer, not a drag, selects it; a click on no layer picks the page under
    // it, and a click off every page or a drag lets the page go.
    const clicked =
      gesture?.kind === 'marquee' &&
      Math.hypot(gesture.to.x - gesture.from.x, gesture.to.y - gesture.from.y) * view.camera().zoom < CLICK_SLOP
    if (clicked && lockedClick) selection.select([lockedClick.id], lockedClick.frame)
    else if (gesture?.kind === 'marquee')
      selection.pickPage(
        clicked && !selection.current() ? (frameAt(view.frames(), gesture.from)?.pageId ?? null) : null,
      )
    lockedClick = null
    const current = selection.current()
    if (clickedAlone !== null && current) {
      // A click that picks a layer outside the group gone into, or nothing, leaves it.
      if (selection.entered() && (!clickedAlone || !insideEntered(clickedAlone))) selection.enter(null)
      selection.select(clickedAlone ? [clickedAlone] : [], current.frame)
      // A click inside the selection's box on no layer picks the page there.
      if (!clickedAlone && pressedAt)
        selection.pickPage(frameAt(view.frames(), toWorld(view.camera(), pressedAt))?.pageId ?? null)
    }
    clickedAlone = null
    pressedAt = null
    gesture = null
    pan = null
    showCursor()
    drawOverlay()
  }
  const cancelDrag = () => {
    // A drag the browser took away drops nothing into a flow, and selects no locked layer.
    if (gesture?.kind === 'reorder') gesture.moved = false
    lockedClick = null
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
      typing.stop()
      clickedAlone = null
      pressedAt = screen
      const grabbed = transformDrag.handleUnder(screen)
      const outer = boxes.selectionBox()
      if (grabbed && outer && selection.current()) {
        gesture = transformDrag.pressHandle(e, screen, grabbed, outer)
        drawOverlay()
        return
      }
      const inSelection = (id: string) =>
        selection.current()?.frame === at?.frame.key && selection.current()?.ids.includes(id)
      const locked = at && !e.shiftKey ? lockedAt(at.frame, at.p) : null
      // Inside the selection's box, a press moves the selection, gaps and layers over it included:
      // a mask, which isn't drawn, or a layer under others, is dragged where it is.
      const inner = at && outer && localTo(at.p, outer.around)
      // A selection that can't move leaves the press to what is under it.
      const current = selection.current()
      const movable = current && !boxes.lockedSelection()
      const inOuter =
        inner &&
        outer &&
        current &&
        movable &&
        current.ids.length > 0 &&
        outer.frame.key === at.frame.key &&
        inner.x >= outer.box.x &&
        inner.x <= outer.box.x + outer.box.width &&
        inner.y >= outer.box.y &&
        inner.y <= outer.box.y + outer.box.height
      // A press outside the group or frame double-clicked into leaves it.
      if (
        selection.entered() &&
        !inOuter &&
        !(deepest && insideEntered(deepest.id)) &&
        !(locked && insideEntered(locked))
      )
        selection.enter(null)
      const hit = at && deepest && !(locked && !inOuter) ? { id: target(deepest.id, at.frame.key) } : null
      if (at && hit) {
        if (e.shiftKey) {
          // Shift adds a layer to the selection, or takes it out again.
          if (inSelection(hit.id) && current) {
            selection.select(
              current.ids.filter((id) => id !== hit.id),
              current.frame,
            )
            return
          }
          selection.select(current?.frame === at.frame.key ? [...current.ids, hit.id] : [hit.id], at.frame.key)
        } else if (inSelection(hit.id)) {
          if ((selection.current()?.ids.length ?? 0) > 1) clickedAlone = hit.id
        } else if (inOuter) {
          clickedAlone = hit.id
        } else {
          selection.select([hit.id], at.frame.key)
        }
        // Inside the selection's box a drag still moves the selection; a click picks the locked layer
        // on top there.
        if (locked && inOuter) clickedAlone = locked
      } else if (!inOuter) {
        // Empty canvas, or a locked layer: a marquee, adding to the selection with shift.
        canvas.setPointerCapture(e.pointerId)
        lockedClick = at && locked ? { id: locked, frame: at.frame.key } : null
        const from = toWorld(view.camera(), screen)
        const base = e.shiftKey ? (selection.current()?.ids ?? []) : []
        const baseFrame = e.shiftKey ? (selection.current()?.frame ?? null) : null
        // A press on a locked layer keeps the selection until it is a drag, so a click on the one
        // selected leaves it be.
        if (!e.shiftKey && !locked) selection.selectKeepingModes(null)
        if (!(locked && insideEntered(locked))) selection.enter(null)
        gesture = { kind: 'marquee', from, to: from, base, baseFrame }
        drawOverlay()
        return
      } else if (!e.shiftKey) {
        clickedAlone = ''
      }
      const frame = at && frameOf(selection.current()?.frame)
      const around = boxes.selectionBox()?.around ?? []
      if (!at || !frame) return
      canvas.setPointerCapture(e.pointerId)
      const ids = boxes.roots()
      const reorder = autoLayoutDrag.press(frame, around, at.p, ids)
      if (reorder) {
        gesture = reorder
        drawOverlay()
        return
      }
      gesture = transformDrag.pressMove(frame, around, at.p, ids)
      drawOverlay()
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
      // A press that may be a click waits until the pointer has really moved, so a shaking tap still clicks.
      if (clickedAlone !== null && pressedAt && Math.hypot(screen.x - pressedAt.x, screen.y - pressedAt.y) < CLICK_SLOP)
        return
      clickedAlone = null
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

  function current() {
    return gesture
  }

  return {
    gesture: current,
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
