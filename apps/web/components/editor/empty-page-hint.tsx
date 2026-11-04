'use client'

import type { Editor } from '@dazbee/editor'

import { useMessages } from '@/lib/i18n/client.tsx'

import { useShownFrames } from './editor-hooks.ts'

/** Over the stage while the shown page has no frames: how to add one. It never takes a click. */
export function EmptyPageHint({ editor }: { editor: Editor }) {
  const t = useMessages()
  const frames = useShownFrames(editor)
  if (frames.length > 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center px-6">
      <p
        role="status"
        data-testid="empty-page"
        className="rounded-full surface-frost px-4 py-2 text-center text-[13px] font-medium text-text"
      >
        {t.editor.frames.emptyPage}
      </p>
    </div>
  )
}
