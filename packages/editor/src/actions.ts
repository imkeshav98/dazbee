// What the shortcuts and the menus do to the selection, the picked frame and the view: delete,
// group, mask, box, auto layout, combine, reorder, lock and hide, align and distribute, nudge,
// duplicate, select all, zoom and the tools.
import { childrenOf, descendants, type Session } from '@dazbee/doc'
import { type Design, LOCK_FLAGS, type Rect } from '@dazbee/schema'

import type { Frame } from './canvas/frames.ts'
import type { FrameScenes } from './canvas/scenes.ts'
import type { EditorView } from './canvas/view.ts'
import type { EditorPen } from './gestures/pen/pen.ts'
import type { EditorAutoLayoutDrag } from './gestures/select/auto-layout-drag.ts'
import type { EditorTransformDrag } from './gestures/select/transform-drag.ts'
import { align, type Alignment, distribute, type Distribution, type Offset } from './layers/arrange.ts'
import { inFlow } from './layers/auto-layout.ts'
import { type EditorBoxes, visibleIn } from './layers/boxes.ts'
import { hug as hugIn } from './layers/hug.ts'
import { boundsOf, type Box, localTo, round } from './layers/transform.ts'
import { runQuietly } from './run-quietly.ts'
import { type EditorSelection, isPath } from './selection.ts'
import { NUDGE, NUDGE_FAR, type ShortcutAction } from './shortcuts.ts'
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
    | 'enter'
    | 'pickFrame'
    | 'crop'
    | 'editPath'
  >
  scenes: Pick<FrameScenes, 'scene'>
  boxes: Pick<
    EditorBoxes,
    'roots' | 'startBoxes' | 'boxIn' | 'selectionBox' | 'pickable' | 'drawnInFlow' | 'cropTarget'
  >
  pen: Pick<EditorPen, 'drawing' | 'finish' | 'deletePoints'>
  transformDrag: Pick<EditorTransformDrag, 'writeBoxes'>
  autoLayoutDrag: Pick<EditorAutoLayoutDrag, 'nudge'>
  /** Tells the app that auto layout places some of the layers an align or distribute would move. */
  notify: (notice: 'placedByLayout') => void
  /** Draws the overlay. */
  drawOverlay: () => void
}

export interface EditorActions {
  /**
   * Does what a shortcut names. Returns whether there was anything to do it to; the keys that act
   * on the selection do nothing without one. Undo and redo are the editor's, which ends what is
   * open on the stage first: they do nothing here.
   */
  perform(action: ShortcutAction): boolean
  /** Fits the selection in view, else the picked frame, else the shown page's frames. */
  fitSelection(): void
}

