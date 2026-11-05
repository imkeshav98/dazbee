// The overlay over the stage: the frame labels, the picked frame, the frame lit from outside the
// stage, the outlines of the group gone into, the hovered layer and the drop target, the dashed
// outlines of the selected layers' linked copies, the selection with its handles and size, what
// each gesture shows, the rulers and the caret, drawn in that order.
import { copiesOf, frameIdOf } from '@dazbee/doc'
import { scaleText } from '@dazbee/renderer'
import type { Rect } from '@dazbee/schema'

import type { EditorCropping } from '../gestures/crop/cropping.ts'
import { type EditorDrawing, isDrawing } from '../gestures/drawing/drawing.ts'
import type { EditorPen } from '../gestures/pen/pen.ts'
import type { EditorPointer } from '../gestures/pointer.ts'
import { HANDLE_SIZE } from '../gestures/press.ts'
import type { EditorAutoLayoutDrag } from '../gestures/select/auto-layout-drag.ts'
import type { EditorTransformDrag } from '../gestures/select/transform-drag.ts'
import type { EditorBoxes } from '../layers/boxes.ts'
import { boundsOf, cornersOf, handleAt, round } from '../layers/transform.ts'
import type { EditorPlace } from '../place.ts'
import type { EditorSelection } from '../selection.ts'
import type { EditorTyping } from '../text/typing.ts'
import { toScreen } from './camera.ts'
import { type Frame, labelBox } from './frames.ts'
import { px, rulerParts } from './rulers.ts'
import type { EditorView } from './view.ts'

export interface OverlayDeps {
  /** The element laid over the canvas that holds what the overlay draws. */
  overlay: HTMLElement
  view: Pick<EditorView, 'camera' | 'viewport' | 'insets' | 'design' | 'inView' | 'frameOf' | 'rulers' | 'outline'>
  selection: Pick<
    EditorSelection,
    | 'current'
    | 'entered'
    | 'hovered'
    | 'pickedFrame'
    | 'litFrame'
    | 'renamingFrame'
    | 'cropping'
    | 'pathEditing'
    | 'tellListeners'
  >
  boxes: Pick<EditorBoxes, 'selectionBox' | 'drawnBoxOf' | 'handlesFor'>
  typing: Pick<EditorTyping, 'editing' | 'parts'>
  pen: Pick<EditorPen, 'parts'>
  cropping: Pick<EditorCropping, 'parts'>
  drawing: Pick<EditorDrawing, 'parts'>
  transformDrag: Pick<EditorTransformDrag, 'parts'>
  autoLayoutDrag: Pick<EditorAutoLayoutDrag, 'parts'>
  place: Pick<EditorPlace, 'dropTarget'>
  pointer: Pick<EditorPointer, 'gesture'>
}

export interface EditorOverlay {
  /** Draws the overlay from what each module shows now, then tells the selection's listeners. */
  draw(): void
  /**
   * Where the selection is drawn on the stage, in pixels from the stage's top start corner: the
   * upright box round it, turned or not, and its size label under or over it. Null with nothing
   * selected.
   */
  selectionRect(): Rect | null
  /** Where a frame of the shown page has its label on the stage, as last drawn; null for one off the stage at its start. */
  labelRect(frameId: string): Rect | null
}

/** Where something spans across the stage, in pixels from its left. */
type Span = { left: number; right: number }

/** Screen pixels a frame's label needs to show the frame's size beside its name. */
const SIZE_LABEL_WIDTH = 120
/** Room the tool dock takes along the bottom of the stage, which the size label stays out of. */
const SIZE_CLEARANCE = 72
/** The room the selection's size label takes, in screen pixels. */
const SIZE_LABEL_HEIGHT = 20
/** Screen pixels the selection's size label keeps inside the stage's sides. */
const SIZE_LABEL_INSET = 8

