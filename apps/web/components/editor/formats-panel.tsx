'use client'

// Adding a size to the design: every preset grouped by shape, or a size of your own, checked
// against the sizes the formats allow; and the design as the editor holds it, kept current.
import {
  ArrowsInSimpleIcon, InfoIcon, PlusIcon, TrashIcon,
} from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import type { Editor } from '@dazbee/editor'
import {
  FORMAT_LIMITS, FORMAT_PRESETS, FORMAT_SHAPES, formatSizeIssue, shapeOf,
} from '@dazbee/schema'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { format } from '../../lib/i18n/index.ts'
import { Button } from '../ui/button.tsx'
import { overlayScroll } from '../ui/overlay-scroll.ts'
import { Tooltip } from '../ui/tooltip.tsx'
import { ICON_BUTTON, POPOVER, TOAST } from './styles.ts'
import { useLiveDesign } from './use-live-design.ts'

/** The design as the editor holds it, kept current: every redraw hands over the latest one. */
export function useEditorDesign(editor: Editor) {
  const { design } = useLiveDesign(editor)
  const [focused, setFocused] = useState(() => editor.focused())
  useEffect(() => {
    const stop = editor.onDraw(() => setFocused(editor.focused()))
    return () => {
      stop()
    }
  }, [editor])
  return { design, focused }
}

/** A size as the app writes it, in numerals that read the same in every locale. */
const sizeOf = ({ width, height }: { width: number; height: number }) => `${width} × ${height}`

/** A small box with the format's own proportions. */
export function Proportion({ width, height, className }: { width: number; height: number; className?: string }) {
  const scale = 14 / Math.max(width, height)
  return (
    <span aria-hidden className={cn('grid size-4 shrink-0 place-items-center', className)}>
      <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: Math.max(4, width * scale), height: Math.max(4, height * scale) }} />
    </span>
  )
}

