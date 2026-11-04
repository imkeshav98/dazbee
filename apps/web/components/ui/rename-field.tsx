'use client'

import { useRef, useState } from 'react'

/**
 * The name as a field: Enter or leaving it keeps the new name, Escape keeps the old one. `onDone`
 * hears whether it ended from the keyboard.
 */
export function RenameField({
  name,
  label,
  onDone,
}: {
  name: string
  label: string
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
      name="layer-name"
      // Focused as it opens: the person asked to rename this layer.
      autoFocus
      aria-label={label}
      value={value}
      maxLength={120}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') finish(value, true)
        else if (event.key === 'Escape') finish(null, true)
      }}
      onBlur={() => finish(value, false)}
      className="h-6 min-w-0 flex-1 rounded-row border border-accent bg-raised px-1.5 text-[13px] outline-none"
    />
  )
}
