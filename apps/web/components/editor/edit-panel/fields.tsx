'use client'

// The edit panels' fields and parts: a number that types, nudges and scrubs, a colour with its hex
// and opacity, a choice from a list, a part of a panel under its heading, a switch, and a row of
// segments.
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'

import { type Editor, shortcutFor } from '@dazbee/editor'
import { alphaOf } from '@dazbee/schema'

import {
  FACE_SIZE,
  FIELD,
  KNOB,
  PANEL_PART,
  SELECT,
  SQUARE_SWATCH_TARGET,
  SWITCH,
  SWITCH_ROW,
  TOUCH_GAP,
  VALUE_TEXT,
} from '@/components/editor/styles.ts'
import { SEGMENT, SEGMENTS } from '@/components/ui/looks.ts'
import { Select } from '@/components/ui/select.tsx'
import { cn } from '@/lib/cn.ts'
import { alphaChange, hexChange, hexOf } from '@/lib/colour.ts'
import { fillOf } from '@/lib/editor/fill.ts'
import { LIMITS } from '@/lib/editor/limits.ts'
import { tidy } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

export const clamp = (n: number, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) =>
  Math.min(max, Math.max(min, n))

/**
 * Whether the focus is in a number field with something typed in it. Such a field is the top-most
 * thing: Esc throws away what was typed and keeps the field, so the menu or panel it is in closes
 * only on the next Esc.
 */
export const typingIn = (at: Element | null) => at?.matches('input[data-draft]') === true

/**
 * What is being typed into a field, null when nothing is: `typed.current` has it as soon as it is
 * typed, before the field draws again, for a key or a blur that comes right after.
 */
function useDraft() {
  const [draft, setState] = useState<string | null>(null)
  const typed = useRef<string | null>(null)
  const setDraft = (to: string | null) => {
    typed.current = to
    setState(to)
  }
  return [draft, setDraft, typed] as const
}

/**
 * A number, as a knob: drag it sideways to scrub the value (Shift for 10 times, Alt for a tenth on a
 * field with fractional steps), one undo step for the whole drag; click it, or tab to it, and type a
 * value and press Enter; nudge it with the arrow keys (Shift for 10), and undo or redo the design with
 * its keys while nothing is being typed. With `min` and `max`, or
 * `fillRange` for a fill that doesn't hold the value in, a fill behind it shows where the value sits
 * between them; a range either side of 0 fills from 0 out, each way. Home and End go to `min` and
 * `max`. A value typed, stepped or dragged stops at `min` and `max`, or without them at
 * `LIMITS.any` either way. Steps are in the value as shown, after `scale`.
 * With `onClear`, emptying the field calls it, for a value that can be left unset (its placeholder
 * shows then), mixed values too once something was typed; without, an empty field is ignored.
 */
