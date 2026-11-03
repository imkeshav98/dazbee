'use client'

// Undo and redo in the header pill, after the design's name: this tab's own changes, as Mod+Z and
// Mod+Shift+Z undo them; each is off while there is nothing for it to do.
import { ArrowArcLeftIcon, ArrowArcRightIcon } from '@phosphor-icons/react'
import { useSyncExternalStore } from 'react'

import type { Editor } from '@dazbee/editor'

import { useMessages } from '../../lib/i18n/client.tsx'
import { format } from '../../lib/i18n/index.ts'
import { keyOf } from './arrange-panel.tsx'

const BUTTON =
  'grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-[var(--chrome-fast)] hover:bg-hover hover:text-text disabled:pointer-events-none disabled:opacity-35'

export function HistoryButtons({ editor }: { editor: Editor }) {
  const t = useMessages()
  const b = t.editor.bar
  const state = useSyncExternalStore(
    (listener) => editor.onHistory(listener),
    () => (editor.canUndo() ? 1 : 0) + (editor.canRedo() ? 2 : 0),
    () => 0,
  )
  return (
    <div
      role="group"
      aria-label={`${b.undo}, ${b.redo}`}
      className="flex shrink-0 items-center border-s border-line ps-1"
    >
      <button
        type="button"
        aria-label={b.undo}
        title={format(t.editor.arrange.withKey, { label: b.undo, key: keyOf('undo') })}
        data-testid="undo"
        disabled={(state & 1) === 0}
        onClick={() => editor.perform('undo')}
        className={BUTTON}
      >
        <ArrowArcLeftIcon size={15} aria-hidden className="rtl:-scale-x-100" />
      </button>
      <button
        type="button"
        aria-label={b.redo}
        title={format(t.editor.arrange.withKey, { label: b.redo, key: keyOf('redo') })}
        data-testid="redo"
        disabled={(state & 2) === 0}
        onClick={() => editor.perform('redo')}
        className={BUTTON}
      >
        <ArrowArcRightIcon size={15} aria-hidden className="rtl:-scale-x-100" />
      </button>
    </div>
  )
}
