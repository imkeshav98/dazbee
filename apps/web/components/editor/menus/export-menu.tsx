'use client'

// Export: every frame of this page or of every page, PNG, JPG, PDF or SVG, and the file names; the
// editor's export worker draws them while the stage stays responsive. One file downloads as itself,
// more as one zip.
import { useState } from 'react'

import type { Editor } from '@dazbee/editor'
import { DEFAULT_EXPORT_NAME, type Design, type ExportType, framesOf, inOrder } from '@dazbee/schema'

import { NumberField } from '@/components/editor/edit-panel/fields.tsx'
import { useShownPage } from '@/components/editor/editor-hooks.ts'
import { FIELD, FIELD_LABEL, SEGMENT, SEGMENTS } from '@/components/editor/styles.ts'
import { Button } from '@/components/ui/button.tsx'
import { Select } from '@/components/ui/select.tsx'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

const LABEL = FIELD_LABEL

function download(name: string, type: string, bytes: Uint8Array<ArrayBuffer>) {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // The download has its own copy once it starts.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** The export form, opened from the Share menu. */
export function ExportForm({ id, editor, design }: { id: string; editor: Editor; design: Design }) {
  const t = useMessages()
  const pages = inOrder(design.pages)
  // This page: the one picked here while it exists, else the one the canvas shows.
  const shown = useShownPage(editor)
  const [allPages, setAllPages] = useState(true)
  const [chosen, setChosen] = useState<string | null>(null)
  const thisPage = chosen && Object.hasOwn(design.pages, chosen) ? chosen : shown
  const [name, setName] = useState(DEFAULT_EXPORT_NAME)
  const [type, setType] = useState<ExportType>('png')
  const [quality, setQuality] = useState(90)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Every frame of the pages asked for, by page then by frame order.
  const asked = allPages ? pages.map(([pageId]) => pageId) : [thisPage]
  const frameIds = asked.flatMap((pageId) => framesOf(design, pageId).map(([frameId]) => frameId))
  const count = frameIds.length

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
      className="modal-in absolute end-0 top-full z-30 mt-2 flex w-72 flex-col gap-3 rounded-card surface-frost p-3"
    >
      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>{t.editor.exports.pages}</span>
        <div role="radiogroup" aria-label={t.editor.exports.pages} className={SEGMENTS}>
          <button
            type="button"
            role="radio"
            aria-checked={allPages}
            onClick={() => setAllPages(true)}
            data-pages="all"
            className={SEGMENT}
          >
            {format(t.editor.exports.allPages, { n: pages.length })}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!allPages}
            onClick={() => setAllPages(false)}
            data-pages="one"
            className={SEGMENT}
          >
            {t.editor.exports.thisPage}
          </button>
        </div>
        {/* Any other page can still be the one. */}
        {!allPages && pages.length > 1 && (
          <Select
            name="page"
            label={t.editor.exports.page}
            value={thisPage}
            options={pages.map(([pageId, p]) => ({ value: pageId, label: p.name }))}
            onChange={setChosen}
            testId="export-page"
            className="h-8 bg-raised px-2 text-[13px]"
          />
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
