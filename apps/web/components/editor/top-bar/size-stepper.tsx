'use client'

import { MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { shortcutFor } from '@dazbee/editor'

import { type Target, textStyle } from '@/components/editor/edit-panel/target.ts'
import { NumberInput, useNumberInput } from '@/components/editor/number-input.tsx'
import { LIMITS } from '@/lib/editor/limits.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

/**
 * The text's size on the bar: smaller, the size as a number input, bigger. The size takes the
 * number input's press and caret, selected in the stronger tint as it lies on the bar's glass, and
 * the stepper's edge is the accent while it is typed in.
 */
export function SizeStepper({ target }: { target: Target }) {
  const t = useMessages()
  const { style, setStyle, shiftStyle } = textStyle(target)
  const size = style('fontSize') as number | 'mixed'
  const shown = size === 'mixed' ? '' : String(Math.round(size * 10) / 10)
  // What is being typed, until Enter, leaving the field or Esc; the size shows otherwise.
  const [draft, setDraft] = useState<string | null>(null)
  const entry = useNumberInput()
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
      data-typing={entry.typing ? '' : undefined}
      className="flex h-[30px] shrink-0 items-center rounded-row border border-line transition-colors duration-[var(--chrome-fast)] data-typing:border-accent"
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
      <div {...entry.knob} className="flex h-full w-10 cursor-text items-center justify-center overflow-hidden">
        <NumberInput
          entry={entry}
          text={draft ?? shown}
          hint="--"
          strong
          name="font-size"
          aria-label={t.editor.props.fontSize}
          data-testid="bar-size-field"
          onChange={(event) => setDraft(event.target.value)}
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
            if (event.key === 'Escape') {
              // What was typed is thrown away, its size chosen again, so a size typed next replaces it.
              if (draft !== null) entry.reselect()
              setDraft(null)
            }
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
        />
      </div>
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