export function editorOverlay({
  overlay,
  view,
  selection,
  boxes,
  typing,
  pen,
  cropping,
  drawing,
  transformDrag,
  autoLayoutDrag,
  place,
  pointer,
}: OverlayDeps): EditorOverlay {
  const { frameOf, outline } = view

  function selectionRect(): Rect | null {
    const outer = boxes.selectionBox()
    if (!outer) return null
    const { frame, drawn } = outer
    const corners = cornersOf(drawn).map((p) => toScreen(view.camera(), { x: frame.x + p.x, y: frame.y + p.y }))
    const xs = corners.map((c) => c.x)
    const ys = corners.map((c) => c.y)
    if (!typing.editing()) {
      const label = sizeLabelTop(ys)
      ys.push(label, label + SIZE_LABEL_HEIGHT)
    }
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }
  }

  function labelRect(frameId: string) {
    const frame = frameOf(frameId)
    return frame ? labelBox(frame, view.camera()) : null
  }

  function frameLabel(frame: Frame) {
    // The page's rename field stands in the label's place.
    if (selection.renamingFrame() === frame.id) return null
    const label = document.createElement('div')
    label.className = 'frame-label'
    label.dataset.frame = frame.id
    if (
      selection.current()?.frameId === frame.id ||
      typing.editing()?.frameId === frame.id ||
      selection.pickedFrame() === frame.id
    )
      label.dataset.active = ''
    else if (selection.litFrame() === frame.id) label.dataset.lit = ''
    // A frame running off the stage's start keeps its label in view, along the part still showing;
    // a narrow frame keeps its name, cut short, and drops its size; only a frame off the stage has none.
    const box = labelBox(frame, view.camera())
    if (!box) return null
    const { width } = box
    Object.assign(label.style, { left: px(box.x), top: px(box.y), width: px(width) })
    const name = document.createElement('span')
    name.className = 'frame-name'
    name.textContent = frame.name
    label.append(name)
    if (width >= SIZE_LABEL_WIDTH) {
      const size = document.createElement('span')
      size.className = 'frame-size'
      size.textContent = `${frame.width} × ${frame.height}`
      label.append(size)
    }
    return label
  }

  /** Where the size label's top goes for a box spanning `ys` on screen: under it, or over it when the tool dock along the stage's bottom would cover it. */
  function sizeLabelTop(ys: number[]) {
    const below = Math.max(...ys) + 8
    return below + 24 > view.viewport().height - SIZE_CLEARANCE ? Math.min(...ys) - 26 : below
  }

  /** A dashed outline round each linked copy of the selected layers in the frames in view. */
  function linkedParts() {
    const current = selection.current()
    if (!current) return []
    const design = view.design()
    const shown = view.inView()
    const parts: HTMLElement[] = []
    for (const id of current.ids) {
      for (const copy of copiesOf(design, id)) {
        const frameId = frameIdOf(design, copy)
        const frame = shown.find((f) => f.id === frameId)
        const box = frame && boxes.drawnBoxOf(frame, copy, design)
        if (!frame || !box) continue
        const el = outline('linked-copy', frame, box)
        el.dataset.layer = copy
        el.dataset.frame = frame.id
        parts.push(el)
      }
    }
    return parts
  }

  /**
   * Each selected layer's outline, then the box with its handles and the size under it, with the
   * selection's span across the stage, which the size is placed by.
   */
  function selectionParts(): { parts: HTMLElement[]; size: { el: HTMLElement; span: Span } | null } {
    const gesture = pointer.gesture()
    const outer = boxes.selectionBox()
    const current = selection.current()
    if (!outer || !current) return { parts: [], size: null }
    const { frame, drawn: box } = outer
    const parts: HTMLElement[] = []
    const several = current.ids.length > 1
    if (several) {
      for (const id of current.ids) {
        const b = boxes.drawnBoxOf(frame, id, view.design())
        if (!b) continue
        const member = outline('selection-member', frame, b)
        member.dataset.layer = id
        parts.push(member)
      }
    }
    const el = outline('selection', frame, box)
    el.dataset.frame = frame.id
    el.dataset.count = String(current.ids.length)
    if (!several) el.dataset.layer = current.ids[0]
    // Handles only once the box is big enough on screen to grab them apart, and not on a locked one.
    if (!typing.editing() && Math.min(box.width, box.height) * view.camera().zoom >= 2 * HANDLE_SIZE) {
      for (const h of boxes.handlesFor()) {
        const handle = document.createElement('div')
        handle.className = 'handle'
        handle.dataset.handle = h
        const at = handleAt(h)
        Object.assign(handle.style, { left: `${at.x * 100}%`, top: `${at.y * 100}%` })
        el.append(handle)
      }
    }
    parts.push(el)
    if (typing.editing()) return { parts, size: null }
    const corners = cornersOf(box).map((p) => toScreen(view.camera(), { x: frame.x + p.x, y: frame.y + p.y }))
    const size = document.createElement('div')
    size.className = 'selection-size'
    size.textContent = `${round(box.width, 0)} × ${round(box.height, 0)}`
    // A corner scaling one text says its size too, from where it was.
    const g = gesture?.kind === 'resize' ? gesture : null
    const text = g && !several ? g.texts.get(current.ids[0] ?? '') : undefined
    if (g && text) size.textContent += ` · ${text.style.fontSize} → ${scaleText(text, g.factor).style.fontSize}`
    size.style.top = px(sizeLabelTop(corners.map((c) => c.y)))
    parts.push(size)
    const xs = corners.map((c) => c.x)
    return { parts, size: { el: size, span: { left: Math.min(...xs), right: Math.max(...xs) } } }
  }

  /**
   * Puts the size label centred under the selection's span across the stage, kept SIZE_LABEL_INSET
   * inside the stage's sides and clear of the chrome along them, at the left when there is no room
   * for both. A selection wholly off the stage takes it off the stage with it. Measured once it is
   * drawn.
   */
  function placeSizeLabel(size: HTMLElement, span: Span) {
    const width = size.offsetWidth
    const room = view.viewport().width
    const chrome = view.insets()
    const centred = (span.left + span.right) / 2 - width / 2
    const low = Math.max(SIZE_LABEL_INSET, chrome.left)
    const high = room - Math.max(SIZE_LABEL_INSET, chrome.right) - width
    const off = span.right <= 0 || span.left >= room
    size.style.left = px(off ? centred : Math.max(low, Math.min(centred, high)))
  }

  function drawOverlay() {
    const gesture = pointer.gesture()
    const parts: Element[] = []
    for (const frame of view.inView()) {
      const label = frameLabel(frame)
      if (label) parts.push(label)
    }
    const picked = view.inView().find((frame) => frame.id === selection.pickedFrame())
    if (picked) {
      const el = outline('frame-picked', picked, {
        x: 0,
        y: 0,
        width: picked.width,
        height: picked.height,
        rotation: 0,
      })
      el.dataset.frame = picked.id
      parts.push(el)
    }
    // Lit as a layer under the pointer is, round the whole frame.
    const lit = view.inView().find((frame) => frame.id === selection.litFrame())
    if (lit) {
      const el = outline('frame-lit', lit, { x: 0, y: 0, width: lit.width, height: lit.height, rotation: 0 })
      el.dataset.frame = lit.id
      parts.push(el)
    }
    const entered = selection.entered()
    const enteredFrame = entered && frameOf(selection.current()?.frameId)
    const enteredBox = enteredFrame && entered && boxes.drawnBoxOf(enteredFrame, entered, view.design())
    if (enteredFrame && enteredBox) parts.push(outline('entered', enteredFrame, enteredBox))
    const hovered = selection.hovered()
    const hover = !gesture && hovered && !selection.current()?.ids.includes(hovered.id) ? hovered : null
    const hoverFrame = hover && frameOf(hover.frameId)
    const hoverBox = hoverFrame && hover && boxes.drawnBoxOf(hoverFrame, hover.id, view.design())
    if (hoverFrame && hoverBox) parts.push(outline('hover', hoverFrame, hoverBox))
    // The layer an image dragged over the stage would go into.
    const dropTarget = place.dropTarget()
    const dropFrame = dropTarget && frameOf(dropTarget.frameId)
    const dropBox = dropFrame && dropTarget && boxes.drawnBoxOf(dropFrame, dropTarget.id, view.design())
    if (dropFrame && dropBox) parts.push(outline('drop-target', dropFrame, dropBox))
    const selected = selection.pathEditing() || selection.cropping() ? null : selectionParts()
    parts.push(
      ...linkedParts(),
      ...(selected?.parts ?? []),
      ...pen.parts(),
      ...cropping.parts(),
      ...autoLayoutDrag.parts(gesture?.kind === 'reorder' ? gesture : null),
    )
    if (isDrawing(gesture)) parts.push(...drawing.parts(gesture))
    parts.push(...transformDrag.parts(gesture?.kind === 'marquee' ? gesture : null))
    if (view.rulers()) {
      const origin = frameOf(selection.current()?.frameId) ?? frameOf(selection.hovered()?.frameId) ?? view.inView()[0]
      const outer = boxes.selectionBox()
      if (origin)
        parts.push(
          ...rulerParts(
            view.camera(),
            view.viewport(),
            origin,
            outer && outer.frame.id === origin.id ? boundsOf([outer.drawn]) : null,
          ),
        )
    }
    parts.push(...typing.parts())
    overlay.replaceChildren(...parts)
    if (selected?.size) placeSizeLabel(selected.size.el, selected.size.span)
    selection.tellListeners()
  }

  return {
    draw: drawOverlay,
    selectionRect,
    labelRect,
  }
}
