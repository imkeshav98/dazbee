'use client'

import { CloudArrowUpIcon, CloudCheckIcon, CloudSlashIcon, type Icon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/cn.ts'
import { useValue, type ValueStore } from '@/lib/editor/value-store.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

/**
 * The design's save state (#37) and how it shows: a small muted cloud while all is well (#110), so
 * it never competes with the work; Offline (and an error) colour it and say so in words.
 */
const SAVE: Record<string, { icon: Icon; tone: string; words?: boolean }> = {
  Saved: { icon: CloudCheckIcon, tone: 'text-subtle' },
  Saving: { icon: CloudArrowUpIcon, tone: 'text-subtle' },
  Offline: { icon: CloudSlashIcon, tone: 'text-warning', words: true },
}
/** Saving stays up at least this long, so a quick edit doesn't flicker the badge. */
const SAVING_HOLD_MS = 600

/**
 * The status to show: the editor's own, except that Saving lingers a moment before Saved, so a
 * stream of edits reads as one save rather than a blink per keystroke.
 */
function useShownStatus(status: string) {
  const [shown, setShown] = useState(status)
  const [savingSince, setSavingSince] = useState(0)
  useEffect(() => {
    if (status === 'Saving' && shown !== 'Saving') {
      setSavingSince(Date.now())
      setShown(status)
      return
    }
    if (status === 'Saved' && shown === 'Saving') {
      const wait = savingSince + SAVING_HOLD_MS - Date.now()
      if (wait > 0) {
        const timer = setTimeout(() => setShown(status), wait)
        return () => clearTimeout(timer)
      }
    }
    setShown(status)
  }, [status, shown, savingSince])
  return shown
}

/** The design's save state at the end of the start island, read from the status store. */
export function SaveStatus({ status, fitted }: { status: ValueStore<string>; fitted: boolean }) {
  const t = useMessages()
  const current = useValue(status)
  const shown = useShownStatus(current)
  const save = SAVE[shown]
  const failed = shown.startsWith('Error')
  return (
    <span
      role="status"
      aria-atomic="true"
      aria-label={t.editor.status}
      data-testid="status"
      data-status={current}
      data-ready={save && fitted ? '' : undefined}
      title={save ? t.editor.statusHint[shown] : undefined}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 text-xs font-medium transition-colors duration-[var(--chrome)]',
        failed ? 'text-danger' : save ? save.tone : 'text-subtle',
      )}
    >
      {save ? (
        <save.icon size={17} aria-hidden className={cn(shown === 'Saving' && 'animate-pulse')} />
      ) : (
        <span aria-hidden className={cn('size-1.5 rounded-full', failed ? 'bg-danger' : 'animate-pulse bg-subtle')} />
      )}
      <span className={cn(!(failed || save?.words) && 'sr-only')}>{t.editor.statusText[shown] ?? shown}</span>
      {shown === 'Offline' && (
        <span className="hidden font-normal text-muted md:inline">{t.editor.statusHint.Offline}</span>
      )}
    </span>
  )
}
