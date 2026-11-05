'use client'

// What every number input does with the pointer and the caret, and how its digits look. A press that
// doesn't move focuses the input with its whole value selected, so what is typed replaces it. In an
// input being typed in, a press beside the digits (on the label, the unit or the room between) puts
// the caret at the end of the value, and a press on the digits places it where it lands. On an input
// that scrubs, a press that moves sideways scrubs the value (lib/editor/scrub.ts), one undo step for
// the whole drag when given the editor. The digits are an input as wide as what it shows, so a press
// beside them lands on the knob around it.
import {
  type ComponentProps,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'

import type { Editor } from '@dazbee/editor'

import { NUMBER_SELECTED, NUMBER_SELECTED_STRONG, NUMBER_TEXT } from '@/components/editor/styles.ts'
import { cn } from '@/lib/cn.ts'
import { type Scrub, scrubBy, type ScrubField, startScrub } from '@/lib/editor/scrub.ts'

/**
 * How a number input scrubs. `value` is the value as shown, null where the layers don't share one, so
 * a drag moves each by the same amount from its own; `field` gives the field as a scrub sees it for
 * the knob's inner width at the press; `onScrub` moves the value by an amount as shown, already held
 * within the field's limits.
 */
export interface NumberScrub {
  value: number | null
  field: (width: number) => ScrubField
  onStart: () => void
  onScrub: (by: number) => void
}

/** What `useNumberInput` gives a number input: its input's ref, the knob's props and the input's. */
export type NumberEntry = ReturnType<typeof useNumberInput>

/** A press under way: where it went down, where the pointer last was, and the scrub once it moves. */
interface Press {
  x: number
  last: number
  /** 1 where the value grows to the right, -1 in a right-to-left field. */
  towardsEnd: 1 | -1
  /** The field as a scrub sees it; null on an input that doesn't scrub. */
  field: ScrubField | null
  scrub: Scrub
  /** Ends the drag's undo step; null until the press moves far enough to be a drag. */
  end: (() => void) | null
}

/** How far a press moves, in px, before it is a drag. */
const DRAG_START = 3

/**
 * The input's ref, the props for a number input's knob (`knob`, the element pressed, and dragged
 * where it scrubs) and for the input inside it (`input`), whether it is being typed in, and
 * `reselect`, which selects the whole value again on the next frame while the input keeps the focus.
 * Without `scrub`, a press that moves is a press.
 */
export function useNumberInput({
  editor,
  scrub,
}: { editor?: Editor | undefined; scrub?: NumberScrub | undefined } = {}) {
  const ref = useRef<HTMLInputElement>(null)
  const [typing, setTyping] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const press = useRef<Press | null>(null)
  /** Whether a press on `target` belongs to the input: one on its digits while it is typed in. */
  const typedAt = (target: EventTarget) => typing && target === ref.current
  const release = (focus: boolean) => {
    const p = press.current
    press.current = null
    if (!p) return
    setScrubbing(false)
    if (p.end) return p.end()
    const el = ref.current
    if (!focus || !el) return
    if (document.activeElement !== el) el.focus()
    else el.setSelectionRange(el.value.length, el.value.length)
  }
  // A drag the card is taken away in the middle of still ends its undo step.
  useEffect(() => () => press.current?.end?.(), [])
  const knob = {
    'data-knob': '',
    'data-typing': typing ? '' : undefined,
    'data-scrubbing': scrubbing ? '' : undefined,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || typedAt(event.target)) return
      event.preventDefault()
      const el = event.currentTarget
      el.setPointerCapture(event.pointerId)
      const field = scrub?.field(el.clientWidth) ?? null
      press.current = {
        x: event.clientX,
        last: event.clientX,
        towardsEnd: getComputedStyle(el).direction === 'rtl' ? -1 : 1,
        // A value the layers don't share moves each by the same amount, with no ends to stop at.
        field:
          field && scrub?.value === null
            ? { ...field, min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY }
            : field,
        scrub: startScrub(scrub?.value ?? 0),
        end: null,
      }
    },
    // Some browsers focus on the mouse press even when the pointer press was taken.
    onMouseDown: (event: MouseEvent<HTMLElement>) => {
      if (!typedAt(event.target)) event.preventDefault()
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const p = press.current
      if (!p?.field || !scrub || (!p.end && Math.abs(event.clientX - p.x) < DRAG_START)) return
      if (!p.end) {
        scrub.onStart()
        setScrubbing(true)
        p.end = editor?.beginGesture() ?? (() => undefined)
      }
      const next = scrubBy(p.scrub, p.field, (event.clientX - p.last) * p.towardsEnd, event)
      const by = next.value - p.scrub.value
      p.last = event.clientX
      p.scrub = next
      if (by !== 0) scrub.onScrub(by)
    },
    onPointerUp: () => release(true),
    onPointerCancel: () => release(false),
    onLostPointerCapture: () => release(false),
    // A click listener of its own marks the knob as taking taps, so a phone's browser keeps a tap on
    // it there rather than moving it onto a control nearby, as it does a tap on a bare box.
    onClick: () => undefined,
  }
  const input = {
    onFocus: () => {
      setTyping(true)
      // What is typed replaces the value.
      ref.current?.select()
    },
    onBlur: () => setTyping(false),
  }
  const reselect = () =>
    requestAnimationFrame(() => {
      if (document.activeElement === ref.current) ref.current?.select()
    })
  return { ref: ref as RefObject<HTMLInputElement | null>, typing, knob, input, reselect }
}

/**
 * A number input's digits, inside the knob `entry` was given to: an input as wide as what it shows,
 * sized by a hidden copy of its text, so a press beside the digits lands on the knob; never wider
 * than the room the knob leaves it, where it scrolls. Digits read left to right in every language,
 * a minus first. In the number look, with room after the digits for the caret, its value selected in
 * the see-through accent, `strong` where it lies on a fill or on glass. `text` is what it shows, the
 * value or what is being typed, and `hint` what shows while it is empty.
 */
export function NumberInput({
  entry,
  text,
  hint,
  strong = false,
  className,
  onBlur,
  ...input
}: Omit<ComponentProps<'input'>, 'value' | 'placeholder' | 'size' | 'onFocus' | 'ref' | 'dir'> & {
  entry: NumberEntry
  text: string
  hint?: string | undefined
  strong?: boolean
}) {
  return (
    <span className="relative inline-grid min-w-0 grid-cols-[minmax(0,auto)] overflow-hidden [&>*]:[grid-area:1/1]">
      <span aria-hidden className={cn(NUMBER_TEXT, 'invisible whitespace-pre pe-[2px]')}>
        {text || hint || ' '}
      </span>
      <input
        inputMode="decimal"
        {...input}
        ref={entry.ref}
        dir="ltr"
        size={1}
        value={text}
        placeholder={hint}
        onFocus={entry.input.onFocus}
        onBlur={(event) => {
          entry.input.onBlur()
          onBlur?.(event)
        }}
        className={cn(
          NUMBER_TEXT,
          strong ? NUMBER_SELECTED_STRONG : NUMBER_SELECTED,
          // No width of its own, so the hidden copy alone sizes the column it fills.
          'w-0 min-w-full cursor-[inherit] bg-transparent pe-[2px] text-end outline-none focus-visible:outline-none! placeholder:text-subtle focus:cursor-text',
          entry.typing && 'select-text',
          className,
        )}
      />
    </span>
  )
}
