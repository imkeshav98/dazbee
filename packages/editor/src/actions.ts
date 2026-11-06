// What the shortcuts and the menus do to the selection, the picked frame and the view: delete,
// group, mask, box, auto layout, combine, reorder, lock and hide, align and distribute, nudge,
// duplicate, select all, zoom and the tools.
import { childrenOf, descendants, loadDesign, openSession, type Session } from '@dazbee/doc'
import { type Design, LOCK_FLAGS, type Rect } from '@dazbee/schema'

import { withCopies } from './across-frames.ts'
import type { Frame } from './canvas/frames.ts'
import type { FrameScenes } from './canvas/scenes.ts'
import type { EditorView } from './canvas/view.ts'
import type { EditorFrameActions } from './frame-actions.ts'
import type { EditorPen } from './gestures/pen/pen.ts'
import type { EditorAutoLayoutDrag } from './gestures/select/auto-layout-drag.ts'
import type { EditorTransformDrag } from './gestures/select/transform-drag.ts'
import { align, type Alignment, distribute, type Distribution, type Offset } from './layers/arrange.ts'
import { inFlow, layoutIn } from './layers/auto-layout.ts'
import { type EditorBoxes, visibleIn } from './layers/boxes.ts'
import { hug as hugIn } from './layers/hug.ts'
import { boundsOf, type Box, localTo, round } from './layers/transform.ts'
import { runQuietly } from './run-quietly.ts'
import { type EditorSelection, firstFrameOf, idsOf, isPath, pairsIn, type Picked } from './selection.ts'
import { NUDGES, type ShortcutAction } from './shortcuts.ts'
import type { EditorTools } from './tools.ts'

export interface ActionsDeps {
  session: Session
  view: Pick<
    EditorView,
    | 'design'
    | 'frameOf'
    | 'page'
    | 'nearestFrame'
    | 'fitAll'
    | 'fitArea'
    | 'zoomTo'
    | 'zoomIn'
    | 'zoomOut'
    | 'toggleRulers'
    | 'viewChanged'
  >
  tools: Pick<EditorTools, 'setTool'>
  selection: Pick<
    EditorSelection,
    | 'current'
    | 'entered'
    | 'lastFrameOn'
    | 'pickedFrame'
    | 'cropping'
    | 'pathEditing'
    | 'select'
    | 'selectAcross'
    | 'enter'
    | 'pickFrame'
    | 'crop'
    | 'editPath'
  >
  scenes: Pick<FrameScenes, 'scene'>
  boxes: Pick<
    EditorBoxes,
    | 'roots'
    | 'rootsByFrame'
    | 'startBoxes'
    | 'boxIn'
    | 'selectionBox'
    | 'selectionBoxes'
    | 'pickable'
    | 'drawnInFlow'
    | 'drawnAlike'
    | 'cropTarget'
  >
  pen: Pick<EditorPen, 'drawing' | 'finish' | 'deletePoints'>
  transformDrag: Pick<EditorTransformDrag, 'writeBoxes'>
  autoLayoutDrag: Pick<EditorAutoLayoutDrag, 'nudge'>
  frameActions: Pick<EditorFrameActions, 'frameAction'>
  /**
   * Tells the app that auto layout places some of the layers an align or distribute would move.
   */
  notify: (notice: 'placedByLayout') => void
  /** Draws the overlay. */
  drawOverlay: () => void
}

/** Where each layer-order shortcut moves the selected layers among their siblings. */
const REORDERS = {
  bringForward: 'forward',
  sendBackward: 'backward',
  bringToFront: 'front',
  sendToBack: 'back',
} as const

/** What Ungroup would do for the selection, or why it has nothing to do (`EditorActions.ungroupState`). */
export type UngroupState = 'ready' | 'none' | 'locked' | 'placedByLayout'

export interface EditorActions {
  /**
   * Does what a shortcut names. Returns whether there was anything to do it to; the keys that act
   * on the selection do nothing without one. Undo and redo are the editor's, which ends what is
   * open on the stage first: they do nothing here.
   */
  perform(action: ShortcutAction): boolean
  /**
   * What Ungroup would do for the selection: `ready` while a selected group, box or boolean comes
   * apart with every layer of its frame staying where it is drawn; otherwise why none can, `locked`
   * when each is locked against deleting, else `placedByLayout` when an auto layout box would place
   * what one holds elsewhere; `none` with no group, box or boolean selected.
   */
  ungroupState(): UngroupState
  /** Fits the selection in view, else the picked frame, else the shown page's frames. */
  fitSelection(): void
}