export function NumberField({
  label,
  name,
  value,
  step = 1,
  min: least,
  max: most,
  fillRange,
  scale = 1,
  unit = '',
  placeholder,
  editor,
  testId,
  className,
  onSet,
  onShift,
  onClear,
}: {
  label: string
  name: string
  value: number | 'mixed' | undefined
  step?: number
  min?: number | undefined
  max?: number | undefined
  /** The range the fill shows the value in, where it differs from `min` and `max`. */
  fillRange?: readonly [number, number]
  /** Shown as the value times this, such as 100 for a percentage. */
  scale?: number
  /** Shown after the value: %, ° or px. */
  unit?: string | undefined
  placeholder?: string
  /** Makes a drag one undo step; without one, a drag is as many changes as it makes. */
  editor?: Editor
  testId?: string
  /** Looks laid over the knob's, such as its height on a phone. */
  className?: string
  onSet: (value: number) => void
  onShift: (by: number) => void
  onClear?: () => void
}) {
  const t = useMessages()
  const input = useRef<HTMLInputElement>(null)
  // What a value typed, stepped or dragged stops at: the field's own limits, or, without, where a
  // design would only break. `least` and `most` are the field's own, for its fill and Home and End.
  const min = least ?? -LIMITS.any
  const max = most ?? LIMITS.any
  /** A step from the value shown, cut short at `min` and `max`; with values the layers don't share, each layer's own steps. */
  const shift = (by: number) => {
    if (typeof value !== 'number') return onShift(by)
    const to = clamp(value + by, min, max) - value
    if (to !== 0) onShift(to)
  }
  const shown = value === undefined || value === 'mixed' ? '' : String(tidy(value * scale))
  const [draft, setDraft, typedNow] = useDraft()
  const [typing, setTyping] = useState(false)
  const press = useRef<{ x: number; applied: number; end: (() => void) | null } | null>(null)
  /** Whether Home and End have a lowest and a highest value to go to. */
  const hasEnds =
    least !== undefined && most !== undefined && Number.isFinite(least) && Number.isFinite(most) && most > least
  const fill = fillOf(value, fillRange ?? (least !== undefined && most !== undefined ? [least, most] : undefined))
  /** One step, or ten with Shift, or a tenth with Alt where the steps are fractions. */
  const stepOf = (event: { shiftKey: boolean; altKey: boolean }) =>
    step * (event.shiftKey ? 10 : event.altKey && step < 1 ? 0.1 : 1)
  const commit = (text: string) => {
    const typed = typedNow.current !== null
    setDraft(null)
    if (text.trim() === '') {
      if (onClear && (shown !== '' || (value === 'mixed' && typed))) onClear()
      return
    }
    const n = Number.parseFloat(text.replace(',', '.'))
    if (Number.isFinite(n) && text.trim() !== shown) onSet(clamp(n / scale, min, max))
  }
  const release = (focus: boolean) => {
    const p = press.current
    press.current = null
    if (!p) return
    if (p.end) p.end()
    else if (focus) input.current?.focus()
  }
  // A drag the card is taken away in the middle of still ends its undo step.
  useEffect(() => () => press.current?.end?.(), [])
  return (
    <div
      data-scrub={name}
      title={format(t.editor.props.scrub, { name })}
      data-ranged={fill.at === null ? undefined : ''}
      style={
        { '--fill-from': `${fill.from}%`, '--fill': `${fill.width}%`, '--fill-at': `${fill.at ?? 0}%` } as CSSProperties
      }
      onPointerDown={(event) => {
        // A press on the field being typed in places the caret; anywhere else it starts a drag.
        if (event.button !== 0 || (typing && event.target === input.current)) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        press.current = { x: event.clientX, applied: 0, end: null }
      }}
      onMouseDown={(event) => {
        // Some browsers focus on the mouse press even when the pointer press was taken.
        if (!(typing && event.target === input.current)) event.preventDefault()
      }}
      onPointerMove={(event) => {
        const p = press.current
        if (!p || (!p.end && Math.abs(event.clientX - p.x) < 3)) return
        if (!p.end) setDraft(null)
        p.end ??= editor?.beginGesture() ?? (() => undefined)
        const by = Math.round((event.clientX - p.x) / 2) * stepOf(event)
        if (by === p.applied) return
        shift((by - p.applied) / scale)
        p.applied = by
      }}
      onPointerUp={() => release(true)}
      onPointerCancel={() => release(false)}
      onLostPointerCapture={() => release(false)}
      className={cn(KNOB, className)}
    >
      <span className="relative min-w-0 truncate">{label}</span>
      <input
        ref={input}
        name={name}
        role="spinbutton"
        aria-label={name}
        aria-valuenow={typeof value === 'number' ? tidy(value * scale) : undefined}
        aria-valuemin={least === undefined || !Number.isFinite(least) ? undefined : tidy(least * scale)}
        aria-valuemax={most === undefined || !Number.isFinite(most) ? undefined : tidy(most * scale)}
        aria-valuetext={value === 'mixed' ? t.editor.props.mixed : shown ? `${shown}${unit}` : placeholder}
        data-testid={testId}
        data-draft={draft === null ? undefined : ''}
        inputMode="decimal"
        value={draft ?? shown}
        placeholder={value === 'mixed' ? t.editor.props.mixed : placeholder}
        onFocus={(event) => {
          setTyping(true)
          // What is typed replaces the value.
          event.currentTarget.select()
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          setTyping(false)
          if (typedNow.current !== null) commit(event.target.value)
        }}
        onKeyDown={(event) => {
          // Undo and redo are the design's while nothing is being typed; once something is, the
          // field's own, taking back what was typed.
          const action = shortcutFor(event.nativeEvent)
          if (editor && typedNow.current === null && (action === 'undo' || action === 'redo')) {
            event.preventDefault()
            editor.perform(action)
          } else if (event.key === 'Enter') commit(event.currentTarget.value)
          else if (event.key === 'Escape') {
            // What was typed is thrown away and the field keeps the focus, its value chosen again;
            // with nothing typed, the field lets go of the focus.
            const typed = typedNow.current !== null
            setDraft(null)
            if (typed) requestAnimationFrame(() => input.current?.select())
            else event.currentTarget.blur()
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            setDraft(null)
            shift(((event.key === 'ArrowUp' ? 1 : -1) * stepOf(event)) / scale)
          } else if ((event.key === 'Home' || event.key === 'End') && hasEnds && draft === null) {
            // A range's ends, as a slider's; while a value is being typed they move the caret.
            event.preventDefault()
            onSet(event.key === 'Home' ? min : max)
          } else return
          // Keys typed into a field are the field's, not the stage's.
          event.stopPropagation()
        }}
        className={cn(
          VALUE_TEXT,
          'relative min-w-[3ch] flex-1 cursor-[inherit] bg-transparent text-end outline-none focus-visible:outline-none! placeholder:text-subtle focus:cursor-text',
          typing && 'select-text',
        )}
      />
      {unit && shown && (
        <span aria-hidden className={cn(VALUE_TEXT, 'relative -ms-2')}>
          {unit}
        </span>
      )}
    </div>
  )
}

