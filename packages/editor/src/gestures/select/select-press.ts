// The select tool's press on the stage: what it picks, with Shift adding a layer or taking it out,
// inside the group gone into or on a locked layer, or the frame whose label it is on; the drag it
// starts (a handle, a marquee, a move, an auto layout reorder or, from a label, a frame's move); and
// what a press that never became a drag selects once it ends, such as the frame whose empty area a
// click was on; and the text selected before a run of clicks, which its double click types into.
import type { SceneLayer } from '@dazbee/renderer'
import type { Point } from '@dazbee/schema'

import { toggled } from '../../across-frames.ts'
import { toWorld } from '../../canvas/camera.ts'
import { type Frame, frameAt } from '../../canvas/frames.ts'
import type { EditorView } from '../../canvas/view.ts'
import type { EditorBoxes } from '../../layers/boxes.ts'
import { localTo } from '../../layers/transform.ts'
import { type EditorSelection, firstFrameOf, type Picked, samePick } from '../../selection.ts'
import type { EditorTyping } from '../../text/typing.ts'
import { CLICK_SLOP } from '../press.ts'
import type { EditorAutoLayoutDrag, ReorderDrag } from './auto-layout-drag.ts'
import type { EditorFrameMove, FrameMoveDrag } from './frame-move.ts'
import type { EditorTransformDrag, MarqueeDrag, MoveDrag, ResizeDrag, RotateDrag } from './transform-drag.ts'

/** A drag the select tool's press starts. */
export type SelectDrag = MoveDrag | ResizeDrag | RotateDrag | MarqueeDrag | ReorderDrag | FrameMoveDrag

export interface SelectPressDeps {
  canvas: Pick<HTMLCanvasElement, 'setPointerCapture'>
  view: Pick<EditorView, 'camera' | 'design' | 'frames' | 'frameOf'>
  selection: Pick<
    EditorSelection,
    'current' | 'entered' | 'enter' | 'select' | 'selectAcross' | 'selectKeepingModes' | 'pickFrame'
  >
  boxes: Pick<
    EditorBoxes,
    'selectionBox' | 'selectionBoxes' | 'lockedSelection' | 'rootsByFrame' | 'target' | 'lockedAt' | 'insideEntered'
  >
  typing: Pick<EditorTyping, 'stop'>
  transformDrag: Pick<EditorTransformDrag, 'handleUnder' | 'pressHandle' | 'pressMove'>
  autoLayoutDrag: Pick<EditorAutoLayoutDrag, 'press'>
  frameMove: Pick<EditorFrameMove, 'start'>
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
  /**
   * A press on a frame's label: it picks the frame, letting the selection and the group gone into
   * go, and returns the drag that moves the frame; null for a frame the shown page lacks.
   */
  pressLabel(e: PointerEvent, screen: Point, frameId: string): FrameMoveDrag | null
  /** Whether the pointer at `screen` has gone far enough to drag; once it has, the press no longer clicks. */
  moved(screen: Point): boolean
  /**
   * Ends the press: a press that never became a drag selects what it clicked; a marquee lets the
   * picked frame go, or picks the frame it was clicked on with Shift and nothing selected.
   */
  release(gesture: MarqueeDrag | null): void
  /** Forgets the locked layer a press would select, for a press the browser took away. */
  cancel(): void
  /** A click on the stage, by a mouse or a finger: the first of a run notes the text selected when its press went down. */
  clicked(e: MouseEvent): void
  /**
   * The text selected alone in a frame when the last run of clicks began, though its first click
   * picked what shows beneath: the run's double click picks it anywhere in its box.
   */
  textBeforeClicks(frameId: string): string | undefined
}

