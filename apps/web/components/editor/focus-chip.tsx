'use client'

import { ArrowsInSimpleIcon } from '@phosphor-icons/react'

import type { Editor } from '@dazbee/editor'

import { Button } from '@/components/ui/button.tsx'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { useEditorDesign } from './editor-hooks.ts'

/** Over the stage while one format shows alone: which one, and the way back to all of them. */
export function FocusChip({ editor }: { editor: Editor }) {
  const t = useMessages()
  const { design, focused } = useEditorDesign(editor)
  const name = focused ? design.formats[focused]?.name : undefined
  if (!focused || name === undefined) return null
  return (
    <div
      role="status"
      data-testid="focus-chip"
      className="pointer-events-auto flex h-9 items-center gap-1 rounded-full surface-frost ps-3.5 pe-1 text-[13px]"
    >
      <ArrowsInSimpleIcon size={14} aria-hidden className="text-accent-text" />
      <span className="ms-1">{format(t.editor.formats.focusing, { name })}</span>
      <Button variant="ghost" className="ms-1 h-7 rounded-full px-2.5 text-xs" onClick={() => editor.focus(null)}>
        {t.editor.formats.exitFocus}
      </Button>
    </div>
  )
}
