// Moving, resizing and turning the selection on the stage, and the marquee: the handles a press
// grabs, the boxes a drag writes, what it snaps to, and the marquee and snap guides the overlay draws.
import { descendants, type Session } from '@dazbee/doc'
import { type ScaledText, scaleText, smallestSize } from '@dazbee/renderer'
import type { Point, Rect, RunStyle } from '@dazbee/schema'

import { type Camera, toScreen, toWorld } from '../../canvas/camera.ts'
import { type Frame, frameAt, intersects } from '../../canvas/frames.ts'
import { px } from '../../canvas/rulers.ts'
import type { FrameScenes } from '../../canvas/scenes.ts'
import { inFlow } from '../../layers/auto-layout.ts'
import type { EditorBoxes, SelectionBox } from '../../layers/boxes.ts'
import { resizedBoxes, scalingTexts, switchSizing } from '../../layers/resize.ts'
import {
  type Gap,
  type Guide,
  SNAP_DISTANCE,
  snapMove,
  snapResize,
  snapTargets,
  type Targets,
} from '../../layers/snap.ts'
import {
  angleOf,
  boundsOf,
  type Box,
  boxAt,
  centreOf,
  cornersOf,
  type Handle,
  handleAt,
  isCorner,
  localTo,
  normalAngle,
  resize as resizeBox,
  round,
  snapAngle,
  turn,
} from '../../layers/transform.ts'
import { runQuietly } from '../../run-quietly.ts'
import type { EditorSelection } from '../../selection.ts'
import type { EditorTyping } from '../../text/typing.ts'
import { HANDLE_REACH, HANDLE_SIZE } from '../press.ts'

/** A drag moving the selection, from the press until it ends: one undo step. */
export interface MoveDrag {
  kind: 'move'
  frame: Frame
  around: Box[]
  from: Point
  roots: string[]
  boxes: Map<string, Box>
  targets: Targets | null
  end: () => void
}
/** A drag of one of the selection's handles, from the press until it ends: one undo step. */
export interface ResizeDrag {
  kind: 'resize'
  frame: Frame
  around: Box[]
  handle: Handle
  outer: Box
  grab: Point
  roots: string[]
  boxes: Map<string, Box>
  targets: Targets | null
  switched: boolean
  /** The text a corner scales, with its sizes as the drag began; how much, and the least it may. */
  texts: Map<string, ScaledText>
  factor: number
  floor: number
  end: () => void
}
/** A drag turning the selection from outside one of its corners, from the press until it ends: one undo step. */
export interface RotateDrag {
  kind: 'rotate'
  frame: Frame
  around: Box[]
  outer: Box
  from: number
  roots: string[]
  boxes: Map<string, Box>
  end: () => void
}
/** A marquee being dragged on the stage, in world units, with what was selected before it. */
export interface MarqueeDrag {
  kind: 'marquee'
  from: Point
  to: Point
  base: string[]
  baseFrame: string | null
}
/** A drag that moves, resizes or turns layers. */
export type TransformDrag = MoveDrag | ResizeDrag | RotateDrag
/** What a press on the selection's handles grabs: one to resize by, or the zone outside a corner to turn by. */
export type Grab = { kind: 'resize'; handle: Handle } | { kind: 'rotate'; corner: number }

export interface TransformDragDeps {
  canvas: HTMLCanvasElement
  session: Session
  scenes: Pick<FrameScenes, 'scene'>
  selection: Pick<EditorSelection, 'current' | 'pathEditing' | 'selectKeepingModes'>
  typing: Pick<EditorTyping, 'editing' | 'fitText'>
  boxes: Pick<
    EditorBoxes,
    'boxIn' | 'startBoxes' | 'pickable' | 'roots' | 'selectionBox' | 'lockedSelection' | 'handlesFor' | 'snapBoxes'
  >
  camera: () => Camera
  /** The shown page's frames as last drawn. */
  frames: () => Frame[]
  /** Groups fit what they hold again after a change inside them, in the same undo step. */
  hug: (ids: string[]) => void
  /** Tells the app that auto layout places some of the layers a drag would move. */
  notify: (notice: 'placedByLayout') => void
  /** Puts an overlay element over a box in a frame, in design pixels. */
  placeBox: (el: HTMLElement, frame: Frame, box: Rect) => void
}