/** Which way each arrow moves what it nudges, in steps along x and y. */
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  nudgeLeft: [-1, 0],
  nudgeRight: [1, 0],
  nudgeUp: [0, -1],
  nudgeDown: [0, 1],
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

  /** Combines the selected shapes into a live boolean (#44) and selects it. One undo step. */
  function combine(op: 'union' | 'subtract' | 'intersect' | 'exclude') {
    const current = selection.current()
    const frame = current && frameOf(current.frameId)
    if (!frame) return
    let id = ''
    if (
      runQuietly(() => {
        id = session.run('node.boolean', {
          ids: boxes.roots(),
          op,
          drawn: boxes.drawnInFlow(boxes.roots()),
        })
      })
    )
      selection.select([id], frame.id)
  }

  /**
   * Moves each selected layer, with what is inside it, by an offset worked out from the boxes
   * around them as drawn: align and distribute (#42). One undo step.
   */
  function arrange(offsets: (boxes: Rect[], within: Rect) => Offset[]) {
    const current = selection.current()
    const frame = current && frameOf(current.frameId)
    if (!frame) return false
    const now = session.design()
    const ids = boxes.roots(now)
    if (ids.some((id) => inFlow(id, now))) notify('placedByLayout')
    const free = ids.filter((id) => !inFlow(id, now))
    if (free.length === 0) return true
    return arrangeFree(frame, free, offsets, now)
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

  /** Moves the selection by whole pixels in its frame, one undo step per press. */
  function nudge(dx: number, dy: number) {
    const current = selection.current()
    const frame = current && frameOf(current.frameId)
    if (!frame) return
    const ids = boxes.roots()
    const now = session.design()
    if (ids.some((id) => inFlow(id, now))) {
      autoLayoutDrag.nudge(ids, dx, dy, now)
      return
    }
    const start = boxes.startBoxes(frame, ids)
    // Arrows move along the frame as drawn, also inside a turned group.
    const around = boxes.selectionBox()?.around ?? []
    const step = localTo(
      { x: dx, y: dy },
      around.map((b) => ({ ...b, x: -b.width / 2, y: -b.height / 2 })),
    )
    session.gesture(() => {
      transformDrag.writeBoxes(
        frame,
        start,
        new Map([...start].map(([id, b]) => [id, { ...b, x: round(b.x + step.x), y: round(b.y + step.y) }])),
      )
      hug(ids)
    })
  }

  /**
   * Selects every top-level layer that can be picked in the selection's frame; with nothing
   * selected, in the picked frame, else the frame last selected in on the shown page, else the
   * frame nearest the middle of the view.
   */
  function selectAll() {
    const frame =
      frameOf(selection.current()?.frameId) ??
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
    if (picked !== null && !selection.current()) return frameAction(action, picked)
    const current = selection.current()
    const frame = current && frameOf(current.frameId)
    if (!current || !frame) return false
    const ids = boxes.roots()
    const nodes = session.design().nodes
    const far = action.endsWith('Far') ? NUDGE_FAR : NUDGE
    switch (action) {
      case 'deselect': {
        // Out of a group or box one level at a time: it gets selected, then nothing.
        const up = selection.entered()
        const parent = up ? drawn().nodes[up]?.parentId : undefined
        selection.enter(parent && drawn().nodes[parent] ? parent : null)
        selection.select(up ? [up] : [], frame.id)
        break
      }
      case 'delete': {
        const parents = ids.map((id) => nodes[id]?.parentId ?? '').filter((id) => nodes[id])
        if (
          runQuietly(() =>
            session.gesture(() => {
              session.run('node.delete', { ids })
              hug(parents)
            }),
          )
        )
          selection.select([], frame.id)
        break
      }
      case 'group': {
        let group = ''
        if (
          runQuietly(() => {
            group = session.run('node.group', { ids, drawn: boxes.drawnInFlow(ids) })
          })
        )
          selection.select([group], frame.id)
        break
      }
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
        const [only] = current.ids
        if (current.ids.length !== 1 || !only || nodes[only]?.lock?.style) return false
        if (boxes.cropTarget(frame, only)) selection.crop({ id: only, frameId: frame.id })
        else if (isPath(session.design(), only)) selection.editPath({ id: only, frameId: frame.id })
        else return false
        break
      }
      case 'mask': {
        // One layer becomes a mask for the layers after it in its parent, or plain again. Several
        // are grouped first, and the bottom one masks the rest (#48).
        if (ids.length === 1) {
          const on = !nodes[ids[0] ?? '']?.props.mask
          runQuietly(() => session.run('node.mask', { ids, mask: on ? 'alpha' : null }))
          break
        }
        let group = ''
        if (
          runQuietly(() =>
            session.gesture(() => {
              group = session.run('node.group', { ids, drawn: boxes.drawnInFlow(ids) })
              const [[bottom] = []] = childrenOf(session.design(), group)
              if (bottom) session.run('node.mask', { ids: [bottom], mask: 'alpha' })
            }),
          )
        )
          selection.select([group], frame.id)
        break
      }
      case 'boxSelection': {
        let boxed = ''
        if (
          runQuietly(() => {
            boxed = session.run('node.box', { ids, drawn: boxes.drawnInFlow(ids) })
          })
        )
          selection.select([boxed], frame.id)
        break
      }
      case 'autoLayout': {
        // Selected boxes: auto layout on, or off when every one has it already (#46).
        if (ids.length === 0) return false
        const boxIds = ids.filter((id) => nodes[id]?.type === 'box')
        if (boxIds.length > 0) {
          const on = !boxIds.every((id) => {
            const node = nodes[id]
            return node?.type === 'box' && node.props.layout !== undefined
          })
          runQuietly(() =>
            session.gesture(() => {
              for (const id of boxIds) session.run('node.autoLayout', { id, on })
            }),
          )
          break
        }
        // Layers none of which is a box are wrapped in a box that hugs them, its layout read off
        // where they are: layers already in an even row or column don't move.
        let boxed = ''
        if (
          runQuietly(() =>
            session.gesture(() => {
              boxed = session.run('node.box', { ids, drawn: boxes.drawnInFlow(ids) })
              session.run('node.autoLayout', { id: boxed, on: true })
              session.run('node.update', { ids: [boxed], patch: { sizing: { width: 'hug', height: 'hug' } } })
            }),
          )
        )
          selection.select([boxed], frame.id)
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
        // Booleans come apart the same way, their shapes showing their own paints again.
        const groups = ids.filter((id) => nodes[id]?.type === 'group' || nodes[id]?.type === 'boolean')
        if (groups.length === 0) return false
        let freed: string[] = []
        if (
          runQuietly(() => {
            freed = session.run('node.ungroup', { ids: groups })
          })
        ) {
          selection.select([...ids.filter((id) => !groups.includes(id)), ...freed], frame.id)
        }
        break
      }
      case 'duplicate': {
        let copies: string[] = []
        if (
          runQuietly(() => {
            copies = session.run('node.duplicate', { ids })
          })
        )
          selection.select(copies, frame.id)
        break
      }
      case 'bringForward':
        runQuietly(() => session.run('node.reorder', { ids, to: 'forward' }))
        break
      case 'sendBackward':
        runQuietly(() => session.run('node.reorder', { ids, to: 'backward' }))
        break
      case 'bringToFront':
        runQuietly(() => session.run('node.reorder', { ids, to: 'front' }))
        break
      case 'sendToBack':
        runQuietly(() => session.run('node.reorder', { ids, to: 'back' }))
        break
      case 'lock': {
        // Locks every flag, or unlocks them all when every selected layer is already locked.
        const locked = current.ids.every((id) => LOCK_FLAGS.every((flag) => nodes[id]?.lock?.[flag]))
        runQuietly(() =>
          session.run('node.lock', {
            ids: current?.ids ?? [],
            lock: Object.fromEntries(LOCK_FLAGS.map((flag) => [flag, !locked])),
          }),
        )
        break
      }
      case 'hide': {
        // Hidden in its frame, its linked copies left as they are; the layer stays selected so it can be shown again.
        const shown = current.ids.some((id) => visibleIn(session.design(), id))
        runQuietly(() => session.run('node.update', { ids: current?.ids ?? [], patch: { visible: !shown } }))
        break
      }
      case 'nudgeLeft':
      case 'nudgeLeftFar':
        nudge(-far, 0)
        break
      case 'nudgeRight':
      case 'nudgeRightFar':
        nudge(far, 0)
        break
      case 'nudgeUp':
      case 'nudgeUpFar':
        nudge(0, -far)
        break
      case 'nudgeDown':
      case 'nudgeDownFar':
        nudge(0, far)
        break
      default:
        return false
    }
    drawOverlay()
    return true
  }

  /**
   * What a key does to the picked frame: Esc lets it go, Delete deletes it with its layers, Mod+D
   * duplicates it and picks the copy, and the arrows move it; each is one undo step. The layers'
   * other keys do nothing to it.
   */
  function frameAction(action: ShortcutAction, frameId: string): boolean {
    const arrow = ARROWS[action.replace(/Far$/, '')]
    const far = action.endsWith('Far') ? NUDGE_FAR : NUDGE
    const stored = session.design().frames[frameId]
    if (arrow && stored) {
      // Another tab may have deleted the frame a moment ago; the key then does nothing.
      runQuietly(() =>
        session.run('frame.update', { frameId, x: stored.x + arrow[0] * far, y: stored.y + arrow[1] * far }),
      )
    } else if (action === 'deselect') {
      selection.pickFrame(null)
    } else if (action === 'delete') {
      runQuietly(() => session.run('frame.delete', { frameId }))
      selection.pickFrame(null)
    } else if (action === 'duplicate') {
      let copy = ''
      if (runQuietly(() => (copy = session.run('frame.duplicate', { frameId })))) selection.pickFrame(copy)
    } else {
      return false
    }
    drawOverlay()
    return true
  }

  return {
    perform,
    fitSelection,
  }
}
