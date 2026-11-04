'use client'

import { useState } from 'react'

import { RenameField, useFocusBack } from '@/components/ui/rename-field.tsx'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

/**
 * The design's name in the crumb (#159): a click or Enter on it makes it a field; Enter or leaving
 * the field saves a new name, Esc keeps the old one.
 */
export function DesignName({
  name,
  onRename,
}: {
  name: string
  onRename?: ((name: string) => Promise<void>) | undefined
}) {
  const t = useMessages()
  const [editing, setEditing] = useState(false)
  const focusBack = useFocusBack()
  const title = 'font-display text-sm font-semibold tracking-tight'
  if (!onRename) return <h1 className={cn(title, 'truncate')}>{name}</h1>
  if (!editing) {
    // The button's hover fill reaches past the words on both sides, so the heading is pulled out by
    // as much; the button, not the heading, ends the name in "…" when the crumb has no room for it.
    return (
      <h1 className={cn(title, '-mx-1 min-w-0')}>
        <button
          ref={focusBack.ref('name')}
          type="button"
          title={format(t.library.renameDesign, { name })}
          onClick={() => setEditing(true)}
          className="max-w-full cursor-text truncate rounded-[6px] px-1 hover:bg-hover"
        >
          {name}
        </button>
      </h1>
    )
  }
  return (
    <RenameField
      name={name}
      label={format(t.library.renameDesign, { name })}
      inputName="design-name"
      maxLength={120}
      className="h-7 w-48 min-w-0 rounded-[6px] border border-accent bg-bg px-1.5 font-display text-sm font-semibold tracking-tight outline-none"
      onDone={(next, byKey) => {
        if (byKey) focusBack.mark('name')
        setEditing(false)
        const trimmed = next?.trim()
        if (trimmed && trimmed !== name) void onRename(trimmed)
      }}
    />
  )
}
