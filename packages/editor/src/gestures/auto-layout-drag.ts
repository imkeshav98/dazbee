// Dragging layers that auto layout places: along their flow to a new place in it, or out of its
// box; the arrow keys moving them a place at a time; and the ghosts and line the overlay draws.
import { childrenOf, type Session } from '@dazbee/doc'
import { canHold, type Design, type Point } from '@dazbee/schema'

import type { Camera } from '../canvas/camera.ts'
import type { Frame } from '../canvas/frames.ts'
import { type AutoLayoutOf, flowSiblings, inFlow, propIn, rowIn } from '../layers/auto-layout.ts'
import type { EditorBoxes } from '../layers/boxes.ts'
import { type Box, drawnFrom, localTo, pageFrom, undrawn } from '../layers/transform.ts'
import { runQuietly } from '../run-quietly.ts'
import { CLICK_SLOP } from './press.ts'

/** A drag of layers in a flow, from the press until it ends: where they would go in it, or out of it. One undo step. */
export interface ReorderDrag {
  kind: 'reorder'
  frame: Frame
  around: Box[]
  parentId: string
  roots: string[]
  boxes: Map<string, Box>
  from: Point
  to: Point
  moved: boolean
  slot: number
  near: { id: string; after: boolean } | null
  outside: boolean
  end: () => void
}

export interface AutoLayoutDragDeps {
  session: Session
  boxes: Pick<EditorBoxes, 'boxIn' | 'containersOf' | 'drawnContains' | 'startBoxes'>
  camera: () => Camera
  /** Groups fit what they hold again after a change inside them, in the same undo step. */
  hug: (ids: string[]) => void
  /** Tells the app why the arrow keys did nothing: auto layout decides, or the layers are at the flow's end. */
  notify: (notice: 'placedByLayout' | 'flowEnd') => void
  /** A box on the overlay with a class, turned as the layer is. */
  outline: (className: string, frame: Frame, box: Box) => HTMLElement
}

export interface EditorAutoLayoutDrag {
  /** A drag in a flow as the overlay shows it: the layers following the pointer, and the line where they would go or their box outlined. */
  parts(g: ReorderDrag | null): HTMLElement[]
  /** A press on layers auto layout places, all in one flow: a drag along it or out of its box, one undo step until it is released. Null for any others. */
  press(frame: Frame, around: Box[], p: Point, ids: string[]): ReorderDrag | null
  /** Follows the pointer, once past the click slop: where in the flow the layers would go, or whether they leave it. */
  drag(g: ReorderDrag, p: Point): void
  /** Drops the layers where the drag shows, the groups around them fitting them again, closing its undo step. */
  release(g: ReorderDrag): void
  /** The arrow keys on layers in a flow: one place along it, one undo step; the app hears why when it can't. */
  nudge(ids: string[], dx: number, dy: number, now: Design): void
}

