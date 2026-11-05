// Moving a frame on its page by a drag on its label or its empty area: the frame goes where the
// pointer takes it, in whole design pixels, and the whole drag is one undo step.
import type { Session } from '@dazbee/doc'
import type { Point } from '@dazbee/schema'

import type { Frame } from '../../canvas/frames.ts'
import { runQuietly } from '../../run-quietly.ts'
import { CLICK_SLOP } from '../press.ts'

/** A frame being moved, from the press on its label or empty area until it is let go. */
export interface FrameMoveDrag {
  kind: 'frameMove'
  /** The frame as it was when pressed. */
  frame: Frame
  /** Where the press went down, on the stage and in world units. */
  pressedAt: Point
  from: Point
  /** Ends the drag's undo step; null until the pointer has gone far enough to drag. */
  end: (() => void) | null
}

export interface FrameMoveDeps {
  session: Pick<Session, 'run' | 'beginGesture'>
}

export interface EditorFrameMove {
  /** The drag a press on a frame's label or empty area starts, at `screen` on the stage and `world` on the page. */
  start(frame: Frame, screen: Point, world: Point): FrameMoveDrag
  /**
   * Follows the pointer once it has gone further than a click may wander: the frame moves by as
   * much as the pointer did; Shift keeps it to the axis it went furthest along.
   */
  drag(g: FrameMoveDrag, screen: Point, world: Point, shift: boolean): void
  /** Ends the drag, closing its undo step. */
  release(g: FrameMoveDrag): void
}

export function editorFrameMove({ session }: FrameMoveDeps): EditorFrameMove {
  function start(frame: Frame, screen: Point, world: Point): FrameMoveDrag {
    return { kind: 'frameMove', frame, pressedAt: screen, from: world, end: null }
  }
  function drag(g: FrameMoveDrag, screen: Point, world: Point, shift: boolean) {
    if (!g.end && Math.hypot(screen.x - g.pressedAt.x, screen.y - g.pressedAt.y) < CLICK_SLOP) return
    g.end ??= session.beginGesture()
    let dx = world.x - g.from.x
    let dy = world.y - g.from.y
    if (shift && Math.abs(dx) >= Math.abs(dy)) dy = 0
    else if (shift) dx = 0
    const to = { x: Math.round(g.frame.x + dx), y: Math.round(g.frame.y + dy) }
    // Another tab may delete the frame mid-drag; the drag then just leaves it be.
    runQuietly(() => session.run('frame.update', { frameId: g.frame.id, ...to }))
  }
  function release(g: FrameMoveDrag) {
    g.end?.()
  }

  return {
    start,
    drag,
    release,
  }
}
