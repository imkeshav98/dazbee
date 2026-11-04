'use client'

// A size of your own: width and height fields with Add, checked against the sizes a frame may be,
// saying what is wrong while it can't be added. And a size's shape as a small outlined box.
import { type FormEvent, useId, useState } from 'react'

import { SIZE_LIMITS, sizeIssue } from '@dazbee/schema'

import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

/** The W × H fields and Add; `onAdd` gets a size a frame may be, and the fields empty after it. */
export function SizeFields({ onAdd }: { onAdd: (width: number, height: number) => void }) {
  const t = useMessages()
  const s = t.editor.sizes
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const ids = { width: useId(), height: useId(), issue: useId() }
  const w = Number(width)
  const h = Number(height)
  const typed = width !== '' && height !== ''
  const issue = typed ? sizeIssue(w, h) : undefined
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!typed || issue) return
    onAdd(w, h)
    setWidth('')
    setHeight('')
  }
  const issueText =
    issue &&
    format(s.issue[issue], {
      min: SIZE_LIMITS.minSide,
      max: issue === 'ratio' ? SIZE_LIMITS.maxRatio : SIZE_LIMITS.maxSide,
    })

  return (
    <form onSubmit={submit} aria-label={s.custom} data-testid="size-fields">
      <div className="flex items-end gap-2">
        {(['width', 'height'] as const).map((side) => (
          <label key={side} htmlFor={ids[side]} className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-muted">
            {s[side]}
            <input
              id={ids[side]}
              inputMode="numeric"
              value={side === 'width' ? width : height}
              onChange={(e) => (side === 'width' ? setWidth : setHeight)(e.currentTarget.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => e.stopPropagation()}
              aria-invalid={issue ? true : undefined}
              aria-describedby={issue ? ids.issue : undefined}
              className={cn(
                'h-[var(--row)] w-full rounded-row border bg-surface px-2 font-mono text-[13px] text-text tabular-nums outline-none focus:border-accent',
                issue ? 'border-danger/60' : 'border-line',
              )}
            />
          </label>
        ))}
        <Button type="submit" variant="primary" disabled={!typed || Boolean(issue)}>
          {s.add}
        </Button>
      </div>
      <p id={ids.issue} role="alert" className="min-h-4 pt-1.5 text-[11px] text-danger">
        {issueText}
      </p>
    </form>
  )
}

/** A small box with a size's own proportions. */
export function Proportion({ width, height, className }: { width: number; height: number; className?: string }) {
  const scale = 14 / Math.max(width, height)
  return (
    <span aria-hidden className={cn('grid size-4 shrink-0 place-items-center', className)}>
      <span
        className="rounded-[2px] border-[1.5px] border-current"
        style={{ width: Math.max(4, width * scale), height: Math.max(4, height * scale) }}
      />
    </span>
  )
}
