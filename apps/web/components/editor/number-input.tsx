'use client'

// What every number input does with the pointer and the caret. A press that doesn't move focuses the
// input with its whole value selected, so what is typed replaces it. In an input being typed in, a
// press beside the digits (on the label, the unit or the room between) puts the caret at the end of
// the value, and a press on the digits places it where it lands. A press that moves sideways scrubs
// the value (lib/editor/scrub.ts), one undo step for the whole drag when given the editor. It counts
// on the input being as wide as its digits, so a press beside them lands on the knob around it.
import { type MouseEvent, type PointerEvent, type RefObject, useEffect, useRef, useState } from 'react'

import type { Editor } from '@dazbee/editor'

import { type Scrub, scrubBy, type ScrubField, startScrub } from '@/lib/editor/scrub.ts'

/** A press under way: where it went down, where the pointer last was, and the scrub once it moves. */
interface Press {
  x: number
  last: number
  /** 1 where the value grows to the right, -1 in a right-to-left field. */
  towardsEnd: 1 | -1
  field: ScrubField
  scrub: Scrub
  /** Ends the drag's undo step; null until the press moves far enough to be a drag. */
  end: (() => void) | null
}

/** How far a press moves, in px, before it is a drag. */
const DRAG_START = 3

/**
 * The props for a number input's knob (`knob`, the element pressed and dragged) and for the input
 * inside it (`input`), and whether it is being typed in. `scrubField` gives the field as a scrub
 * sees it for the knob's inner width at the press; `value` is the value as shown, null where the
 * layers don't share one, so a drag moves each by the same amount from its own. `onScrub` moves the
 * value by an amount as shown, already held within the field's limits.
 */
export function useNumberInput({
  input,
  editor,
  value,
  scrubField,
  onScrubStart,
  onScrub,
}: {
  input: RefObject<HTMLInputElement | null>
  editor?: Editor | undefined
  value: number | null
  scrubField: (width: number) => ScrubField
  onScrubStart: () => void
  onScrub: (by: number) => void
}) {
  const [typing, setTyping] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const press = useRef<Press | null>(null)
  /** Whether a press on `target` belongs to the input: one on its digits while it is typed in. */
  const typedAt = (target: EventTarget) => typing && target === input.current
  const release = (focus: boolean) => {
    const p = press.current
    press.current = null
    if (!p) return
    setScrubbing(false)
    if (p.end) return p.end()
    const el = input.current
    if (!focus || !el) return
    if (document.activeElement !== el) el.focus()
    else el.setSelectionRange(el.value.length, el.value.length)
  }
  // A drag the card is taken away in the middle of still ends its undo step.
  useEffect(() => () => press.current?.end?.(), [])
  const knob = {
    'data-typing': typing ? '' : undefined,
    'data-scrubbing': scrubbing ? '' : undefined,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || typedAt(event.target)) return
      event.preventDefault()
      const el = event.currentTarget
      el.setPointerCapture(event.pointerId)
      const field = scrubField(el.clientWidth)
      press.current = {
        x: event.clientX,
        last: event.clientX,
        towardsEnd: getComputedStyle(el).direction === 'rtl' ? -1 : 1,
        // A value the layers don't share moves each by the same amount, with no ends to stop at.
        field: value === null ? { ...field, min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY } : field,
        scrub: startScrub(value ?? 0),
        end: null,
      }
    },
    // Some browsers focus on the mouse press even when the pointer press was taken.
    onMouseDown: (event: MouseEvent<HTMLElement>) => {
      if (!typedAt(event.target)) event.preventDefault()
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const p = press.current
      if (!p || (!p.end && Math.abs(event.clientX - p.x) < DRAG_START)) return
      if (!p.end) {
        onScrubStart()
        setScrubbing(true)
        p.end = editor?.beginGesture() ?? (() => undefined)
      }
      const next = scrubBy(p.scrub, p.field, (event.clientX - p.last) * p.towardsEnd, event)
      const by = next.value - p.scrub.value
      p.last = event.clientX
      p.scrub = next
      if (by !== 0) onScrub(by)
    },
    onPointerUp: () => release(true),
    onPointerCancel: () => release(false),
    onLostPointerCapture: () => release(false),
  }
  const inputProps = {
    onFocus: () => {
      setTyping(true)
      // What is typed replaces the value.
      input.current?.select()
    },
    onBlur: () => setTyping(false),
  }
  return { typing, knob, input: inputProps }
}