export function AddFormat({ editor }: { editor: Editor }) {
  const t = useMessages()
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const ids = { width: useId(), height: useId(), issue: useId() }
  const w = Number(width)
  const h = Number(height)
  const typed = width !== '' && height !== ''
  const issue = typed ? formatSizeIssue(w, h) : undefined
  const add = (name: string, width: number, height: number) => {
    const id = editor.session.run('format.add', { name, width, height })
    setOpen(false)
    setWidth('')
    setHeight('')
    // Show where the new format landed: every frame, with the new column at the end.
    if (editor.focused()) editor.focus(id)
    else editor.fitAll()
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (typed && !issue) add(sizeOf({ width: w, height: h }), w, h)
  }
  const issueText = issue && format(t.editor.formats.issue[issue], { min: FORMAT_LIMITS.minShortSide, max: FORMAT_LIMITS.maxSide })

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip label={t.editor.formats.add}>
        <Popover.Trigger asChild>
          <button type="button" aria-label={t.editor.formats.add} className={ICON_BUTTON}>
            <PlusIcon size={16} aria-hidden />
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="left"
          align="start"
          sideOffset={12}
          aria-label={t.editor.formats.add}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(POPOVER, 'flex max-h-[min(560px,var(--radix-popover-content-available-height))] w-72 flex-col overflow-hidden')}
        >
          <div ref={overlayScroll} className="min-h-0 flex-1 overflow-y-auto py-1" role="group" aria-label={t.editor.formats.presets}>
            {FORMAT_SHAPES.map((shape) => {
              const presets = FORMAT_PRESETS.filter((p) => shapeOf(p.width, p.height) === shape)
              return (
                <div key={shape} role="group" aria-label={t.editor.formats.shape[shape]}>
                  <h4 className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle">{t.editor.formats.shape[shape]}</h4>
                  {presets.map((preset) => {
                    const name = t.editor.formats.preset[preset.id] ?? preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        data-preset={preset.id}
                        onClick={() => add(name, preset.width, preset.height)}
                        className="mx-1 flex h-[var(--row)] w-[calc(100%-8px)] cursor-pointer items-center gap-2 rounded-row px-3 text-start text-[13px] hover:bg-hover focus-visible:bg-hover"
                      >
                        <Proportion width={preset.width} height={preset.height} className="text-muted" />
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        <span className="font-mono text-[11px] text-subtle tabular-nums">
                          {sizeOf(preset)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <form onSubmit={submit} className="border-t border-line p-3" aria-label={t.editor.formats.custom}>
            <h4 className="pb-2 text-[11px] font-semibold tracking-wide text-subtle">{t.editor.formats.custom}</h4>
            <div className="flex items-end gap-2">
              {(['width', 'height'] as const).map((side) => (
                <label key={side} htmlFor={ids[side]} className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-muted">
                  {t.editor.formats[side]}
                  <input
                    id={ids[side]}
                    inputMode="numeric"
                    value={side === 'width' ? width : height}
                    onChange={(e) => (side === 'width' ? setWidth : setHeight)(e.currentTarget.value.replace(/[^\d]/g, ''))}
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={issue ? ids.issue : undefined}
                    className={cn(
                      'h-[var(--row)] w-full rounded-row border bg-surface px-2 font-mono text-[13px] text-text tabular-nums outline-none focus:border-accent',
                      issue ? 'border-danger/60' : 'border-line',
                    )}
                  />
                </label>
              ))}
              <Button type="submit" variant="primary" disabled={!typed || Boolean(issue)}>{t.editor.formats.addCustom}</Button>
            </div>
            <p id={ids.issue} role="alert" className="min-h-4 pt-1.5 text-[11px] text-danger">{issueText}</p>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Over the stage while one format shows alone: which one, and the way back to all of them. */
export function FocusChip({ editor }: { editor: Editor }) {
  const t = useMessages()
  const { design, focused } = useEditorDesign(editor)
  const name = focused ? design.formats[focused]?.name : undefined
  if (!focused || name === undefined) return null
  return (
    <div role="status" data-testid="focus-chip" className="pointer-events-auto flex h-9 items-center gap-1 rounded-full surface-frost ps-3.5 pe-1 text-[13px]">
      <ArrowsInSimpleIcon size={14} aria-hidden className="text-accent-text" />
      <span className="ms-1">{format(t.editor.formats.focusing, { name })}</span>
      <Button variant="ghost" className="ms-1 h-7 rounded-full px-2.5 text-xs" onClick={() => editor.focus(null)}>{t.editor.formats.exitFocus}</Button>
    </div>
  )
}

const TOAST_MS = 8000

/** After a format or page is removed: says so, with undo, for a few seconds. */
export function UndoToast({ editor, message, onDone }: { editor: Editor; message: string; onDone: () => void }) {
  const t = useMessages()
  // It stays while the pointer or focus is on it, so the undo can't vanish from under a click.
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (held) return
    const timer = setTimeout(onDone, TOAST_MS)
    return () => clearTimeout(timer)
  }, [message, onDone, held])
  return (
    <div
      role="status"
      data-testid="removed-toast"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={TOAST}>
      <TrashIcon size={14} aria-hidden className="text-subtle" />
      <span>{message}</span>
      <Button
        variant="ghost"
        className="h-7 px-2.5 text-xs font-semibold text-accent-text"
        onClick={() => {
          editor.session.undo()
          onDone()
        }}
      >
        {t.editor.formats.undo}
      </Button>
    </div>
  )
}

/**
 * Says why a gesture did nothing, such as a nudge auto layout decides; it goes after a few seconds.
 * A `lasting` one, such as files uploading, stays until its message changes or it is taken away.
 */
export function NoticeToast({ message, onDone, lasting = false }: { message: string; onDone: () => void; lasting?: boolean }) {
  useEffect(() => {
    if (lasting) return
    const timer = setTimeout(onDone, TOAST_MS)
    return () => clearTimeout(timer)
  }, [message, onDone, lasting])
  return (
    <div role="status" data-testid="notice-toast" className={cn(TOAST, 'pe-3.5')}>
      <InfoIcon size={14} aria-hidden className="shrink-0 text-subtle" />
      <span>{message}</span>
    </div>
  )
}
