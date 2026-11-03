'use client'

// The design's sizes, opened from the header pill after the design's name: "Sizes · 3" on
// desktop and tablet, the count alone on a phone. The panel holds what the Sizes card did.
import { FrameCornersIcon } from '@phosphor-icons/react'
import type { Editor } from '@dazbee/editor'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { format } from '../../lib/i18n/index.ts'
import { PanelFrame } from './edit-panel.tsx'
import { setOpen, useEditState } from './edit-store.ts'
import { AddFormat, FormatsPanel, useEditorDesign } from './formats-panel.tsx'
import { FOCUS_RING } from './styles.ts'

export function SizesButton({ editor }: { editor: Editor }) {
  const t = useMessages()
  const { design } = useEditorDesign(editor)
  const { open } = useEditState()
  const count = Object.keys(design.formats).length
  return (
    <button
      type="button"
      data-opens="sizes"
      data-testid="sizes-button"
      aria-expanded={open === 'sizes'}
      aria-label={format(t.editor.formats.button, { n: count })}
      onClick={() => setOpen(open === 'sizes' ? null : 'sizes')}
      className={cn('flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-[12px] font-semibold text-muted transition-colors hover:bg-hover hover:text-text aria-expanded:bg-accent-soft aria-expanded:text-accent-text', FOCUS_RING)}
    >
      <FrameCornersIcon size={14} aria-hidden />
      <span aria-hidden className="max-sm:hidden">{format(t.editor.formats.button, { n: count })}</span>
      <span aria-hidden className="sm:hidden font-mono tabular-nums">{count}</span>
    </button>
  )
}

export function SizesPanel({ editor, onRemoved }: { editor: Editor; onRemoved: (message: string) => void }) {
  const t = useMessages()
  const { design } = useEditorDesign(editor)
  const { open } = useEditState()
  if (open !== 'sizes') return null
  return (
    <PanelFrame id="sizes" title={t.editor.formats.title} note={String(Object.keys(design.formats).length)} action={<AddFormat editor={editor} />}>
      <FormatsPanel editor={editor} onRemoved={onRemoved} bare />
    </PanelFrame>
  )
}