/**
 * A colour: a swatch that opens the system picker (unless `swatch` is off, where a swatch beside it
 * does more), the hex, and its opacity as a percentage. A
 * change gives `onSet` the colour to build from the one the document holds then, so a hex and an
 * opacity committed one after the other each keep the other's change.
 */
export function ColorField({
  name,
  value,
  swatch = true,
  onSet,
}: {
  name: string
  value: string | 'mixed' | undefined
  swatch?: boolean
  onSet: (to: (now: string | undefined) => string) => void
}) {
  const t = useMessages()
  const p = t.editor.props
  const hex = value && value !== 'mixed' ? hexOf(value).toUpperCase() : ''
  const alpha = value && value !== 'mixed' ? alphaOf(value) : undefined
  const [draft, setDraft, typedNow] = useDraft()
  const commitHex = (text: string) => {
    setDraft(null)
    const h = (text.startsWith('#') ? text : `#${text}`).toUpperCase()
    if (/^#[0-9A-F]{6}$/.test(h) && h !== hex) onSet(hexChange(h))
  }
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-1', TOUCH_GAP)}>
      {swatch && (
        // The label is the box's target: on a phone a press round the box opens the picker too.
        <label className={SQUARE_SWATCH_TARGET}>
          <input
            name="colour"
            type="color"
            aria-label={format(p.colourOf, { name })}
            value={hex || '#000000'}
            onChange={(event) => onSet(hexChange(event.target.value.toUpperCase()))}
            className={cn(FACE_SIZE, 'size-7 cursor-pointer rounded-row border border-line bg-surface p-0.5')}
          />
        </label>
      )}
      {/* A hex reads left to right in every language, with its # first. */}
      <input
        name="colour-hex"
        dir="ltr"
        aria-label={format(p.hexOf, { name })}
        value={draft ?? hex}
        placeholder={value === 'mixed' ? p.mixed : ''}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => typedNow.current !== null && commitHex(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitHex(event.currentTarget.value)
          event.stopPropagation()
        }}
        className={cn(FIELD, 'uppercase')}
      />
      <input
        name="colour-opacity"
        dir="ltr"
        aria-label={format(p.alpha, { name })}
        inputMode="numeric"
        key={alpha ?? 'mixed'}
        defaultValue={alpha === undefined ? '' : String(Math.round(alpha * 100))}
        placeholder={value === 'mixed' ? '–' : ''}
        onBlur={(event) => {
          const n = Number.parseFloat(event.target.value)
          if (Number.isFinite(n) && hex && Math.round(n) !== Math.round((alpha ?? 1) * 100)) onSet(alphaChange(n / 100))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          event.stopPropagation()
        }}
        className={cn(FIELD, 'w-11 shrink-0 text-end')}
      />
    </div>
  )
}

