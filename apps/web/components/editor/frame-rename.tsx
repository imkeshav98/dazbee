'use client'

// The field that renames a frame in place, over its label on the stage: a double click on the
// label, or Rename in the picked frame's ⋯ menu, opens it with the name selected. Enter or leaving
// it keeps the new name, as one undo step; Escape keeps the old one. It follows the label as the
// view moves, and ends once the frame is gone.
import { useEffect, useState } from 'react'

import type { Editor } from '@dazbee/editor'
import type { Rect } from '@dazbee/schema'

import { useLiveDesign } from '@/components/editor/use-live-design.ts'
import { FOCUS_RING } from '@/components/ui/looks.ts'
import { RenameField } from '@/components/ui/rename-field.tsx'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

/** The frame being renamed, and whether its rename came from the frame's ⋯ menu, whose button takes the focus back. */
type Renaming = { frameId: string; fromMenu: boolean }

/** The field's least width, in pixels, so a name has room on a frame that is narrow on screen. */
const MIN_WIDTH = 160
/** The frame's ⋯ in its top bar, and the menu it opens. */
const MENU_BUTTON = '[data-testid="bar-frame-more"]'
const MENU = '[data-testid="bar-frame-more-menu"]'

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
    const stop = editor.onFrameRename((frameId) =>
      setRenaming({ frameId, fromMenu: document.activeElement?.closest(MENU) !== null }),
    )
    return () => {
      stop()
    }
  }, [editor])
  const frame = renaming ? design.frames[renaming.frameId] : undefined
  // A frame another tab deleted ends its rename.
  useEffect(() => {
    if (renaming && !frame) setRenaming(null)
  }, [renaming, frame])
  if (!renaming || !frame || !rect) return null
  const done = (name: string | null, byKey: boolean) => {
    setRenaming(null)
    const next = name?.trim()
    if (next && next !== frame.name && editor.design().frames[renaming.frameId])
      editor.session.run('frame.update', { frameId: renaming.frameId, name: next })
    // Ended from the keyboard after Rename in the menu, the focus goes back to the menu's ⋯.
    if (byKey && renaming.fromMenu) document.querySelector<HTMLElement>(MENU_BUTTON)?.focus()
  }
  return (
    <div
      data-testid="frame-rename"
      data-frame={renaming.frameId}
      className="absolute z-10"
      style={{ left: rect.x - 4, top: rect.y - 2, width: Math.max(rect.width + 4, MIN_WIDTH) }}
    >
      <RenameField
        key={renaming.frameId}
        name={frame.name}
        label={format(t.editor.frames.nameOf, { name: frame.name })}
        inputName="frame-name"
        maxLength={120}
        className={cn(
          'h-6 w-full rounded-[6px] bg-surface px-1 font-mono text-[12px] font-medium text-text outline outline-1 outline-accent',
          FOCUS_RING,
        )}
        onDone={done}
      />
    </div>
  )
}