export interface EditorTransformDrag {
  /**
   * Snapping's work since the editor opened, for the checks that count it: `gathered` drags
   * worked out what they can snap to, `moves` pointer moves of a drag snapped, and the last
   * drag gathered `targets` boxes.
   */
  snapWork(): { gathered: number; moves: number; targets: number }
  /** The selection's handle under a point on the stage, or the zone outside a corner that turns it. */
  handleUnder(screen: Point): Grab | null
  /** The marquee being dragged, then the snap guides and equal gaps of the drag in progress, as the overlay shows them. */
  parts(marquee: MarqueeDrag | null): HTMLElement[]
  /** A press on a handle the selection's box `outer` has: a drag that resizes or turns it, one undo step until it is released. */
  pressHandle(e: PointerEvent, screen: Point, grabbed: Grab, outer: SelectionBox): ResizeDrag | RotateDrag
  /** A press that moves layers: a drag of those no flow places, one undo step until it is released; the app hears when some are. */
  pressMove(frame: Frame, around: Box[], p: Point, ids: string[]): MoveDrag
  /** Follows the pointer: Shift keeps a move to one axis, a resize to its shape, a turn to 15° steps; Alt resizes about the centre. */
  drag(g: TransformDrag, p: Point, shift: boolean, alt: boolean, snap: boolean): void
  /** Writes new boxes: what changed from `start`, and what a gesture changed and put back. */
  writeBoxes(frame: Frame, start: Map<string, Box>, next: Map<string, Box>): void
  /** Selects the layers a marquee touches in the frame it covers, with what was selected before it. */
  marquee(g: MarqueeDrag): void
  /** Ends a move, resize or turn: the groups around the layers fit them again, closing its undo step. */
  release(g: TransformDrag): void
  /** Lets the snap guides go; every press calls it as it ends. */
  clearGuides(): void
}

/** How far outside a corner a press turns the selection. */
const ROTATE_REACH = 24