export function Choice<T extends string>({
  name,
  value,
  options,
  labels,
  onSet,
}: {
  name: string
  value: T | 'mixed' | undefined
  options: readonly T[]
  labels: Record<T, string>
  onSet: (value: T) => void
}) {
  const t = useMessages()
  return (
    <Select
      name="choice"
      label={name}
      value={value === 'mixed' || value === undefined ? '' : value}
      placeholder={t.editor.props.mixed}
      options={options.map((option) => ({ value: option, label: labels[option] }))}
      onChange={(next) => onSet(next as T)}
      className={SELECT}
    />
  )
}

/** A part of an edit panel or pop-up: its heading, an action at the end, its controls. Advanced's heading is `strong`. */
export function PanelPart({
  id,
  title,
  note,
  action,
  strong = false,
  children,
}: {
  id: string
  title: string
  note?: string
  action?: ReactNode
  strong?: boolean
  children?: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={PANEL_PART} data-testid={id}>
      <div className="flex h-7 items-center gap-2">
        <h3
          id={`${id}-title`}
          className={cn('min-w-0 flex-1 truncate text-xs font-semibold', strong ? 'text-text' : 'text-muted')}
        >
          {title}
        </h3>
        {note && <span className="min-w-0 max-w-[60%] truncate text-[11px] font-medium text-muted">{note}</span>}
        {action}
      </div>
      {children}
    </section>
  )
}

/** A switch on its own, named by `label`, or with its name beside it as `children`. */
export function Switch({
  on,
  onSet,
  label,
  className,
  children,
}: {
  on: boolean | 'mixed'
  onSet: (on: boolean) => void
  label?: string
  className: string
  children?: ReactNode
}) {
  return (
    // A switch has no mixed state: while the layers differ it is a checkbox that says so.
    <button
      type="button"
      role={on === 'mixed' ? 'checkbox' : 'switch'}
      aria-checked={on}
      aria-label={label}
      onClick={() => onSet(on !== true)}
      className={className}
    >
      {children}
      <span aria-hidden className={SWITCH} />
    </button>
  )
}

/** A row that turns something on or off: its name, then a switch. */
export function SwitchRow({ name, on, onSet }: { name: string; on: boolean | 'mixed'; onSet: (on: boolean) => void }) {
  return (
    <Switch on={on} onSet={onSet} className={SWITCH_ROW}>
      {name}
    </Switch>
  )
}

/** A row of choices of which one is on; `marks` shows a short mark in place of a choice's name. */
export function Segments<T extends string>({
  name,
  value,
  options,
  labels,
  marks,
  onSet,
}: {
  name: string
  value: T | 'mixed'
  options: readonly T[]
  labels: Record<T, string>
  marks?: Record<T, string>
  onSet: (to: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={name} className={SEGMENTS}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          aria-label={marks ? labels[option] : undefined}
          title={marks ? labels[option] : undefined}
          data-value={option}
          onClick={() => onSet(option)}
          className={SEGMENT}
        >
          {marks?.[option] ?? labels[option]}
        </button>
      ))}
    </div>
  )
}
