// The pen: a path drawn a press at a time until it closes or is finished, and a path's points
// edited, with the outline, anchors and handles the overlay draws for both.
import type { Session } from '@dazbee/doc'
import type { Design, Point } from '@dazbee/schema'

import { type Camera, toScreen, toWorld } from '../canvas/camera.ts'
import { type Frame, scope } from '../canvas/grid.ts'
import { px } from '../canvas/rulers.ts'
import type { EditorBoxes } from '../layers/boxes.ts'
import { type Box, localTo, pageFrom, round } from '../layers/transform.ts'
import { runQuietly } from '../run-quietly.ts'
import type { EditorSelection } from '../selection.ts'
import type { EditorTyping } from '../text/typing.ts'
import type { EditorTools } from '../tools.ts'
import { newPath } from './draw-tools.ts'
import {
  type Anchor,
  anchorOf,
  type AnchorRef,
  constrain,
  deleteAnchors,
  formatPath,
  hitPath,
  isSmooth,
  moveAnchors,
  moveControl,
  pathBounds,
  type PenPath,
  sameRef,
  segmentsOf,
  type Side,
  splitSegment,
} from './path.ts'
import { CLICK_SLOP } from './press.ts'

/** A path layer being drawn or edited: the box it had when that began, which its points are relative to, and how far the box has moved since. */
export interface Reshaping {
  id: string
  start: Box
  applied: Point
  scope: string
}
/** A drag of a path's anchors or of one handle, from the press on it until it ends: one undo step. */
export interface PathDrag {
  kind: 'path'
  frame: Frame
  around: Box[]
  layer: Reshaping
  path: PenPath
  grab: Point
  moved: boolean
  roots: string[]
  end: () => void
  drag: { anchors: AnchorRef[] } | { ref: AnchorRef; side: Side; from: Point; mirror: boolean }
}

export interface PenDeps {
  canvas: HTMLCanvasElement
  session: Session
  selection: Pick<EditorSelection, 'pathEditing' | 'editPath' | 'pickAnchors' | 'select' | 'selectKeepingModes'>
  tools: Pick<EditorTools, 'setTool'>
  typing: Pick<EditorTyping, 'stop'>
  camera: () => Camera
  /** The design as last drawn. */
  drawn: () => Design
  /** The frame of the grid as last drawn with a key, if there is one. */
  frameOf: (key: string | undefined) => Frame | undefined
  boxes: Pick<EditorBoxes, 'containersOf' | 'pathIn' | 'parentFor'>
  /** Groups fit what they hold again after a change inside them, in the same undo step. */
  hug: (ids: string[]) => void
  /** Draws the overlay. */
  drawOverlay: () => void
}

export interface EditorPen {
  /** Whether the pen is drawing a path: from its first press until the path closes or is finished. */
  drawing(): boolean
  /**
   * A press with the pen: a click adds a corner, a drag pulls out smooth handles, Shift turns the
   * new segment to 45°, and a press on the first anchor closes the path. The first press starts
   * one undo step that lasts until the path is closed or finished.
   */
  down(e: PointerEvent, at: { frame: Frame; p: Point }): void
  /** The pointer moving while the pen draws, at a point on the stage: pulls handles, or shows the next segment. */
  move(e: PointerEvent, screen: Point): void
  /** The press is over: a closing one finishes the path. */
  up(): void
  /** Ends the pen's path, closed or open: the new layer is selected and the select tool comes back. */
  finish(): void
  /**
   * A press while a path's points are being edited: on a handle of a selected anchor, a drag of
   * it; on an anchor, a drag of the selected ones, Shift adding it or taking it away; on a
   * segment, a new anchor there and a drag of it. Each starts an undo step that lasts until the
   * drag is released. Anywhere else leaves the path's points and returns null, so the press does
   * what it would have done.
   */
  pressPoints(e: PointerEvent, at: { frame: Frame; p: Point } | null): PathDrag | null
  /** Drags anchors (Shift along one axis) or a handle (Shift in 45° steps; Alt lets a smooth anchor's other handle be). */
  dragPoints(g: PathDrag, p: Point, shift: boolean, alt: boolean): void
  /** Ends a drag of a path's points, closing its undo step; the groups around the path fit it again. */
  releasePoints(g: PathDrag): void
  /** Takes the selected anchors out of the path being edited, or the layer once none would be left. One undo step. */
  deletePoints(): boolean
  /** The path the pen is drawing, or whose points are being edited, as the overlay shows it. */
  parts(): Element[]
}

/**
 * The path the pen is drawing (#45), from its first click until it closes or is finished: its
 * anchors in its parent's coordinates, the one a drag is pulling handles from, and the layer
 * once there are two anchors to draw.
 */