export function editorSelectPress({
  canvas,
  view,
  selection,
  boxes,
  typing,
  transformDrag,
  autoLayoutDrag,
  frameMove,
}: SelectPressDeps): EditorSelectPress {
  const { frameOf } = view
  const { target, lockedAt, insideEntered } = boxes
  /**
   * What a click selects alone when the pointer doesn't move first: one of several selected
   * layers, or a layer pressed inside the selection's box, which a drag moves instead; '' for a
   * press there on nothing, which a click deselects.
   */
  let clickedAlone: string | null = null
  /** The frame the press that may still be a click went down in. */
  let pressedFrame: string | null = null
  /** The locked layer under a press that started a marquee: a click, with no drag, selects it. */
  let lockedClick: (Picked & { shift: boolean }) | null = null
  /** Where a press that may still be a click went down, on screen: it drags only once it has gone CLICK_SLOP from there. */
  let pressedAt: Point | null = null
  /** The text selected alone when the last press went down, and when the last run of clicks began. */
  let pressedText: Picked | null = null
  let runText: Picked | null = null

  function press(
    e: PointerEvent,
    screen: Point,
    at: { frame: Frame; p: Point } | null,
    deepest: SceneLayer | null,
  ): SelectDrag | null {
    pressedText = textSelected()
    typing.stop()
    clickedAlone = null
    pressedAt = screen
    pressedFrame = at?.frame.id ?? null
    const grabbed = transformDrag.handleUnder(screen)
    const handled = boxes.selectionBox()
    if (grabbed && handled && selection.current()) {
      return transformDrag.pressHandle(e, screen, grabbed, handled)
    }
    // The box round the selected layers of the frame pressed in, which a press inside drags.
    const outer = boxes.selectionBoxes().find((b) => b.frame.id === at?.frame.id) ?? null
    const inSelection = (id: string) =>
      Boolean(at && selection.current()?.some((layer) => samePick(layer, { id, frameId: at.frame.id })))
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
      inner.x >= outer.box.x &&
      inner.x <= outer.box.x + outer.box.width &&
      inner.y >= outer.box.y &&
      inner.y <= outer.box.y + outer.box.height
    // A press outside the group or box double-clicked into leaves it.
    if (
      selection.entered() &&
      !inOuter &&
      !(deepest && insideEntered(deepest.id)) &&
      !(locked && insideEntered(locked))
    )
      selection.enter(null)
    const hit = at && deepest && !(locked && !inOuter) ? { id: target(deepest.id, at.frame.id) } : null
    if (at && hit) {
      if (e.shiftKey) {
        // Shift adds a layer to the selection, or a linked copy of a selected one in another frame,
        // or takes it out again.
        const wasIn = inSelection(hit.id)
        selection.selectAcross(toggled(current, { id: hit.id, frameId: at.frame.id }, view.design()))
        if (wasIn) return null
      } else if (inSelection(hit.id)) {
        if ((selection.current()?.length ?? 0) > 1) clickedAlone = hit.id
      } else if (inOuter) {
        clickedAlone = hit.id
      } else {
        selection.select([hit.id], at.frame.id)
      }
      // Inside the selection's box a drag still moves the selection; a click picks the locked layer
      // on top there.
      if (locked && inOuter) clickedAlone = locked
    } else if (!inOuter) {
      // Empty canvas, a frame's empty area, picked or not, or a locked layer: a marquee, adding to
      // the selection with Shift.
      canvas.setPointerCapture(e.pointerId)
      // With Shift, the locked layer a click lands on is added or taken out once the press ends a click.
      const under = at && (locked ?? (e.shiftKey ? lockedAt(at.frame, at.p) : null))
      lockedClick = at && under ? { id: under, frameId: at.frame.id, shift: e.shiftKey } : null
      const from = toWorld(view.camera(), screen)
      const base = e.shiftKey ? (selection.current() ?? []) : []
      // A press on a locked layer keeps the selection until it is a drag, so a click on the one
      // selected leaves it be.
      if (!e.shiftKey && !locked) selection.selectKeepingModes(null)
      if (!(locked && insideEntered(locked))) selection.enter(null)
      return { kind: 'marquee', from, to: from, base }
    } else if (!e.shiftKey) {
      // Inside the selection's box on no layer, a click picks the frame there; on a locked layer that
      // shows through a selected one, as through a round layer's corner, it keeps the selection.
      clickedAlone = locked ? null : ''
    }
    // The frame pressed in is dragged, when it holds selected layers, else the first one's; the
    // selected layers of the other frames go with it.
    const parts = boxes.rootsByFrame()
    const dragged = parts.find((part) => part.frame.id === at?.frame.id) ?? parts[0]
    const frame = at && dragged && frameOf(dragged.frame.id)
    if (!at || !frame || !dragged) return null
    const aroundIn = (frameId: string) => boxes.selectionBoxes().find((b) => b.frame.id === frameId)?.around ?? []
    const around = aroundIn(frame.id)
    canvas.setPointerCapture(e.pointerId)
    const others = parts.filter((part) => part !== dragged)
    const reorder = others.length === 0 ? autoLayoutDrag.press(frame, around, at.p, dragged.ids) : null
    if (reorder) {
      return reorder
    }
    return transformDrag.pressMove(
      frame,
      around,
      at.p,
      dragged.ids,
      others.map((part) => ({ ...part, around: aroundIn(part.frame.id) })),
    )
  }
  function pressLabel(e: PointerEvent, screen: Point, frameId: string) {
    pressedText = textSelected()
    const frame = frameOf(frameId)
    if (!frame) return null
    typing.stop()
    clickedAlone = null
    pressedAt = screen
    selection.enter(null)
    selection.pickFrame(frame.id)
    canvas.setPointerCapture(e.pointerId)
    return frameMove.start(frame, screen, toWorld(view.camera(), screen))
  }
  function moved(screen: Point) {
    // A press that may be a click waits until the pointer has really moved, so a shaking tap still clicks.
    if (clickedAlone !== null && pressedAt && Math.hypot(screen.x - pressedAt.x, screen.y - pressedAt.y) < CLICK_SLOP)
      return false
    clickedAlone = null
    return true
  }
  function release(gesture: MarqueeDrag | null) {
    // A click on a locked layer, not a drag, selects it; a click on a frame's empty area with nothing
    // selected picks the frame, and a marquee dragged, or off every frame, lets the picked frame go.
    const clicked =
      gesture?.kind === 'marquee' &&
      Math.hypot(gesture.to.x - gesture.from.x, gesture.to.y - gesture.from.y) * view.camera().zoom < CLICK_SLOP
    if (clicked && lockedClick?.shift)
      selection.selectAcross(
        toggled(selection.current(), { id: lockedClick.id, frameId: lockedClick.frameId }, view.design()),
      )
    else if (clicked && lockedClick) selection.select([lockedClick.id], lockedClick.frameId)
    else if (gesture?.kind === 'marquee')
      selection.pickFrame(clicked && !selection.current() ? (frameAt(view.frames(), gesture.from)?.id ?? null) : null)
    lockedClick = null
    const current = selection.current()
    if (clickedAlone !== null && current) {
      // A click that picks a layer outside the group gone into, or nothing, leaves it.
      if (selection.entered() && (!clickedAlone || !insideEntered(clickedAlone))) selection.enter(null)
      selection.select(clickedAlone ? [clickedAlone] : [], pressedFrame ?? firstFrameOf(current) ?? null)
      // A click inside the selection's box on no layer picks the frame there.
      if (!clickedAlone && pressedAt)
        selection.pickFrame(frameAt(view.frames(), toWorld(view.camera(), pressedAt))?.id ?? null)
    }
    clickedAlone = null
    pressedAt = null
    pressedFrame = null
  }
  function cancel() {
    lockedClick = null
  }
  function clicked(e: MouseEvent) {
    // Each click uses up what its press noted, so a run whose press went elsewhere notes no older text.
    if (e.detail <= 1) runText = pressedText
    pressedText = null
  }
  function textBeforeClicks(frameId: string) {
    return runText?.frameId === frameId ? runText.id : undefined
  }
  function textSelected(): Picked | null {
    const current = selection.current()
    const only = current?.length === 1 ? current[0] : undefined
    return only && view.design().nodes[only.id]?.type === 'text' ? only : null
  }

  return {
    press,
    pressLabel,
    moved,
    release,
    cancel,
    clicked,
    textBeforeClicks,
  }
}