export function editorActions({
  session,
  view: {
    design: drawn,
    frameOf,
    page,
    nearestFrame,
    fitAll,
    fitArea,
    zoomTo,
    zoomIn,
    zoomOut,
    toggleRulers,
    viewChanged,
  },
  tools,
  selection,
  scenes,
  boxes,
  pen,
  transformDrag,
  autoLayoutDrag,
  frameActions,
  notify,
  drawOverlay,
}: ActionsDeps): EditorActions {
  /** Groups fit what they hold again after a change inside them, in the same undo step. */
  const hug = (ids: string[]) => hugIn(session, ids)
  function fitSelection() {
    const outer = boxes.selectionBox()
    const picked = frameOf(selection.pickedFrame() ?? undefined)
    if (!outer && picked) return fitArea({ x: picked.x, y: picked.y, width: picked.width, height: picked.height })
    if (!outer) return fitAll()
    const { frame, box } = outer
    const b = boundsOf([box])
    fitArea({ x: frame.x + b.x, y: frame.y + b.y, width: b.width, height: b.height })
  }

  /**
   * Whether ungrouping a layer leaves every layer of its frame drawn where it is, tried on a copy of
   * the design: in an auto layout box, the flow places what the layer held once it is out.
   */
  function ungroupKeeps(frame: Frame, id: string, placed: Record<string, Omit<Box, 'rotation'>>, now: Design) {
    const trial = openSession(loadDesign(now))
    return (
      runQuietly(() => trial.run('node.ungroup', { ids: [id], drawn: placed })) &&
      boxes.drawnAlike(frame.id, now, trial.design())
    )
  }

  /**
   * The selected groups, boxes and booleans that come apart with nothing moving, each with where
   * what it holds is drawn; how many were selected; and how many stay whole because their auto
   * layout box would place what they hold elsewhere. One locked against deleting stays whole too.
   */
  function ungroupable() {
    const now = session.design()
    const placed = (id: string) => boxes.drawnInFlow(childrenOf(now, id).map(([child]) => child)) ?? {}
    const parts = boxes.rootsByFrame(now).map(({ frame, ids }) => {
      const containers = ids.filter((id) => ['group', 'box', 'boolean'].includes(now.nodes[id]?.type ?? ''))
      const unlocked = containers.filter((id) => !now.nodes[id]?.lock?.delete)
      const groups = unlocked
        .filter((id) => !layoutIn(now.nodes[id]?.parentId ?? '', now) || ungroupKeeps(frame, id, placed(id), now))
        .map((id) => ({ id, drawn: placed(id) }))
      return { frame, groups, selected: containers.length, placedByLayout: unlocked.length - groups.length }
    })
    return {
      parts,
      groups: parts.flatMap((part) => part.groups),
      selected: parts.reduce((n, part) => n + part.selected, 0),
      placedByLayout: parts.reduce((n, part) => n + part.placedByLayout, 0),
    }
  }

  /**
   * Runs a change on the selected layers of each frame that holds some, the first one's frame
   * first, as one undo step: a frame where the change is refused is left as it is, its layers still
   * selected. `change` returns the layers to select in that frame, or null to keep its selected
   * layers; once any frame returns some, the selection becomes them across the frames. Returns
   * whether the change ran in any frame.
   */
  function eachFrame(change: (frame: Frame, ids: string[], now: Design) => string[] | null) {
    const next: Picked[] = []
    let selects = false
    let ran = false
    session.gesture(() => {
      for (const { frame, ids } of boxes.rootsByFrame()) {
        let picked: string[] | null = null
        const done = runQuietly(() => (picked = change(frame, ids, session.design())))
        ran ||= done
        selects ||= picked !== null
        next.push(...pairsIn(frame.id, picked ?? ids))
      }
    })
    if (selects) selection.selectAcross(next)
    return ran
  }

  /** What Ungroup would do for the selection, or why it has nothing to do. */
  function ungroupState(): UngroupState {
    const { groups, selected, placedByLayout } = ungroupable()
    if (selected === 0) return 'none'
    if (groups.length > 0) return 'ready'
    return placedByLayout > 0 ? 'placedByLayout' : 'locked'
  }

  /** Combines the selected shapes into a live boolean (#44) and selects it. One undo step. */
  function combine(op: 'union' | 'subtract' | 'intersect' | 'exclude') {
    eachFrame((_, ids) => [session.run('node.boolean', { ids, op, drawn: boxes.drawnInFlow(ids) })])
  }

  /**
   * Moves each selected layer, with what is inside it, by an offset worked out from the boxes
   * around them as drawn: align and distribute (#42). One undo step.
   */
  function arrange(offsets: (boxes: Rect[], within: Rect) => Offset[]) {
    const now = session.design()
    if (boxes.roots(now).some((id) => inFlow(id, now))) notify('placedByLayout')
    session.gesture(() => {
      for (const { frame, ids } of boxes.rootsByFrame(now)) {
        const free = ids.filter((id) => !inFlow(id, now))
        if (free.length > 0) arrangeFree(frame, free, offsets, now)
      }
    })
  }
  /** Align or distribute layers that aren't in a flow. */
  function arrangeFree(frame: Frame, ids: string[], offsets: (boxes: Rect[], within: Rect) => Offset[], now: Design) {
    const start = boxes.startBoxes(frame, ids)
    // One layer lines up with what holds it: its group or box, or the frame.
    const parent = now.nodes[ids[0] ?? '']?.parentId
    const holder = parent && now.nodes[parent] ? boxes.boxIn(frame, parent, now) : null
    const within = holder ?? { x: 0, y: 0, width: frame.width, height: frame.height }
    const moves = offsets(
      ids.map((id) => boundsOf([start.get(id) as Box])),
      within,
    )
    const next = new Map<string, Box>()
    ids.forEach((id, i) => {
      const { dx, dy } = moves[i] ?? { dx: 0, dy: 0 }
      for (const inner of [id, ...descendants(now, id)]) {
        const b = start.get(inner)
        if (b) next.set(inner, { ...b, x: round(b.x + dx), y: round(b.y + dy) })
      }
    })
    session.gesture(() => {
      transformDrag.writeBoxes(frame, start, next)
      hug(ids)
    })
    return true
  }
  const alignTo = (to: Alignment) => arrange((boxes, within) => align(boxes, to, within))
  const distributeAlong = (axis: Distribution) => arrange((boxes) => distribute(boxes, axis))

  /**
   * Moves the selection by whole pixels in each of its frames, every frame's layers by the same
   * amount, one undo step per press.
   */
  function nudge(dx: number, dy: number) {
    const now = session.design()
    const around = new Map(boxes.selectionBoxes().map((b) => [b.frame.id, b.around]))
    session.gesture(() => {
      for (const { frame, ids } of boxes.rootsByFrame(now)) {
        if (ids.some((id) => inFlow(id, now))) {
          autoLayoutDrag.nudge(ids, dx, dy, now)
          continue
        }
        const start = boxes.startBoxes(frame, ids)
        // Arrows move along the frame as drawn, also inside a turned group.
        const step = localTo(
          { x: dx, y: dy },
          (around.get(frame.id) ?? []).map((b) => ({ ...b, x: -b.width / 2, y: -b.height / 2 })),
        )
        transformDrag.writeBoxes(
          frame,
          start,
          new Map([...start].map(([id, b]) => [id, { ...b, x: round(b.x + step.x), y: round(b.y + step.y) }])),
        )
        hug(ids)
      }
    })
  }

  /**
   * Selects every top-level layer that can be picked in the selection's frame; with nothing
   * selected, in the picked frame, else the frame last selected in on the shown page, else the
   * frame nearest the middle of the view.
   */
  function selectAll() {
    const frame =
      frameOf(firstFrameOf(selection.current())) ??
      frameOf(selection.pickedFrame() ?? undefined) ??
      frameOf(selection.lastFrameOn(page()) ?? undefined) ??
      nearestFrame()
    if (!frame) return
    selection.select(
      scenes
        .scene(frame)
        .layers.filter(boxes.pickable)
        .map((layer) => layer.id),
      frame.id,
    )
  }

  /**
   * Does what a shortcut names. Returns whether there was anything to do it to; the keys that act
   * on the selection do nothing without one.
   */
  function perform(action: ShortcutAction): boolean {
    const withoutSelection: Partial<Record<ShortcutAction, () => void>> = {
      zoomToFit: fitAll,
      zoomToSelection: fitSelection,
      zoomTo100: () => zoomTo(1),
      zoomIn,
      zoomOut,
      selectAll,
      toggleRulers: () => {
        toggleRulers()
        drawOverlay()
        viewChanged()
      },
      toolSelect: () => tools.setTool('select'),
      toolHand: () => tools.setTool('hand'),
      toolRect: () => tools.setTool('rect'),
      toolEllipse: () => tools.setTool('ellipse'),
      toolLine: () => tools.setTool('line'),
      toolArrow: () => tools.setTool('arrow'),
      toolPen: () => tools.setTool('pen'),
      toolText: () => tools.setTool('text'),
      toolFrame: () => tools.setTool('frame'),
      toolImage: () => tools.setTool('image'),
    }
    // The pen's path ends with Enter or Escape, open as it is (#45).
    if (pen.drawing() && (action === 'deselect' || action === 'editPoints')) {
      pen.finish()
      return true
    }
    // Enter or Escape ends a crop (#48).
    if (selection.cropping() && (action === 'deselect' || action === 'editPoints')) {
      selection.crop(null)
      drawOverlay()
      return true
    }
    if (selection.pathEditing()) {
      if (action === 'deselect' || action === 'editPoints') {
        selection.editPath(null)
        drawOverlay()
        return true
      }
      if (action === 'delete') {
        pen.deletePoints()
        drawOverlay()
        return true
      }
    }
    const anytime = withoutSelection[action]
    if (anytime) {
      anytime()
      return true
    }
    const picked = selection.pickedFrame()
    if (picked !== null && !selection.current()) return frameActions.frameAction(action, picked)
    const current = selection.current()
    const frame = current && frameOf(current[0]?.frameId)
    if (!current || !frame) return false
    const selected = idsOf(current)
    const nodes = session.design().nodes
    switch (action) {
      case 'selectLinkedCopies': {
        // The linked copies of the selected layers in the shown page's other frames join them.
        const next = withCopies(current, session.design())
        if (next.length === current.length) return true
        selection.selectAcross(next)
        break
      }
      case 'deselect': {
        // Out of a group or box one level at a time: it gets selected, then nothing.
        const up = selection.entered()
        const parent = up ? drawn().nodes[up]?.parentId : undefined
        selection.enter(parent && drawn().nodes[parent] ? parent : null)
        selection.select(up ? [up] : [], frame.id)
        break
      }
      case 'delete':
        eachFrame((_, ids, now) => {
          const parents = ids.map((id) => now.nodes[id]?.parentId ?? '').filter((id) => now.nodes[id])
          session.run('node.delete', { ids })
          hug(parents)
          return []
        })
        break
      case 'group':
        eachFrame((_, ids) => [session.run('node.group', { ids, drawn: boxes.drawnInFlow(ids) })])
        break
      case 'alignLeft':
        alignTo('left')
        break
      case 'alignCentre':
        alignTo('centre')
        break
      case 'alignRight':
        alignTo('right')
        break
      case 'alignTop':
        alignTo('top')
        break
      case 'alignMiddle':
        alignTo('middle')
        break
      case 'alignBottom':
        alignTo('bottom')
        break
      case 'distributeHorizontal':
        distributeAlong('horizontal')
        break
      case 'distributeVertical':
        distributeAlong('vertical')
        break
      case 'editPoints': {
        // Enter on one layer with an image fill crops it (#48); on one path, it goes into its points (#45).
        const [only] = selected
        if (selected.length !== 1 || !only || nodes[only]?.lock?.style) return false
        if (boxes.cropTarget(frame, only)) selection.crop({ id: only, frameId: frame.id })
        else if (isPath(session.design(), only)) selection.editPath({ id: only, frameId: frame.id })
        else return false
        break
      }
      case 'mask': {
        // One layer becomes a mask for the layers after it in its parent, or plain again; with one
        // layer selected in each of several frames, every one takes the first one's way. Several
        // in a frame are grouped first, and the bottom one masks the rest.
        const on = !nodes[boxes.roots()[0] ?? '']?.props.mask
        eachFrame((_, ids) => {
          if (ids.length === 1) {
            session.run('node.mask', { ids, mask: on ? 'alpha' : null })
            return null
          }
          const group = session.run('node.group', { ids, drawn: boxes.drawnInFlow(ids) })
          const [[bottom] = []] = childrenOf(session.design(), group)
          if (bottom) session.run('node.mask', { ids: [bottom], mask: 'alpha' })
          return [group]
        })
        break
      }
      case 'boxSelection':
        eachFrame((_, ids) => [session.run('node.box', { ids, drawn: boxes.drawnInFlow(ids) })])
        break
      case 'autoLayout': {
        // Selected boxes: auto layout on, or off when every one has it already (#46).
        const roots = boxes.roots()
        if (roots.length === 0) return false
        const boxIds = roots.filter((id) => nodes[id]?.type === 'box')
        if (boxIds.length > 0) {
          const on = !boxIds.every((id) => {
            const node = nodes[id]
            return node?.type === 'box' && node.props.layout !== undefined
          })
          session.gesture(() => {
            for (const id of boxIds) runQuietly(() => session.run('node.autoLayout', { id, on }))
          })
          break
        }
        // Layers none of which is a box are wrapped in a box that hugs them, its layout read off
        // where they are: layers already in an even row or column don't move.
        eachFrame((_, ids) => {
          const boxed = session.run('node.box', { ids, drawn: boxes.drawnInFlow(ids) })
          session.run('node.autoLayout', { id: boxed, on: true })
          session.run('node.update', { ids: [boxed], patch: { sizing: { width: 'hug', height: 'hug' } } })
          return [boxed]
        })
        break
      }
      case 'booleanUnion':
        combine('union')
        break
      case 'booleanSubtract':
        combine('subtract')
        break
      case 'booleanIntersect':
        combine('intersect')
        break
      case 'booleanExclude':
        combine('exclude')
        break
      case 'ungroup': {
        // Boxes and booleans come apart the same way: what a box laid out stays where it is drawn,
        // and a boolean's shapes show their own paints again. In an auto layout box, a layer comes
        // apart only when what it held takes its place in the flow with nothing moving, and one
        // locked against deleting stays whole; while none can, the menus grey Ungroup with the
        // reason and its key does nothing. In a mixed selection what can come apart does, and the
        // rest stays as it is, with no notice.
        const { parts, selected: containers } = ungroupable()
        if (containers === 0) return false
        if (parts.every((part) => part.groups.length === 0)) return true
        const freeing = new Map(parts.map((part) => [part.frame.id, part.groups]))
        eachFrame((f, ids) => {
          const groups = freeing.get(f.id) ?? []
          if (groups.length === 0) return ids
          const freed = session.run('node.ungroup', {
            ids: groups.map((group) => group.id),
            drawn: Object.assign({}, ...groups.map((g) => g.drawn)),
          })
          return [...ids.filter((id) => !groups.some((group) => group.id === id)), ...freed]
        })
        break
      }
      case 'duplicate':
        eachFrame((_, ids) => session.run('node.duplicate', { ids }))
        break
      case 'bringForward':
      case 'sendBackward':
      case 'bringToFront':
      case 'sendToBack': {
        const to = REORDERS[action]
        eachFrame((_, ids) => {
          session.run('node.reorder', { ids, to })
          return null
        })
        break
      }
      case 'lock': {
        // Locks every flag, or unlocks them all when every selected layer is already locked.
        const locked = selected.every((id) => LOCK_FLAGS.every((flag) => nodes[id]?.lock?.[flag]))
        runQuietly(() =>
          session.run('node.lock', {
            ids: selected,
            lock: Object.fromEntries(LOCK_FLAGS.map((flag) => [flag, !locked])),
          }),
        )
        break
      }
      case 'hide': {
        // Hidden in its frame, its linked copies left as they are; the layer stays selected so it can be shown again.
        const shown = selected.some((id) => visibleIn(session.design(), id))
        runQuietly(() => session.run('node.update', { ids: selected, patch: { visible: !shown } }))
        break
      }
      default: {
        const step = NUDGES[action]
        if (!step) return false
        nudge(...step)
      }
    }
    drawOverlay()
    return true
  }

  return {
    perform,
    ungroupState,
    fitSelection,
  }
}
