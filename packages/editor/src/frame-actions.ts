// What the keys and menus do to a frame: the picked frame's keys (Esc, Delete, Duplicate and the
// arrows), adding a frame of a size or a size of a frame, and showing a frame just added.
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

/** A frame's width and height. */
export interface Size {
  width: number
  height: number
}

export interface EditorFrameActions {
  /** What a key does to the picked frame; false for a key that does nothing to it. */
  frameAction(action: ShortcutAction, frameId: string): boolean
  /**
   * Adds an empty white frame of a size to the shown page, named after the size, where the frame
   * rule puts it, as one undo step, then shows it as `showAdded` does. Returns its id; null, with
   * nothing changed, for a size past the limits.
   */
  addFrame(size: Size): string | null
  /**
   * Add size: a frame of a size on a frame's page, holding linked copies of its layers laid out to
   * fit, under its name, where the frame rule puts it, as one undo step, then shown as `showAdded`
   * does. Returns its id; null, with nothing changed, for a frame gone or a size past the limits.
   */
  addSize(frameId: string, size: Size): string | null
  /**
   * Shows a frame just added: picks it, the select tool back, and brings it whole into view with
   * its label beside the chrome (`showArea`). Nothing for a frame gone.
   */
  showAdded(frameId: string): void
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
   * duplicates it and picks the copy, showing it whole beside the chrome (`showArea`), and the
   * arrows move it; each is one undo step. The layers' other keys do nothing to it.
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

  function addFrame({ width, height }: Size) {
    return added(() => session.run('frame.add', { pageId: page(), name: frameName(width, height), width, height }))
  }

  function addSize(frameId: string, { width, height }: Size) {
    return added(() => session.run('frame.addSize', { frameId, width, height }))
  }

  function showAdded(frameId: string) {
    const made = session.design().frames[frameId]
    if (!made) return
    tools.setTool('select')
    selection.pickFrame(frameId)
    showArea({ x: made.x, y: made.y, width: made.width, height: made.height })
    drawOverlay()
  }

  /** Runs a command that adds a frame and shows the frame: its id, or null when the command refused. */
  function added(add: () => string): string | null {
    let id = ''
    if (!runQuietly(() => (id = add()))) return null
    showAdded(id)
    return id
  }

  return {
    frameAction,
    addFrame,
    addSize,
    showAdded,
    onFrameDelete: frameDeletes.on,
  }
}
