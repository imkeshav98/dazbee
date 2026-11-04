'use client'

import { useRef, useState } from 'react'

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
  const done = useRef(false)
  const title = 'font-display text-sm font-semibold tracking-tight'
  if (!onRename) return <h1 className={cn(title, 'truncate')}>{name}</h1>
  if (!editing) {
    // The button's hover fill reaches past the words on both sides, so the heading is pulled out by
    // as much; the button, not the heading, ends the name in "…" when the crumb has no room for it.
    return (
      <h1 className={cn(title, '-mx-1 min-w-0')}>
        <button
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
  const finish = (field: HTMLInputElement, save: boolean) => {
    if (done.current) return
    done.current = true
    const next = field.value.trim()
    setEditing(false)
    if (save && next && next !== name) void onRename(next)
  }
  return (
    <input
      name="design-name"
      aria-label={format(t.library.renameDesign, { name })}
      defaultValue={name}
      maxLength={120}
      autoFocus
      onFocus={(event) => {
        done.current = false
        event.currentTarget.select()
      }}
      onBlur={(event) => finish(event.currentTarget, true)}
      onKeyDown={(event) => {
        // Keys typed into the name are the name's, not the stage's.
        event.stopPropagation()
        if (event.key === 'Enter') finish(event.currentTarget, true)
        else if (event.key === 'Escape') finish(event.currentTarget, false)
      }}
      className="h-7 w-48 min-w-0 rounded-[6px] border border-accent bg-bg px-1.5 font-display text-sm font-semibold tracking-tight outline-none"
    />
  )
}
