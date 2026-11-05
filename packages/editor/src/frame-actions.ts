// What the keys and menus do to a frame: the picked frame's keys (Esc, Delete, Duplicate and the
// arrows), and adding a frame of a size, or a size of a frame.
import type { Session } from '@dazbee/doc'

import type { EditorView } from './canvas/view.ts'
import { listenerSet } from './listener-set.ts'
import { runQuietly } from './run-quietly.ts'
import type { EditorSelection } from './selection.ts'
import { NUDGES, type ShortcutAction } from './shortcuts.ts'
import type { EditorTools } from './tools.ts'

export interface FrameActionsDeps {
  session: Session
  view: Pick<EditorView, 'page' | 'showArea'>
  tools: Pick<EditorTools, 'setTool'>
  /** The name a frame added from a size takes, in the app's words. */
  frameName: (width: number, height: number) => string
  selection: Pick<EditorSelection, 'pickFrame'>
  /** Draws the overlay. */
  drawOverlay: () => void
}

export interface EditorFrameActions {
  frameAction(action: ShortcutAction, frameId: string): boolean
  /**
   * Adds an empty frame of a size to the shown page, named after the size; or, from a frame, a
   * frame of that size on its page holding linked copies of its layers laid out to fit, under its
   * name (Add size). Either goes where the frame rule puts it, as one undo step; it is picked and
   * shown at the same zoom, and the select tool comes back. Null, with nothing changed, for a size
   * past the limits or a frame gone.
   */
  addFrame(size: { width: number; height: number }, from?: string): string | null
  /** Calls back with a frame's name once Delete has deleted it as the picked frame, so the page can offer its undo. */
  onFrameDelete(listener: (name: string) => void): () => boolean
}

export function editorFrameActions({
  session,
  view: { page, showArea },
  tools,
  frameName,
  selection,
  drawOverlay,
}: FrameActionsDeps): EditorFrameActions {
  /** Told of each frame Delete deleted, by its name. */
  const frameDeletes = listenerSet<[name: string]>()

  /**
   * What a key does to the picked frame: Esc lets it go, Delete deletes it with its layers, Mod+D
   * duplicates it and picks the copy, panning to show it at the same zoom, and the arrows move it;
   * each is one undo step. The layers' other keys do nothing to it.
   */
  function frameAction(action: ShortcutAction, frameId: string): boolean {
    const step = NUDGES[action]
    const stored = session.design().frames[frameId]
    if (step && stored) {
      // Another tab may have deleted the frame a moment ago; the key then does nothing.
      runQuietly(() => session.run('frame.update', { frameId, x: stored.x + step[0], y: stored.y + step[1] }))
    } else if (action === 'deselect') {
      selection.pickFrame(null)
    } else if (action === 'delete') {
      if (stored && runQuietly(() => session.run('frame.delete', { frameId }))) frameDeletes.emit(stored.name)
      selection.pickFrame(null)
    } else if (action === 'duplicate') {
      let copy = ''
      if (runQuietly(() => (copy = session.run('frame.duplicate', { frameId })))) selection.pickFrame(copy)
      const made = session.design().frames[copy]
      if (made) showArea({ x: made.x, y: made.y, width: made.width, height: made.height })
    } else {
      return false
    }
    drawOverlay()
    return true
  }

  function addFrame({ width, height }: { width: number; height: number }, from?: string) {
    let id = ''
    const added = runQuietly(() => {
      id = from
        ? session.run('frame.addSize', { frameId: from, width, height })
        : session.run('frame.add', { pageId: page(), name: frameName(width, height), width, height })
    })
    const made = session.design().frames[id]
    if (!added || !made) return null
    tools.setTool('select')
    selection.pickFrame(id)
    showArea({ x: made.x, y: made.y, width, height })
    drawOverlay()
    return id
  }

  return {
    frameAction,
    addFrame,
    onFrameDelete: frameDeletes.on,
  }
}
