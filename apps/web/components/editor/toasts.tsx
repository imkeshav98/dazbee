'use client'

import { InfoIcon, TrashIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import type { Editor } from '@dazbee/editor'

import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

import { TOAST } from './styles.ts'

const TOAST_MS = 8000

/** After a format or page is removed: says so, with undo, for a few seconds. */
export function UndoToast({ editor, message, onDone }: { editor: Editor; message: string; onDone: () => void }) {
  const t = useMessages()
  // It stays while the pointer or focus is on it, so the undo can't vanish from under a click.
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (held) return
    const timer = setTimeout(onDone, TOAST_MS)
    return () => clearTimeout(timer)
  }, [message, onDone, held])
  return (
    <div
      role="status"
      data-testid="removed-toast"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={TOAST}
    >
      <TrashIcon size={14} aria-hidden className="text-subtle" />
      <span>{message}</span>
      <Button
        variant="ghost"
        className="h-7 px-2.5 text-xs font-semibold text-accent-text"
        onClick={() => {
          editor.session.undo()
          onDone()
        }}
      >
        {t.editor.formats.undo}
      </Button>
    </div>
  )
}

/**
 * Says why a gesture did nothing, such as a nudge auto layout decides; it goes after a few seconds.
 * A `lasting` one, such as files uploading, stays until its message changes or it is taken away.
 */
export function NoticeToast({
  message,
  onDone,
  lasting = false,
}: {
  message: string
  onDone: () => void
  lasting?: boolean
}) {
  useEffect(() => {
    if (lasting) return
    const timer = setTimeout(onDone, TOAST_MS)
    return () => clearTimeout(timer)
  }, [message, onDone, lasting])
  return (
    <div role="status" data-testid="notice-toast" className={cn(TOAST, 'pe-3.5')}>
      <InfoIcon size={14} aria-hidden className="shrink-0 text-subtle" />
      <span>{message}</span>
    </div>
  )
}
