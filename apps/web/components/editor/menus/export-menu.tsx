'use client'

// Export: the frames of one page, each with a tick, all ticked at first, as PNG, JPG, PDF or SVG;
// the editor's export worker draws them while the stage stays responsive. Each frame is listed by
// the name its file takes, numbered where frames share a name. One file downloads as itself, more
// as one zip.
import { useState } from 'react'

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
import { useShownPage } from '@/components/editor/editor-hooks.ts'
import { FIELD, FIELD_LABEL, MENU_KEY } from '@/components/editor/styles.ts'
import { Button } from '@/components/ui/button.tsx'
import { LIT_ROW, SEGMENT, SEGMENTS, TOUCH_ROW } from '@/components/ui/looks.ts'
import { overlayScroll } from '@/components/ui/overlay-scroll.ts'
import { Select } from '@/components/ui/select.tsx'
import { Tick } from '@/components/ui/tick.tsx'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

/** Which of the page's frames are ticked: every one, or these. */
type Ticked = 'all' | ReadonlySet<string>

const LABEL = FIELD_LABEL

/** A frame's row, its tick in a hidden checkbox: lit under the pointer and while pressed, ringed when reached by keyboard. */
const ROW = `flex h-8 w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-row px-2 text-start text-[13px] font-medium text-text transition-colors duration-[var(--chrome-fast)] ${LIT_ROW} ${TOUCH_ROW} has-[:focus-visible]:bg-hover has-[:focus-visible]:lit has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent`

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
      aria-label={t.editor.exports.title}
      data-testid="export"
      className="modal-in absolute end-0 top-full z-30 mt-2 flex w-80 flex-col gap-3 rounded-card surface-frost p-3"
    >
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
          // Eight rows show before it scrolls, five on a phone. An empty tick's edge takes the muted
          // text's shade, which reads over whatever ad lies behind the glass.
          <div
            ref={overlayScroll}
            className="-mx-1 flex max-h-64 flex-col overflow-y-auto px-1 [--line-strong:var(--text-muted)]"
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
                name={names.get(frameId) ?? frame.name}
                size={`${frame.width} × ${frame.height}`}
                on={isTicked(frameId)}
                onTick={(on) => tick(frameId, on)}
                testId="export-frame"
                frameId={frameId}
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
          : count === 1
            ? t.editor.exports.runOne
            : format(t.editor.exports.run, { n: count })}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/** A row of the frames list: a tick, the name, and the frame's size; or, `bold`, the row that ticks them all. */
function FrameRow({
  name,
  size,
  on,
  onTick,
  testId,
  frameId,
  bold = false,
}: {
  name: string
  size?: string
  on: boolean | 'mixed'
  onTick: (on: boolean) => void
  testId: string
  frameId?: string
  bold?: boolean
}) {
  return (
    <label className={ROW} title={name}>
      <input
        type="checkbox"
        name={frameId ? 'frame' : 'all-frames'}
        value={frameId}
        checked={on === true}
        ref={(input) => {
          if (input) input.indeterminate = on === 'mixed'
        }}
        onChange={(event) => onTick(event.target.checked)}
        className="sr-only"
        data-testid={testId}
        data-frame={frameId}
      />
      <Tick on={on} />
      <span className={cn('min-w-0 flex-1 truncate', bold && 'font-semibold')}>{name}</span>
      {size && <span className={cn(MENU_KEY, 'shrink-0')}>{size}</span>}
    </label>
  )
}
