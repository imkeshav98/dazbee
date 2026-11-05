'use client'

// Export: the frames of one page, each with a tick, all ticked at first, as PNG, JPG, PDF or SVG;
// the editor's export worker draws them while the stage stays responsive. Each frame is listed by
// its own name, then, muted, the number its file takes where frames share a name; a row under the pointer or with
// the keyboard focus lights its frame on the canvas. One file downloads as itself, more as one zip.
import { type FocusEvent, useEffect, useRef, useState } from 'react'

import type { Editor } from '@dazbee/editor'
import {
  DEFAULT_EXPORT_NAME,
  type Design,
  type ExportType,
  framesOf,
  inOrder,
  numberedFrameNames,
} from '@dazbee/schema'

import { NumberField } from '@/components/editor/edit-panel/fields.tsx'
import { usePhone } from '@/components/editor/edit-store.ts'
import { useShownPage } from '@/components/editor/editor-hooks.ts'
import { FIELD, FIELD_LABEL, MENU_KEY } from '@/components/editor/styles.ts'
import { Button } from '@/components/ui/button.tsx'
import { LIT_ROW, SEGMENT, SEGMENTS } from '@/components/ui/looks.ts'
import { useOverlayScroll } from '@/components/ui/overlay-scroll.ts'
import { Select } from '@/components/ui/select.tsx'
import { Tick } from '@/components/ui/tick.tsx'
import { cn } from '@/lib/cn.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { counted, format } from '@/lib/i18n/index.ts'

/** Which of the page's frames are ticked: every one, or these. */
type Ticked = 'all' | ReadonlySet<string>

const LABEL = FIELD_LABEL

/**
 * The frames list: its rows as tall as a menu's (MENU_ITEM), 44 px on a phone for a finger, and as
 * tall as eight and a half of them, five and a half on a phone, so the part of the next row at the
 * bottom edge shows that it scrolls.
 */
const FRAMES_LIST =
  '-mx-1 flex max-h-[calc(var(--frame-row)*8.5)] flex-col overflow-y-auto px-1 [--frame-row:calc(var(--spacing)*9)] max-sm:max-h-[calc(var(--frame-row)*5.5)] max-sm:[--frame-row:44px]'

/**
 * A frame's row, its tick in a hidden checkbox: as tall as the list says (FRAMES_LIST), lit under the
 * pointer and while pressed, ringed when reached by keyboard.
 */
const ROW = `flex h-(--frame-row) w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-row px-2 text-start text-[13px] font-medium text-text transition-colors duration-[var(--chrome-fast)] ${LIT_ROW} has-[:focus-visible]:bg-hover has-[:focus-visible]:lit has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent`

/** Scrolls the list so the row holding a control that took the focus shows whole, its ring and all. */
function showWhole(control: HTMLElement) {
  const row = control.closest('label')
  const list = row?.parentElement
  if (!row || !list) return
  const [box, at] = [list.getBoundingClientRect(), row.getBoundingClientRect()]
  // Whole pixels, rounded out, as rows sit on fractions of one.
  if (at.top < box.top) list.scrollTop -= Math.ceil(box.top - at.top)
  else if (at.bottom > box.bottom) list.scrollTop += Math.ceil(at.bottom - box.bottom)
}

