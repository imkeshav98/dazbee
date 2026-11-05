'use client'

// The field that renames a frame in place of its label on the stage: a double click on the label,
// or Rename in the picked frame's ⋯ menu, opens it with the name selected, in the label's own row
// with its text where the label's was, see-through as the label is, with an accent line under it.
// The editor leaves the label out meanwhile. Enter or leaving it keeps the new name, as one undo
// step; Escape keeps the old one. It follows the label as the view moves, and ends once the frame
// is gone.
import { useEffect, useState } from 'react'

import type { Editor } from '@dazbee/editor'
import type { Rect } from '@dazbee/schema'

import { takeRenameOpener } from '@/components/editor/edit-store.ts'
import { useLiveDesign } from '@/components/editor/use-live-design.ts'
import { RenameField } from '@/components/ui/rename-field.tsx'
import { renameFrame } from '@/lib/editor/rename-frame.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

/** The frame being renamed, and the menu's button it was asked from, which takes the focus back. */
type Renaming = { frameId: string; opener: HTMLElement | null }

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)

/** Where the frame's label is on the stage, kept current as the view moves and the frame changes. */
function useLabelRect(editor: Editor, frameId: string | null) {
  const [rect, setRect] = useState<Rect | null>(null)
  useEffect(() => {
    if (frameId === null) return
    const follow = () => setRect((now) => (sameRect(now, editor.labelRect(frameId)) ? now : editor.labelRect(frameId)))
    follow()
    const stop = editor.onDraw(follow)
    return () => {
      stop()
    }
  }, [editor, frameId])
  return frameId === null ? null : rect
}

export function FrameRename({ editor }: { editor: Editor }) {
  const t = useMessages()
  const [renaming, setRenaming] = useState<Renaming | null>(null)
  const { design } = useLiveDesign(editor)
  const rect = useLabelRect(editor, renaming?.frameId ?? null)
  useEffect(() => {
    const stop = editor.onFrameRename((frameId) => setRenaming({ frameId, opener: takeRenameOpener() }))
    return () => {
      stop()
    }
  }, [editor])
  const frame = renaming ? design.frames[renaming.frameId] : undefined
  // A frame another tab deleted ends its rename.
  useEffect(() => {
    if (!renaming || frame) return
    setRenaming(null)
    editor.renamed()
  }, [editor, renaming, frame])
  if (!renaming || !frame || !rect) return null
  const done = (name: string | null, byKey: boolean) => {
    setRenaming(null)
    editor.renamed()
    renameFrame(editor, renaming.frameId, name)
    // Ended from the keyboard after Rename in the menu, the focus goes back to the menu's ⋯.
    if (byKey) renaming.opener?.focus()
  }
  return (
    <div
      data-testid="frame-rename"
      data-frame={renaming.frameId}
      className="absolute z-10 flex"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <RenameField
        key={renaming.frameId}
        name={frame.name}
        label={format(t.editor.frames.nameOf, { name: frame.name })}
        inputName="frame-name"
        maxLength={120}
        // The label's own type, its text at the label's start, with a thin accent line under it.
        className="h-full w-full min-w-0 border-0 bg-transparent p-0 font-mono text-[11px] leading-5 font-medium text-accent-text shadow-[inset_0_-1px_0_var(--accent)] outline-none focus-visible:outline-none!"
        onDone={done}
      />
    </div>
  )
}