export function editorTransformDrag({
  canvas,
  session,
  scenes,
  selection,
  typing,
  boxes: { boxIn, startBoxes, pickable, roots, selectionBox, lockedSelection, handlesFor, snapBoxes },
  camera,
  frames,
  hug,
  notify,
  placeBox,
}: TransformDragDeps): EditorTransformDrag {
  /** What the drag in progress snapped to, shown as guides and equal gaps (#42). */
  let snapped: { frame: Frame; guides: Guide[]; gaps: Gap[] } | null = null
  /** Snapping's work since the editor opened: drags that gathered targets, moves that snapped, the last drag's targets. */
  const snapWork = { gathered: 0, moves: 0, targets: 0 }
  /** What each gesture has written so far, by its start boxes: `<id>|<property>`. */
  const written = new WeakMap<Map<string, Box>, Set<string>>()
  /** Snapping's work so far, as a copy. */
  function snapWorkSoFar() {
    return { ...snapWork }
  }
  /** What a drag of layers in a frame can snap to: the boxes around them, and the frame. Counted in `snapWork`. */
  function targetsFor(frame: Frame, ids: string[], around: Box[]): Targets | null {
    const others = snapBoxes(frame, ids, around)
    if (!others) return null
    const targets = snapTargets(others, { x: 0, y: 0, width: frame.width, height: frame.height })
    snapWork.gathered++
    snapWork.targets = targets.boxes.length
    return targets
  }
  /** The handle under a screen point: one to resize by, or the zone outside a corner to turn by. */
  function handleUnder(screen: Point): Grab | null {
    const outer = selectionBox()
    if (!outer || typing.editing() || selection.pathEditing() || lockedSelection()) return null
    const { frame, drawn: box } = outer
    const onScreen = (p: Point) => toScreen(camera(), { x: frame.x + p.x, y: frame.y + p.y })
    const c = centreOf(box)
    const dist = (p: Point) => Math.hypot(p.x - screen.x, p.y - screen.y)
    if (Math.min(box.width, box.height) * camera().zoom >= 2 * HANDLE_SIZE) {
      for (const handle of handlesFor()) {
        const at = handleAt(handle)
        if (
          dist(onScreen(turn({ x: box.x + at.x * box.width, y: box.y + at.y * box.height }, c, box.rotation))) <=
          HANDLE_REACH
        )
          return { kind: 'resize', handle }
      }
    }
    const world = toWorld(camera(), screen)
    const local = turn({ x: world.x - frame.x, y: world.y - frame.y }, c, -box.rotation)
    const inside = local.x >= box.x && local.x <= box.x + box.width && local.y >= box.y && local.y <= box.y + box.height
    if (inside) return null
    const corner = cornersOf(box).findIndex((p) => dist(onScreen(p)) <= ROTATE_REACH)
    return corner === -1 ? null : { kind: 'rotate', corner }
  }
  /** The marquee being dragged, then the snap guides and equal gaps of the drag in progress. */
  function dragParts(marquee: MarqueeDrag | null) {
    const parts: HTMLElement[] = []
    if (marquee) {
      const el = document.createElement('div')
      el.className = 'marquee'
      const from = toScreen(camera(), marquee.from)
      const to = toScreen(camera(), marquee.to)
      Object.assign(el.style, {
        left: px(Math.min(from.x, to.x)),
        top: px(Math.min(from.y, to.y)),
        width: px(Math.abs(to.x - from.x)),
        height: px(Math.abs(to.y - from.y)),
      })
      parts.push(el)
    }
    if (snapped) parts.push(...snapParts(snapped))
    return parts
  }
  /** Snap guides as lines across the frame, and equal gaps as marked spans with their size. */
  function snapParts({ frame, guides, gaps }: NonNullable<typeof snapped>) {
    const parts: HTMLElement[] = []
    for (const g of guides) {
      const line = document.createElement('div')
      line.className = 'guide'
      line.dataset.axis = g.axis
      placeBox(
        line,
        frame,
        g.axis === 'x'
          ? { x: g.at, y: g.from, width: 0, height: g.to - g.from }
          : { x: g.from, y: g.at, width: g.to - g.from, height: 0 },
      )
      parts.push(line)
    }
    for (const g of gaps) {
      const span = document.createElement('div')
      span.className = 'gap'
      span.dataset.axis = g.axis
      placeBox(
        span,
        frame,
        g.axis === 'x'
          ? { x: g.from, y: g.at, width: g.to - g.from, height: 0 }
          : { x: g.at, y: g.from, width: 0, height: g.to - g.from },
      )
      const size = document.createElement('span')
      size.textContent = String(round(g.to - g.from, 0))
      span.append(size)
      parts.push(span)
    }
    return parts
  }

  /** Lets the guides of the drag that snapped go, as every press ends. */
  function clearGuides() {
    snapped = null
  }
  /** A press on one of the selection's handles: a drag that resizes or turns it, one undo step. */
  function pressHandle(e: PointerEvent, screen: Point, grabbed: Grab, outer: SelectionBox): ResizeDrag | RotateDrag {
    canvas.setPointerCapture(e.pointerId)
    const ids = roots()
    const boxes = startBoxes(outer.frame, ids)
    const end = session.beginGesture()
    const world = toWorld(camera(), screen)
    const { around } = outer
    const grab = localTo({ x: world.x - outer.frame.x, y: world.y - outer.frame.y }, around)
    if (grabbed.kind === 'resize') {
      const texts = scalingTexts(session.design(), ids, grabbed.handle)
      // Scaled down, the smallest size anywhere in the text stops at 1 px.
      const floor = Math.max(0, ...[...texts.values()].map((t) => 1 / smallestSize(t)))
      return {
        kind: 'resize',
        frame: outer.frame,
        around,
        handle: grabbed.handle,
        outer: outer.box,
        grab,
        roots: ids,
        boxes,
        targets: targetsFor(outer.frame, ids, around),
        switched: false,
        texts,
        factor: 1,
        floor,
        end,
      }
    }
    return {
      kind: 'rotate',
      frame: outer.frame,
      around,
      outer: outer.box,
      from: angleOf(grab, centreOf(outer.box)),
      roots: ids,
      boxes,
      end,
    }
  }
  /** A press that moves the selection: a drag of the layers no flow places, one undo step. */
  function pressMove(frame: Frame, around: Box[], p: Point, ids: string[]): MoveDrag {
    const now = session.design()
    // Layers in a flow among others stay in it: auto layout places them.
    const free = ids.filter((id) => !inFlow(id, now))
    if (free.length < ids.length) notify('placedByLayout')
    return {
      kind: 'move',
      frame,
      around,
      from: localTo(p, around),
      roots: free,
      boxes: startBoxes(frame, free),
      targets: targetsFor(frame, free, around),
      end: session.beginGesture(),
    }
  }
  /**
   * Follows the pointer in a move, resize or turn. Shift keeps a move to one axis, a resize to the
   * box's shape and a turn to 15° steps; Alt resizes about the centre; `snap` snaps a move or
   * resize to what is around it.
   */
  function drag(g: TransformDrag, p: Point, shift: boolean, alt: boolean, snap: boolean) {
    if (g.kind === 'move') moveTo(g, p, shift, snap)
    else if (g.kind === 'resize') resizeTo(g, p, shift, alt, snap)
    else rotateTo(g, p, shift)
  }
  /** Moves the layers by the drag, on whole pixels unless they snapped to a line that isn't on one. */
  function moveTo(g: MoveDrag, p: Point, axisLock: boolean, snap: boolean) {
    let dx = p.x - g.from.x
    let dy = p.y - g.from.y
    // Shift keeps a move to one axis, whichever it has gone further along.
    if (axisLock) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0
      else dx = 0
    }
    // A move lands on whole pixels, unless it snapped to a line that isn't on one.
    let toX = Math.round
    let toY = Math.round
    snapped = null
    const moving = g.roots.map((id) => g.boxes.get(id)).filter((b): b is Box => b !== undefined)
    if (snap && g.targets && moving.length > 0) {
      snapWork.moves++
      const from = boundsOf(moving)
      const s = snapMove(
        { ...from, x: Math.round(from.x + dx), y: Math.round(from.y + dy) },
        g.targets,
        SNAP_DISTANCE / camera().zoom,
        { x: axisLock && dx === 0, y: axisLock && dy === 0 },
      )
      if (s.dx !== 0) {
        dx = Math.round(from.x + dx) + s.dx - from.x
        toX = (n) => round(n)
      }
      if (s.dy !== 0) {
        dy = Math.round(from.y + dy) + s.dy - from.y
        toY = (n) => round(n)
      }
      snapped = { frame: g.frame, guides: s.guides, gaps: s.gaps }
    }
    const next = new Map([...g.boxes].map(([id, b]) => [id, { ...b, x: toX(b.x + dx), y: toY(b.y + dy) }]))
    writeBoxes(g.frame, g.boxes, next)
  }
  /** Resizes the layers by the handle dragged, snapping its edges, scaling the text a corner scales. */
  function resizeTo(g: ResizeDrag, p: Point, keepRatio: boolean, fromCentre: boolean, snap: boolean) {
    // The handle follows the pointer from where it was grabbed, so a press off its centre doesn't jump.
    const at = handleAt(g.handle)
    const handle = turn(
      { x: g.outer.x + at.x * g.outer.width, y: g.outer.y + at.y * g.outer.height },
      centreOf(g.outer),
      g.outer.rotation,
    )
    const to = { x: handle.x + p.x - g.grab.x, y: handle.y + p.y - g.grab.y }
    // A corner that scales text keeps the box's shape, so the text scales as one.
    const scales = g.texts.size > 0
    const ratio = keepRatio || scales
    let outer = resizeBox(g.outer, g.handle, to, { keepRatio: ratio, fromCentre })
    snapped = null
    // The dragged edges snap; a turned box has none that run along the frame. With the shape kept,
    // the edge nearest a guide snaps and the other follows.
    if (snap && g.targets && outer.rotation === 0) {
      const corner = isCorner(g.handle)
      const s = snapResize(outer, g.handle, g.targets, SNAP_DISTANCE / camera().zoom, ratio && corner)
      if (ratio && corner && (s.dx !== 0 || s.dy !== 0) && g.outer.width > 0 && g.outer.height > 0) {
        // From the centre both edges move, so the box grows by twice what the dragged edge does.
        const grows = fromCentre ? 2 : 1
        const factor =
          s.dx !== 0
            ? (outer.width + grows * (g.handle.includes('e') ? s.dx : -s.dx)) / g.outer.width
            : (outer.height + grows * (g.handle.includes('s') ? s.dy : -s.dy)) / g.outer.height
        outer = boxAt(g.outer, g.handle, factor, fromCentre)
      } else if (s.dx !== 0 || s.dy !== 0)
        outer = resizeBox(g.outer, g.handle, { x: to.x + s.dx, y: to.y + s.dy }, { keepRatio: ratio, fromCentre })
      snapped = { frame: g.frame, guides: s.guides, gaps: [] }
    }
    if (scales) {
      g.factor =
        g.outer.width > 0 ? outer.width / g.outer.width : g.outer.height > 0 ? outer.height / g.outer.height : 1
      if (g.factor < g.floor) {
        g.factor = g.floor
        outer = boxAt(g.outer, g.handle, g.factor, fromCentre)
      }
    }
    const now = session.design()
    if (!g.switched) {
      g.switched = true
      switchSizing(session, g.roots, g.handle, now, g.texts)
    }
    const next = resizedBoxes(now, g.roots, g.boxes, g.outer, outer)
    writeBoxes(
      g.frame,
      g.boxes,
      new Map(
        [...next].map(([id, b]) => [
          id,
          { ...b, x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height) },
        ]),
      ),
    )
    // The text a corner scales takes its sizes scaled from where they were: its style's, and each
    // of its own runs' on that run's characters.
    for (const [id, start] of g.texts) {
      const { runs, ...sized } = scaleText(start, g.factor)
      runQuietly(() => session.run('node.update', { ids: [id], patch: sized }))
      for (const run of runs) {
        const style = sizesOf(run.style)
        if (Object.keys(style).length > 0)
          runQuietly(() =>
            session.run('text.edit', { id, op: { kind: 'style', at: run.start, length: run.end - run.start, style } }),
          )
      }
    }
    // Text that grows with its words takes the size its new width and sizes give it.
    for (const id of new Set([...g.roots.filter((root) => now.nodes[root]?.type === 'text'), ...g.texts.keys()]))
      typing.fitText(id)
  }
  /** Turns the layers about the selection's centre by the angle the pointer has turned through. */
  function rotateTo(g: RotateDrag, p: Point, snap: boolean) {
    const centre = centreOf(g.outer)
    const turned = angleOf(p, centre) - g.from
    const next = new Map<string, Box>()
    const now = session.design()
    if (g.roots.length === 1) {
      // One layer: its own angle snaps with shift. What is inside it turns with it as it is drawn.
      const root = g.roots[0] as string
      const angle = g.outer.rotation + turned
      next.set(root, { ...g.outer, rotation: round(normalAngle(snap ? snapAngle(angle) : angle)) })
    } else {
      // Several: each turns about the selection's centre, by an angle that snaps with shift.
      const delta = snap ? snapAngle(turned) : turned
      for (const root of g.roots) {
        const was = g.boxes.get(root)
        if (!was) continue
        const c = centreOf(was)
        const moved = turn(c, centre, delta)
        const dx = moved.x - c.x
        const dy = moved.y - c.y
        next.set(root, {
          ...was,
          x: round(was.x + dx),
          y: round(was.y + dy),
          rotation: round(normalAngle(was.rotation + delta)),
        })
        for (const id of descendants(now, root)) {
          const inner = g.boxes.get(id)
          if (inner) next.set(id, { ...inner, x: round(inner.x + dx), y: round(inner.y + dy) })
        }
      }
    }
    writeBoxes(g.frame, g.boxes, next)
  }
  /**
   * Writes new boxes: the properties the gesture changes from where it started, including one it
   * changed and has now put back. The rest is left to other tabs.
   */
  function writeBoxes(frame: Frame, start: Map<string, Box>, next: Map<string, Box>) {
    const now = session.design()
    const wrote = written.get(start) ?? new Set<string>()
    written.set(start, wrote)
    // One update for the whole step, not one per layer: a drag of many layers sends and stores once a move.
    session.batch(() => {
      for (const [id, box] of next) {
        const was = start.get(id)
        const current = boxIn(frame, id, now)
        const patch: Partial<Box> = {}
        for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const) {
          if ((box[key] !== was?.[key] || wrote.has(`${id}|${key}`)) && box[key] !== current?.[key])
            patch[key] = box[key]
        }
        for (const key of Object.keys(patch)) wrote.add(`${id}|${key}`)
        // Another tab may delete or lock a layer mid-drag; the drag then just leaves it be.
        if (Object.keys(patch).length > 0) runQuietly(() => session.run('node.update', { ids: [id], patch }))
      }
    })
  }
  /** Top-level layers the marquee touches in the frame it covers, with what was selected before. */
  function marqueeSelect(g: MarqueeDrag) {
    const rect = {
      x: Math.min(g.from.x, g.to.x),
      y: Math.min(g.from.y, g.to.y),
      width: Math.abs(g.to.x - g.from.x),
      height: Math.abs(g.to.y - g.from.y),
    }
    const frame = frameAt(frames(), g.from) ?? frames().find((f) => intersects(f, rect))
    if (!frame) return
    const local = { x: rect.x - frame.x, y: rect.y - frame.y, width: rect.width, height: rect.height }
    const hits = scenes
      .scene(frame)
      .layers.filter((layer) => pickable(layer) && intersects(boundsOf([{ ...layer.props }]), local))
      .map((layer) => layer.id)
    const base = g.baseFrame === frame.id ? g.base : []
    selection.selectKeepingModes(
      hits.length + base.length > 0
        ? { frameId: frame.id, ids: [...base, ...hits.filter((id) => !base.includes(id))] }
        : null,
    )
  }
  /** Ends a move, resize or turn: the groups around the layers fit them again, closing its undo step. */
  function release(g: TransformDrag) {
    hug(g.roots)
    g.end()
  }

  return {
    snapWork: snapWorkSoFar,
    handleUnder,
    parts: dragParts,
    pressHandle,
    pressMove,
    drag,
    writeBoxes,
    marquee: marqueeSelect,
    release,
    clearGuides,
  }
}

/** The frame and the layers a move, resize or turn carries, which may reach past the frame's edge; null for any other gesture. */
export function carried(g: { kind: string } | null): { frame: Frame; roots: string[] } | null {
  if (g?.kind !== 'move' && g?.kind !== 'resize' && g?.kind !== 'rotate') return null
  const { frame, roots } = g as TransformDrag
  return { frame, roots }
}

/** The sizes a run's style sets, which a corner scales: its font size, letter spacing and outline. */
function sizesOf(style: RunStyle): RunStyle {
  const sizes: RunStyle = {}
  if (style.fontSize !== undefined) sizes.fontSize = style.fontSize
  if (style.letterSpacing !== undefined) sizes.letterSpacing = style.letterSpacing
  if (style.outline !== undefined) sizes.outline = style.outline
  return sizes
}
