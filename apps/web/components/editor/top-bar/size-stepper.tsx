'use client'

import { MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { type Target, textStyle } from '@/components/editor/edit-panel/target.ts'
import { NumberInput, numberKeyDown, useNumberInput } from '@/components/editor/number-input.tsx'
import { LIMITS } from '@/lib/editor/limits.ts'
import { latinDigits } from '@/lib/editor/size.ts'
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
    const n = Number(latinDigits(text))
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
      // On a phone smaller, the size and bigger are three 44 px targets 8 px apart, the size boxed.
      className="flex h-[30px] shrink-0 items-center rounded-row border border-line transition-colors duration-[var(--chrome-fast)] data-typing:border-accent max-sm:h-[44px] max-sm:gap-[8px] max-sm:border-0"
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
      <div
        {...entry.knob}
        className="flex h-full w-10 cursor-text items-center justify-center overflow-hidden max-sm:w-[44px] max-sm:rounded-row max-sm:border max-sm:border-line max-sm:in-data-typing:border-accent"
      >
        <NumberInput
          entry={entry}
          text={draft ?? shown}
          hint="--"
          strong
          name="font-size"
          aria-label={t.editor.props.fontSize}
          data-testid="bar-size-field"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) =>
            numberKeyDown(event, entry, {
              editor: target.editor,
              typed: draft !== null,
              commit,
              discard: () => setDraft(null),
              step: (sign, keys) => shiftStyle('fontSize', sign * (keys.shiftKey ? 10 : 1), 1, 0, LIMITS.fontSize),
            })
          }
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