export function editorAutoLayoutDrag({
  session,
  boxes: { boxIn, containersOf, drawnContains, startBoxes },
  camera,
  hug,
  notify,
  outline,
}: AutoLayoutDragDeps): EditorAutoLayoutDrag {
  /**
   * A drag in a flow: the layers following the pointer, and inside the box a line where they would
   * go; outside it, the box outlined, since a drop there takes them out.
   */
  function reorderParts(g: ReorderDrag | null) {
    if (!g?.moved) return []
    const now = session.design()
    const parts: HTMLElement[] = []
    const dx = g.to.x - g.from.x
    const dy = g.to.y - g.from.y
    for (const id of g.roots) {
      const b = g.boxes.get(id)
      if (b) parts.push(outline('reorder-ghost', g.frame, drawnFrom({ ...b, x: b.x + dx, y: b.y + dy }, g.around)))
    }
    const holder = boxIn(g.frame, g.parentId, now)
    if (!holder) return parts
    if (g.outside) {
      parts.push(outline('reorder-leave', g.frame, drawnFrom(holder, g.around.slice(0, -1))))
      return parts
    }
    const row = rowIn(g.parentId, now)
    const gap = (propIn(g.parentId, 'layout', now) as AutoLayoutOf | undefined)?.gap ?? 0
    const near = g.near && boxIn(g.frame, g.near.id, now)
    const thick = 2 / camera().zoom
    // Halfway into the gap beside the nearest sibling; at the box's start when the flow is empty.
    const edge = !near
      ? row
        ? holder.x
        : holder.y
      : g.near?.after
        ? (row ? near.x + near.width : near.y + near.height) + gap / 2
        : (row ? near.x : near.y) - gap / 2
    const span = near ?? holder
    const line = row
      ? { x: edge - thick / 2, y: span.y, width: thick, height: span.height, rotation: 0 }
      : { x: span.x, y: edge - thick / 2, width: span.width, height: thick, rotation: 0 }
    parts.push(outline('reorder-line', g.frame, drawnFrom(line, g.around)))
    return parts
  }

  /**
   * A press on layers that auto layout places, all in one flow: a drag that moves them along it,
   * or out of its box. Null for layers that aren't.
   */
  function press(frame: Frame, around: Box[], p: Point, ids: string[]): ReorderDrag | null {
    const now = session.design()
    const parents = new Set(ids.map((id) => now.nodes[id]?.parentId))
    const [flowParent] = parents
    if (flowParent && parents.size === 1 && ids.every((id) => inFlow(id, now))) {
      // Auto layout places these: a drag moves them along the flow, or out of the box.
      const from = localTo(p, around)
      return {
        kind: 'reorder',
        frame,
        around,
        parentId: flowParent,
        roots: ids,
        boxes: startBoxes(frame, ids),
        from,
        to: from,
        moved: false,
        slot: 0,
        near: null,
        outside: false,
        end: session.beginGesture(),
      }
    }
    return null
  }
  /** Follows a drag of layers in a flow: where they would go in it, or out of it. */
  function reorderTo(g: ReorderDrag, p: Point) {
    if (!g.moved && Math.hypot(p.x - g.from.x, p.y - g.from.y) * camera().zoom < CLICK_SLOP) return
    g.moved = true
    g.to = p
    const holder = boxIn(g.frame, g.parentId)
    g.outside =
      !holder || p.x < holder.x || p.y < holder.y || p.x > holder.x + holder.width || p.y > holder.y + holder.height
    g.slot = slotAt(g, p)
  }
  /**
   * Where in a flow a point puts layers being moved: next to the sibling nearest it (on its line,
   * when the flow wraps), before it or after it as the point is before or past its middle along the
   * flow. The slot is the index of the sibling they go before; the list's length is the end.
   */
  function slotAt(g: ReorderDrag, p: Point) {
    const now = session.design()
    const row = rowIn(g.parentId, now)
    const siblings = flowSiblings(g.parentId, g.roots, now)
    let best: { i: number; d: number; after: boolean } | null = null
    siblings.forEach((id, i) => {
      const b = boxIn(g.frame, id, now)
      if (!b) return
      const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.width))
      const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.height))
      const d = Math.hypot(dx, dy)
      const after = row ? p.x > b.x + b.width / 2 : p.y > b.y + b.height / 2
      if (!best || d < best.d) best = { i, d, after }
    })
    const near = best as { i: number; d: number; after: boolean } | null
    g.near = near ? { id: siblings[near.i] as string, after: near.after } : null
    return near ? near.i + (near.after ? 1 : 0) : 0
  }
  /** Ends a drag in a flow: the drop, then the groups around the layers fit them again, closing its undo step. */
  function release(g: ReorderDrag) {
    finishReorder(g)
    hug(g.roots)
    g.end()
  }
  /**
   * Drops layers dragged in a flow, one undo step: inside their box, into the place the line
   * showed; outside it, out of the box into what holds it, where they were dropped.
   */
  function finishReorder(g: ReorderDrag) {
    if (!g.moved) return
    const now = session.design()
    if (!g.outside) {
      const siblings = flowSiblings(g.parentId, g.roots, now)
      const before = siblings[g.slot]
      const flow = childrenOf(now, g.parentId).map(([id]) => id)
      const moving = flow.filter((id) => g.roots.includes(id))
      const next = siblings.flatMap((id) => (id === before ? [...moving, id] : [id]))
      if (!before) next.push(...moving)
      // Dropped where they were: nothing to write.
      if (next.join() === flow.filter((id) => next.includes(id)).join()) return
      for (const id of moving)
        runQuietly(() => session.run('node.move', { id, parentId: g.parentId, ...(before ? { before } : {}) }))
      return
    }
    if (!now.nodes[g.parentId]) return
    const dx = g.to.x - g.from.x
    const dy = g.to.y - g.from.y
    // The container the drop point is in, among those holding the box, nearest first; or the frame.
    const point = pageFrom(g.to, g.around)
    let branch = g.parentId
    let target = now.nodes[g.parentId]?.parentId ?? g.frame.key
    while (
      now.nodes[target] &&
      !(canHold(now.nodes[target]?.type ?? '', 'graphic') && drawnContains(g.frame, target, point, now))
    ) {
      branch = target
      target = now.nodes[target]?.parentId ?? g.frame.key
    }
    // Above the part of the container that held them.
    const order = childrenOf(now, target).map(([id]) => id)
    const before = order[order.indexOf(branch) + 1]
    for (const id of g.roots) {
      const box = g.boxes.get(id)
      if (!box) continue
      // Placed where it was dropped, as it is drawn there.
      runQuietly(() =>
        session.run('node.move', { id, parentId: target, keepDrawn: false, ...(before ? { before } : {}) }),
      )
      const drawn = drawnFrom({ ...box, x: box.x + dx, y: box.y + dy }, g.around)
      runQuietly(() =>
        session.run('node.update', { ids: [id], patch: { ...undrawn(drawn, containersOf(g.frame, target, now)) } }),
      )
    }
  }
  /**
   * The arrow keys on layers in a flow: along it they move them one place earlier or later, one
   * undo step; across it, or for layers in different flows, auto layout decides, and the app says so.
   */
  function nudgeInFlow(ids: string[], dx: number, dy: number, now: Design) {
    const parents = new Set(ids.map((id) => now.nodes[id]?.parentId))
    const [parentId] = parents
    const row = parentId && rowIn(parentId, now)
    const along = row ? dx : dy
    if (!parentId || parents.size > 1 || !ids.every((id) => inFlow(id, now)) || along === 0 || (row ? dy : dx) !== 0) {
      notify('placedByLayout')
      return
    }
    const flow = childrenOf(now, parentId)
      .map(([id]) => id)
      .filter((id) => inFlow(id, now))
    const places = ids.map((id) => flow.indexOf(id)).sort((a, b) => a - b)
    const first = places[0] ?? 0
    const last = places.at(-1) ?? 0
    // Earlier: before the layer ahead of the first; later: past the layer after the last.
    const before = along < 0 ? flow[first - 1] : flow[last + 2]
    if (along < 0 ? first === 0 : last === flow.length - 1) {
      notify('flowEnd')
      return
    }
    const moving = flow.filter((id) => ids.includes(id))
    runQuietly(() =>
      session.gesture(() => {
        for (const id of moving) session.run('node.move', { id, parentId, ...(before ? { before } : {}) })
      }),
    )
  }

  return {
    parts: reorderParts,
    press,
    drag: reorderTo,
    release,
    nudge: nudgeInFlow,
  }
}