function download(name: string, type: string, bytes: Uint8Array<ArrayBuffer>) {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // The download has its own copy once it starts.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Lights a frame on the canvas while its row is under the pointer or has the keyboard focus, the
 * pointer's first, and none once the list goes; returns the handlers a frame's row takes.
 */
function useLitFrame(editor: Editor) {
  const under = useRef<string | null>(null)
  const focused = useRef<string | null>(null)
  useEffect(() => () => editor.lightFrame(null), [editor])
  const show = () => editor.lightFrame(under.current ?? focused.current)
  return (frameId: string) => ({
    onPointerEnter: () => {
      under.current = frameId
      show()
    },
    onPointerLeave: () => {
      if (under.current === frameId) under.current = null
      show()
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      focused.current = (event.target as HTMLElement).matches(':focus-visible') ? frameId : null
      show()
    },
    onBlur: () => {
      if (focused.current === frameId) focused.current = null
      show()
    },
  })
}

/**
 * The export form, opened from the Share menu with every frame of the shown page ticked, or from a
 * picked frame's ⋯ with `asked`, its frame, ticked alone.
 */
export function ExportForm({
  id,
  editor,
  design,
  asked,
}: {
  id: string
  editor: Editor
  design: Design
  asked?: readonly string[] | undefined
}) {
  const t = useMessages()
  const locale = useLocale()
  const pages = inOrder(design.pages)
  // The page: the one picked here, or the asked frames', while it exists; else the one the canvas shows.
  const shown = useShownPage(editor)
  const [chosen, setChosen] = useState<string | null>(() => (asked?.[0] && design.frames[asked[0]]?.pageId) || null)
  const thisPage = chosen && Object.hasOwn(design.pages, chosen) ? chosen : shown
  const [ticked, setTicked] = useState<Ticked>(() => (asked ? new Set(asked) : 'all'))
  const [name, setName] = useState(DEFAULT_EXPORT_NAME)
  const [type, setType] = useState<ExportType>('png')
  const [quality, setQuality] = useState(90)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lightsFrame = useLitFrame(editor)
  // On a phone the list's bar stays shown, as no pointer hovers to bring it up.
  const list = useRef<HTMLDivElement>(null)
  const listRef = useOverlayScroll(list, { shown: usePhone() })

  // The page's frames in its order, each by its numbered name; the ticked ones are exported, in that order.
  const frames = framesOf(design, thisPage)
  const names = numberedFrameNames(design, thisPage)
  const isTicked = (frameId: string) => ticked === 'all' || ticked.has(frameId)
  const frameIds = frames.filter(([frameId]) => isTicked(frameId)).map(([frameId]) => frameId)
  const count = frameIds.length
  const every = count === frames.length ? true : count === 0 ? false : 'mixed'

  const choosePage = (pageId: string) => {
    setChosen(pageId)
    setTicked('all')
  }
  const tick = (frameId: string, on: boolean) => {
    const next = new Set(frames.filter(([id]) => isTicked(id)).map(([id]) => id))
    if (on) next.add(frameId)
    else next.delete(frameId)
    setTicked(next)
  }

  const run = async () => {
    setError(null)
    setProgress({ done: 0, total: count })
    try {
      const file = await editor.exportFiles(
        { frameIds, type, quality, name: name.trim() || DEFAULT_EXPORT_NAME },
        (done, total) => setProgress({ done, total }),
      )
      download(file.name, file.type, file.bytes as Uint8Array<ArrayBuffer>)
    } catch (reason) {
      setError(format(t.editor.exports.failed, { reason: reason instanceof Error ? reason.message : String(reason) }))
    } finally {
      setProgress(null)
    }
  }

  return (
    <div
      id={id}
      role="dialog"
      aria-labelledby={`${id}-title`}
      data-testid="export"
      className="modal-in absolute end-0 top-full z-30 mt-2 flex w-80 flex-col gap-3 rounded-card surface-frost p-3"
    >
      <h2 id={`${id}-title`} className="px-0.5 font-display text-[15px] font-bold tracking-tight">
        {t.editor.exports.title}
      </h2>
      {/* Another page's frames can be the ones. */}
      {pages.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>{t.editor.exports.page}</span>
          <Select
            name="page"
            label={t.editor.exports.page}
            value={thisPage}
            options={pages.map(([pageId, p]) => ({ value: pageId, label: p.name }))}
            onChange={choosePage}
            testId="export-page"
            className="h-8 bg-raised px-2 text-[13px]"
          />
        </div>
      )}

      <div role="group" aria-labelledby={`${id}-frames`} className="flex flex-col gap-1.5">
        <span id={`${id}-frames`} className={LABEL}>
          {t.editor.exports.frames}
        </span>
        {frames.length === 0 ? (
          <p className="text-[13px] text-muted" data-testid="export-no-frames">
            {t.editor.exports.noFrames}
          </p>
        ) : (
          // An empty tick's edge takes the muted text's shade, which reads over whatever ad lies
          // behind the glass.
          <div
            ref={listRef}
            className={cn(FRAMES_LIST, '[--line-strong:var(--text-muted)]')}
            data-testid="export-frames"
          >
            {frames.length > 1 && (
              <FrameRow
                name={t.editor.exports.allFrames}
                on={every}
                onTick={(on) => setTicked(on ? 'all' : new Set())}
                testId="export-all-frames"
                bold
              />
            )}
            {frames.map(([frameId, frame]) => (
              <FrameRow
                key={frameId}
                name={frame.name}
                number={names.get(frameId)?.number ?? null}
                size={`${frame.width} × ${frame.height}`}
                on={isTicked(frameId)}
                onTick={(on) => tick(frameId, on)}
                testId="export-frame"
                frameId={frameId}
                lights={lightsFrame(frameId)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>{t.editor.exports.type}</span>
        <div role="radiogroup" aria-label={t.editor.exports.type} className={SEGMENTS}>
          {(['png', 'jpg', 'pdf', 'svg'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={type === value}
              onClick={() => setType(value)}
              data-type={value}
              className={cn(SEGMENT, 'uppercase')}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {type === 'jpg' && (
        <NumberField
          label={t.editor.exports.quality}
          name={t.editor.exports.quality}
          value={quality}
          min={1}
          max={100}
          testId="export-quality"
          onSet={(to) => setQuality(Math.round(to))}
          onShift={(by) => setQuality((now) => Math.round(Math.min(100, Math.max(1, now + by))))}
        />
      )}

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>{t.editor.exports.fileNames}</span>
        <input
          name="file-names"
          value={name}
          maxLength={200}
          spellCheck={false}
          placeholder={DEFAULT_EXPORT_NAME}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          data-testid="export-name"
          className={FIELD}
        />
      </label>

      <Button
        variant="primary"
        disabled={count === 0 || progress !== null}
        onClick={() => void run()}
        data-testid="export-run"
      >
        {progress
          ? format(t.editor.exports.making, { done: progress.done, total: progress.total })
          : counted(locale, t.editor.exports.run, count)}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * A row of the frames list: a tick, the frame's own name as its label shows it, the number its file
 * takes after it, and its size; or, `bold`, the row that ticks them all.
 */
function FrameRow({
  name,
  number = null,
  size,
  on,
  onTick,
  testId,
  frameId,
  lights,
  bold = false,
}: {
  name: string
  /** The number added to the frame's name to keep its file's apart, shown after it, muted. */
  number?: number | null
  size?: string
  on: boolean | 'mixed'
  onTick: (on: boolean) => void
  testId: string
  frameId?: string
  /** What lights the row's frame on the canvas while the row is under the pointer or focused. */
  lights?: ReturnType<ReturnType<typeof useLitFrame>>
  bold?: boolean
}) {
  return (
    <label className={ROW} title={number === null ? name : `${name} ${number}`} {...lights}>
      <input
        type="checkbox"
        name={frameId ? 'frame' : 'all-frames'}
        value={frameId}
        checked={on === true}
        ref={(input) => {
          if (input) input.indeterminate = on === 'mixed'
        }}
        onChange={(event) => onTick(event.target.checked)}
        onFocus={(event) => showWhole(event.currentTarget)}
        className="sr-only"
        data-testid={testId}
        data-frame={frameId}
      />
      <Tick on={on} />
      <span className="flex min-w-0 flex-1 items-baseline gap-1">
        <span className={cn('truncate', bold && 'font-semibold')} data-part="name">
          {name}
        </span>
        {number !== null && (
          <span className="shrink-0 text-muted" data-part="number">
            {number}
          </span>
        )}
      </span>
      {/* Width × height in every language, as the frame's label reads, isolated from the row's direction. */}
      {size && (
        <span dir="ltr" className={cn(MENU_KEY, 'shrink-0')} data-part="size">
          {size}
        </span>
      )}
    </label>
  )
}
