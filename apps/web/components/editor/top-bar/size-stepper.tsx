'use client'

import { MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { shortcutFor } from '@dazbee/editor'

import { type Target, textStyle } from '@/components/editor/edit-panel/target.ts'
import { FOCUS_RING } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { LIMITS } from '@/lib/editor/limits.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

/** The text's size on the bar: smaller, the size as a field to type into, bigger. */
export function SizeStepper({ target }: { target: Target }) {
  const t = useMessages()
  const { style, setStyle, shiftStyle } = textStyle(target)
  const size = style('fontSize') as number | 'mixed'
  const shown = size === 'mixed' ? '' : String(Math.round(size * 10) / 10)
  // What is being typed, until Enter, leaving the field or Esc; the size shows otherwise.
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (text: string) => {
    const n = Number(text)
    if (text.trim() !== '' && Number.isFinite(n) && n >= 1)
      setStyle('fontSize', Math.round(Math.min(n, LIMITS.fontSize) * 10) / 10)
    setDraft(null)
  }
  return (
    <div
      role="group"
      aria-label={t.editor.props.fontSize}
      data-testid="bar-size"
      className="flex h-[30px] shrink-0 items-center rounded-row border border-line"
    >
      <button
        type="button"
        data-bar-item
        aria-label={t.editor.bar.smaller}
        title={t.editor.bar.smaller}
        onClick={() => shiftStyle('fontSize', -1, 1, 0, LIMITS.fontSize)}
        className="grid h-full w-6 cursor-pointer place-items-center rounded-s-row text-muted hover:bg-hover hover:text-text"
      >
        <MinusIcon size={12} aria-hidden />
      </button>
      <input
        name="font-size"
        aria-label={t.editor.props.fontSize}
        value={draft ?? shown}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="--"
        inputMode="decimal"
        data-testid="bar-size-field"
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          event.stopPropagation()
          // Undo and redo are the design's while nothing is being typed, as in the panels' fields.
          const action = shortcutFor(event.nativeEvent)
          if (draft === null && (action === 'undo' || action === 'redo')) {
            event.preventDefault()
            target.editor.perform(action)
            return
          }
          if (event.key === 'Enter') commit(event.currentTarget.value)
          if (event.key === 'Escape') setDraft(null)
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            setDraft(null)
            shiftStyle(
              'fontSize',
              (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1),
              1,
              0,
              LIMITS.fontSize,
            )
          }
        }}
        onBlur={(event) => draft !== null && commit(event.currentTarget.value)}
        className={cn(
          'h-full w-10 bg-transparent text-center font-mono text-[12px] tabular-nums text-text outline-none',
          FOCUS_RING,
        )}
      />
      <button
        type="button"
        data-bar-item
        aria-label={t.editor.bar.bigger}
        title={t.editor.bar.bigger}
        onClick={() => shiftStyle('fontSize', 1, 1, 0, LIMITS.fontSize)}
        className="grid h-full w-6 cursor-pointer place-items-center rounded-e-row text-muted hover:bg-hover hover:text-text"
      >
        <PlusIcon size={12} aria-hidden />
      </button>
    </div>
  )
}