interface OpenPath {
  frame: Frame
  around: Box[]
  parentId: string
  anchors: Anchor[]
  closing: boolean
  dragging: number | null
  from: Point
  moved: boolean
  hover: Point | null
  layer: Reshaping | null
  end: () => void
}

/** How near, in screen pixels, a press picks a path's point, handle or segment (#45). */
const POINT_REACH = 6
/** The SVG namespace, for the outline of a path being drawn or edited. */
const SVG = 'http://www.w3.org/2000/svg'

export function editorPen({
  canvas,
  session,
  selection,
  tools,
  typing,
  camera,
  drawn,
  frameOf,
  boxes: { containersOf, pathIn, parentFor },
  hug,
  drawOverlay,
}: PenDeps): EditorPen {
  /** The path the pen is drawing, or null. */
  let pen: OpenPath | null = null

  /** Whether the pen is drawing a path. */
  function drawing() {
    return pen !== null
  }
  /**
   * The path the pen is drawing or whose points are being edited (#45): its outline, its anchors,
   * the handles of the anchors in play, and, for the pen, the next segment to where the pointer is.
   */
  function pathParts(): Element[] {
    const pathEditing = selection.pathEditing()
    let frame: Frame | undefined
    let path: PenPath
    let around: Box[]
    let shown: AnchorRef[]
    let preview: [Anchor, Point] | null = null
    if (pen) {
      frame = pen.frame
      path = [{ anchors: pen.anchors, closed: pen.closing }]
      around = pen.around
      const last = pen.anchors.length - 1
      shown = [{ contour: 0, index: pen.dragging ?? last }]
      const from = pen.anchors[last]
      if (from && pen.hover && pen.dragging === null) preview = [from, pen.hover]
    } else if (pathEditing) {
      frame = frameOf(pathEditing.frame)
      const found = frame && pathIn(frame, pathEditing.id, drawn())
      if (!found) return []
      ;({ path, around } = found)
      shown = pathEditing.selected
    } else {
      return []
    }
    if (!frame) return []
    const f = frame
    const at = (q: Point) => {
      const p = pageFrom(q, around)
      return toScreen(camera(), { x: f.x + p.x, y: f.y + p.y })
    }
    const xy = (q: Point) => {
      const p = at(q)
      return `${round(p.x)} ${round(p.y)}`
    }
    const svg = document.createElementNS(SVG, 'svg')
    svg.setAttribute('class', 'path-edit')
    const line = (className: string, d: string) => {
      const el = document.createElementNS(SVG, 'path')
      el.setAttribute('class', className)
      el.setAttribute('d', d)
      svg.append(el)
    }
    const outline: string[] = []
    for (const contour of path) {
      const [first] = contour.anchors
      if (!first) continue
      outline.push(`M${xy(first)}`)
      for (const [from, to] of segmentsOf(contour)) {
        const a = contour.anchors[from] as Anchor
        const b = contour.anchors[to] as Anchor
        outline.push(`C${xy(a.out ?? a)} ${xy(b.in ?? b)} ${xy(b)}`)
      }
    }
    line('path-outline', outline.join(' '))
    if (preview) {
      const [from, to] = preview
      line('pen-preview', `M${xy(from)} C${xy(from.out ?? from)} ${xy(to)} ${xy(to)}`)
    }
    const dots: HTMLElement[] = []
    const dot = (className: string, q: Point, data: Record<string, string>) => {
      const el = document.createElement('div')
      el.className = className
      const p = at(q)
      Object.assign(el.style, { left: px(p.x), top: px(p.y) })
      Object.assign(el.dataset, data)
      dots.push(el)
    }
    for (const ref of shown) {
      const anchor = anchorOf(path, ref)
      for (const side of ['in', 'out'] as const) {
        const h = anchor?.[side]
        if (!anchor || !h) continue
        line('path-handle-line', `M${xy(anchor)} L${xy(h)}`)
        dot('path-control', h, { control: `${ref.contour}:${ref.index}:${side}` })
      }
    }
    path.forEach((contour, c) =>
      contour.anchors.forEach((a, i) => {
        const data: Record<string, string> = { anchor: `${c}:${i}` }
        if (shown.some((r) => sameRef(r, { contour: c, index: i })) && pathEditing) data.selected = ''
        // The pen's first anchor shows when a click on it would close the path.
        if (
          pen &&
          i === 0 &&
          pen.anchors.length >= 2 &&
          pen.hover &&
          Math.hypot(pen.hover.x - a.x, pen.hover.y - a.y) * camera().zoom <= POINT_REACH
        )
          data.closing = ''
        dot('path-anchor', a, data)
      }),
    )
    return [svg, ...dots]
  }

  /**
   * Writes a path drawn or edited in the coordinates its layer had when that began (#45): the data
   * from the outline's corner, and the box moved by what the corner moved since the last write.
   */
  function reshape(layer: Reshaping, path: PenPath) {
    const b = pathBounds(path)
    if (!b) return
    const corner = { x: round(b.x), y: round(b.y) }
    const moved = { x: round(corner.x - layer.start.x), y: round(corner.y - layer.start.y) }
    const input = {
      id: layer.id,
      scope: layer.scope,
      d: formatPath(path, corner),
      dx: round(moved.x - layer.applied.x),
      dy: round(moved.y - layer.applied.y),
      width: round(b.width),
      height: round(b.height),
    }
    if (runQuietly(() => session.run('node.reshape', input))) layer.applied = moved
  }
  /**
   * A press while a path's points are being edited (#45): on a handle of a selected anchor, drag
   * it; on an anchor, select it (Shift adds or takes it away) and drag the selected ones; on a
   * segment, add an anchor there and drag it, all one undo step. Anywhere else leaves the path,
   * and the press does what it would have done. Returns the drag the press starts.
   */
  function startPathEdit(e: PointerEvent, at: { frame: Frame; p: Point } | null): PathDrag | null {
    const editingPath = selection.pathEditing()
    const frame = editingPath && frameOf(editingPath.frame)
    const found = frame && editingPath && pathIn(frame, editingPath.id)
    const q = found && at?.frame.key === frame.key ? localTo(at.p, found.around) : null
    const hit = found && q && hitPath(found.path, q, POINT_REACH / camera().zoom, editingPath.selected)
    if (!editingPath || !frame || !found || !q || !hit) {
      selection.editPath(null)
      drawOverlay()
      return null
    }
    let path = found.path
    const layer: Reshaping = { id: editingPath.id, start: found.box, applied: { x: 0, y: 0 }, scope: scope(frame) }
    const end = session.beginGesture()
    let drag: PathDrag['drag']
    if (hit.kind === 'control') {
      drag = {
        ref: hit.ref,
        side: hit.side,
        from: anchorOf(path, hit.ref)?.[hit.side] ?? q,
        mirror: isSmooth(anchorOf(path, hit.ref) as Anchor),
      }
    } else if (hit.kind === 'anchor') {
      const picked = editingPath.selected.some((r) => sameRef(r, hit.ref))
      if (e.shiftKey)
        selection.pickAnchors(
          picked ? editingPath.selected.filter((r) => !sameRef(r, hit.ref)) : [...editingPath.selected, hit.ref],
        )
      else if (!picked) selection.pickAnchors([hit.ref])
      drag = { anchors: editingPath.selected }
    } else {
      const split = splitSegment(path, hit.contour, hit.from, hit.t)
      path = split.path
      reshape(layer, path)
      selection.pickAnchors([split.ref])
      drag = { anchors: [split.ref] }
    }
    canvas.setPointerCapture(e.pointerId)
    return {
      kind: 'path',
      frame,
      around: found.around,
      layer,
      path,
      grab: q,
      moved: false,
      roots: [editingPath.id],
      end,
      drag,
    }
  }
  /** Drags anchors (Shift along one axis) or a handle (Shift in 45° steps; Alt lets a smooth anchor's other handle be). */
  function pathTo(g: PathDrag, p: Point, shift: boolean, alt: boolean) {
    if (!g.moved && Math.hypot(p.x - g.grab.x, p.y - g.grab.y) * camera().zoom < CLICK_SLOP) return
    g.moved = true
    let dx = p.x - g.grab.x
    let dy = p.y - g.grab.y
    if ('anchors' in g.drag) {
      if (shift) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }
      reshape(g.layer, moveAnchors(g.path, g.drag.anchors, round(dx), round(dy)))
      return
    }
    const anchor = anchorOf(g.path, g.drag.ref)
    if (!anchor) return
    const to = { x: g.drag.from.x + dx, y: g.drag.from.y + dy }
    const placed = shift ? constrain(anchor, to) : to
    reshape(
      g.layer,
      moveControl(g.path, g.drag.ref, g.drag.side, { x: round(placed.x), y: round(placed.y) }, g.drag.mirror && !alt),
    )
  }
  /** Ends a drag of a path's points: the groups around it fit it again, and its undo step closes. */
  function releasePoints(g: PathDrag) {
    hug(g.roots)
    g.end()
  }
  /** Takes the selected anchors out of the path being edited, or the layer once none would be left. One undo step. */
  function deletePoints() {
    const editingPath = selection.pathEditing()
    const frame = editingPath && frameOf(editingPath.frame)
    const found = frame && editingPath && pathIn(frame, editingPath.id)
    if (!editingPath || !found || editingPath.selected.length === 0) return false
    const next = deleteAnchors(found.path, editingPath.selected)
    const parent = session.design().nodes[editingPath.id]?.parentId ?? ''
    session.gesture(() => {
      if (next.length === 0) runQuietly(() => session.run('node.delete', { ids: [editingPath.id] }))
      else reshape({ id: editingPath.id, start: found.box, applied: { x: 0, y: 0 }, scope: scope(frame) }, next)
      hug(session.design().nodes[parent] ? [parent] : next.length > 0 ? [editingPath.id] : [])
    })
    selection.pickAnchors([])
    return true
  }

  /**
   * A press with the pen (#45): a click adds a corner, a drag pulls out smooth handles, Shift turns
   * the new segment to 45°, and a press on the first anchor closes the path. The first press
   * starts one undo step that lasts until the path is closed or finished; the layer appears with
   * the second anchor, inside the group, frame or boolean double-clicked into if it can hold it.
   */
  function penDown(e: PointerEvent, at: { frame: Frame; p: Point }) {
    typing.stop()
    if (pen && pen.frame.key !== at.frame.key) finishPen()
    if (!pen) {
      const now = session.design()
      const parentId = parentFor(at.frame, 'graphic', now)
      const around = containersOf(at.frame, parentId, now)
      pen = {
        frame: at.frame,
        around,
        parentId,
        anchors: [],
        closing: false,
        dragging: null,
        from: at.p,
        moved: false,
        hover: null,
        layer: null,
        end: session.beginGesture(),
      }
      selection.selectKeepingModes(null)
    }
    canvas.setPointerCapture(e.pointerId)
    const p = localTo(at.p, pen.around)
    const first = pen.anchors[0]
    const last = pen.anchors.at(-1)
    pen.from = p
    pen.moved = false
    if (first && pen.anchors.length >= 2 && Math.hypot(p.x - first.x, p.y - first.y) * camera().zoom <= POINT_REACH) {
      pen.closing = true
      pen.dragging = 0
    } else {
      const placed = e.shiftKey && last ? constrain(last, p) : p
      pen.anchors.push({ x: round(placed.x), y: round(placed.y) })
      pen.dragging = pen.anchors.length - 1
    }
    writePen()
    drawOverlay()
  }
  /** Pulls the handles out of the anchor just placed (Shift in 45° steps, Alt only the one ahead), or shows the next segment to the pointer. */
  function penMove(e: PointerEvent, screen: Point) {
    if (!pen) return
    const world = toWorld(camera(), screen)
    const p = localTo({ x: world.x - pen.frame.x, y: world.y - pen.frame.y }, pen.around)
    const anchor = pen.dragging === null ? undefined : pen.anchors[pen.dragging]
    if (!anchor) {
      pen.hover = e.shiftKey && pen.anchors.at(-1) ? constrain(pen.anchors.at(-1) as Anchor, p) : p
      drawOverlay()
      return
    }
    if (!pen.moved && Math.hypot(p.x - pen.from.x, p.y - pen.from.y) * camera().zoom < CLICK_SLOP) return
    pen.moved = true
    const out = e.shiftKey ? constrain(anchor, p) : p
    anchor.out = { x: round(out.x), y: round(out.y) }
    if (!e.altKey) anchor.in = { x: round(2 * anchor.x - out.x), y: round(2 * anchor.y - out.y) }
    writePen()
    drawOverlay()
  }
  /** The press is over: a closing one finishes the path. */
  function penUp() {
    if (!pen) return
    pen.dragging = null
    if (pen.closing) finishPen()
    else drawOverlay()
  }
  /** Writes the pen's path to its layer, making the layer at the second anchor. */
  function writePen() {
    if (!pen || pen.anchors.length < 2) return
    const path: PenPath = [{ anchors: pen.anchors, closed: pen.closing }]
    if (pen.layer) {
      reshape(pen.layer, path)
      return
    }
    const b = pathBounds(path)
    if (!b) return
    const box = { x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height), rotation: 0 }
    const { parentId } = pen
    let id = ''
    const layer = newPath(formatPath(path, box), box)
    if (
      runQuietly(() => {
        id = session.run('node.create', { parentId, layer })
      })
    )
      pen.layer = { id, start: box, applied: { x: 0, y: 0 }, scope: scope(pen.frame) }
  }
  /** Ends the pen's path, closed or open: the undo step ends, the new layer is selected, and the select tool comes back. */
  function finishPen() {
    const done = pen
    if (!done) return
    pen = null
    if (done.layer) hug([done.layer.id])
    done.end()
    if (done.layer && session.design().nodes[done.layer.id]) selection.select([done.layer.id], done.frame.key)
    tools.setTool('select')
    drawOverlay()
  }

  return {
    drawing,
    down: penDown,
    move: penMove,
    up: penUp,
    finish: finishPen,
    pressPoints: startPathEdit,
    dragPoints: pathTo,
    releasePoints,
    deletePoints,
    parts: pathParts,
  }
}
