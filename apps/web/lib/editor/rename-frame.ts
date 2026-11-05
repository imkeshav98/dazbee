import type { Editor } from '@dazbee/editor'

/**
 * Names a frame what was typed in its rename field, on the stage or in the layers panel, as one
 * undo step: trimmed, and only when it is not empty, differs from the frame's name, and the frame is
 * still there. A field closed with Escape passes null and keeps the name.
 */
export function renameFrame(editor: Editor, frameId: string, typed: string | null) {
  const name = typed?.trim()
  const frame = editor.design().frames[frameId]
  if (name && frame && name !== frame.name) editor.session.run('frame.update', { frameId, name })
}
