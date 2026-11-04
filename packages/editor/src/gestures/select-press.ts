// The select tool's press on the stage: what it picks, with Shift adding a layer or taking it out,
// inside the group gone into or on a locked layer; the drag it starts (a handle, a marquee, a move
// or an auto layout reorder); and what a press that never became a drag selects once it ends.
import type { SceneLayer } from '@dazbee/renderer'
import type { Point } from '@dazbee/schema'

import { toWorld } from '../canvas/camera.ts'
import { type Frame, frameAt } from '../canvas/grid.ts'
import type { EditorView } from '../canvas/view.ts'
import type { EditorBoxes } from '../layers/boxes.ts'
import { localTo } from '../layers/transform.ts'
import type { EditorSelection } from '../selection.ts'
import type { EditorTyping } from '../text/typing.ts'
import type { EditorAutoLayoutDrag, ReorderDrag } from './auto-layout-drag.ts'
import { CLICK_SLOP } from './press.ts'
import type { EditorTransformDrag, MarqueeDrag, MoveDrag, ResizeDrag, RotateDrag } from './transform-drag.ts'

/** A drag the select tool's press starts. */
export type SelectDrag = MoveDrag | ResizeDrag | RotateDrag | MarqueeDrag | ReorderDrag

export interface SelectPressDeps {
  canvas: Pick<HTMLCanvasElement, 'setPointerCapture'>
  view: Pick<EditorView, 'camera' | 'frames' | 'frameOf'>
  selection: Pick<EditorSelection, 'current' | 'entered' | 'enter' | 'select' | 'selectKeepingModes' | 'pickPage'>
  boxes: Pick<EditorBoxes, 'selectionBox' | 'lockedSelection' | 'roots' | 'target' | 'lockedAt' | 'insideEntered'>
  typing: Pick<EditorTyping, 'stop'>
  transformDrag: Pick<EditorTransformDrag, 'handleUnder' | 'pressHandle' | 'pressMove'>
  autoLayoutDrag: Pick<EditorAutoLayoutDrag, 'press'>
}

export interface EditorSelectPress {
  /**
   * A press of the select tool at `screen`, on the frame and point `at` and the layer `deepest`
   * there: it selects what it picks and returns the drag it starts, or null when it starts none.
   */
  press(
    e: PointerEvent,
    screen: Point,
    at: { frame: Frame; p: Point } | null,
    deepest: SceneLayer | null,
  ): SelectDrag | null
  /** Whether the pointer at `screen` has gone far enough to drag; once it has, the press no longer clicks. */
  moved(screen: Point): boolean
  /** Ends the press: a press that never became a drag selects what it clicked, and a marquee that stayed a click picks the page. */
  release(gesture: MarqueeDrag | null): void
  /** Forgets the locked layer a press would select, for a press the browser took away. */
  cancel(): void
}

export function editorSelectPress({
  canvas,
  view,
  selection,
  boxes,
  typing,
  transformDrag,
  autoLayoutDrag,
}: SelectPressDeps): EditorSelectPress {
  const { frameOf } = view
  const { target, lockedAt, insideEntered } = boxes
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

  function press(
    e: PointerEvent,
    screen: Point,
    at: { frame: Frame; p: Point } | null,
    deepest: SceneLayer | null,
  ): SelectDrag | null {
    typing.stop()
    clickedAlone = null
    pressedAt = screen
    const grabbed = transformDrag.handleUnder(screen)
    const outer = boxes.selectionBox()
    if (grabbed && outer && selection.current()) {
      return transformDrag.pressHandle(e, screen, grabbed, outer)
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
          return null
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
      return { kind: 'marquee', from, to: from, base, baseFrame }
    } else if (!e.shiftKey) {
      clickedAlone = ''
    }
    const frame = at && frameOf(selection.current()?.frame)
    const around = boxes.selectionBox()?.around ?? []
    if (!at || !frame) return null
    canvas.setPointerCapture(e.pointerId)
    const ids = boxes.roots()
    const reorder = autoLayoutDrag.press(frame, around, at.p, ids)
    if (reorder) {
      return reorder
    }
    return transformDrag.pressMove(frame, around, at.p, ids)
  }
  function moved(screen: Point) {
    // A press that may be a click waits until the pointer has really moved, so a shaking tap still clicks.
    if (clickedAlone !== null && pressedAt && Math.hypot(screen.x - pressedAt.x, screen.y - pressedAt.y) < CLICK_SLOP)
      return false
    clickedAlone = null
    return true
  }
  function release(gesture: MarqueeDrag | null) {
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
  }
  function cancel() {
    lockedClick = null
  }

  return {
    press,
    moved,
    release,
    cancel,
  }
}
