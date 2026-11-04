'use client'

import { useRef, useState } from 'react'

/**
 * Gives the focus back to the control that opened a rename field when the field ends from the
 * keyboard. `back(key)` marks the control as the field ends; `ref(key)` on the control focuses it as
 * it takes the field's place. A field that ends by a click elsewhere marks nothing, so the focus
 * stays where the click put it.
 */
export function useFocusBack() {
  const marked = useRef<string | null>(null)
  return {
    back: (key: string) => {
      marked.current = key
    },
    ref: (key: string) => (el: HTMLElement | null) => {
      if (!el || marked.current !== key) return
      marked.current = null
      el.focus()
    },
  }
}

/**
 * A name as a field, focused with the name selected as it opens: Enter or leaving it keeps the new
 * name, Escape keeps the old one. It ends once, so a blur after Enter or Escape keeps nothing again.
 * `onDone` hears the name typed (null after Escape) and whether it ended from the keyboard; the
 * caller trims it and checks whether it changed.
 */
export function RenameField({
  name,
  label,
  inputName,
  maxLength,
  className,
  onDone,
}: {
  name: string
  label: string
  /** The input's `name` attribute. */
  inputName: string
  maxLength?: number
  className?: string
  onDone: (name: string | null, byKey: boolean) => void
}) {
  const [value, setValue] = useState(name)
  const done = useRef(false)
  const finish = (next: string | null, byKey: boolean) => {
    if (done.current) return
    done.current = true
    onDone(next, byKey)
  }
  return (
    <input
      name={inputName}
      // Focused as it opens: the person asked to rename this.
      autoFocus
      aria-label={label}
      value={value}
      maxLength={maxLength}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // Keys typed into the name are the name's, not the stage's or the panel's.
        event.stopPropagation()
        if (event.key === 'Enter') {
          // The control that takes the focus back as the field ends would otherwise get the Enter's
          // keypress and be clicked by it.
          event.preventDefault()
          finish(value, true)
        } else if (event.key === 'Escape') finish(null, true)
      }}
      onBlur={() => finish(value, false)}
      className={className}
    />
  )
}
