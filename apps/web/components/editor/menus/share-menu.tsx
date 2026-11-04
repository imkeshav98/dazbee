'use client'

// The editor's one action at the top end, as in the final mock: a pink Share button. Its menu
// holds what leaves the editor, Export (#55) and Save as template (#54), and each opens its form
// in the same place. The menu opens with the focus on its first item, which the arrows move
// through; a form, on its first control. They stand over the edit panel: Esc closes them first,
// giving the focus back to Share when it was in them, and never clears the selection.
import { BookmarkSimpleIcon, CaretRightIcon, DownloadSimpleIcon, ShareFatIcon } from '@phosphor-icons/react'
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useState } from 'react'

import type { Editor } from '@dazbee/editor'

import { useEditorDesign } from '@/components/editor/editor-hooks.ts'
import { Button } from '@/components/ui/button.tsx'
import { useMenuClose } from '@/components/ui/menu-close.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

import { ExportForm } from './export-menu.tsx'
import { TemplateForm } from './template-menu.tsx'

type Open = 'menu' | 'export' | 'template' | null

/** The controls of a form the focus can go to. */
const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** A menu row; on a phone 48 px tall, past the 44 px a finger needs. */
const ROW =
  'flex min-h-12 max-sm:min-h-[48px] py-1.5 w-full cursor-pointer items-center gap-3 rounded-row px-3 text-start text-[13px] font-medium transition-colors duration-[var(--chrome-fast)] hover:bg-hover hover:lit active:bg-pressed active:lit focus-visible:bg-hover focus-visible:lit focus-visible:outline-none'

/** Moves the focus through a menu's items with the arrows, Home and End, round from the ends. */
function arrowThrough(event: ReactKeyboardEvent<HTMLElement>) {
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  const at = items.indexOf(document.activeElement as HTMLElement)
  const last = items.length - 1
  const next = { ArrowDown: at >= last ? 0 : at + 1, ArrowUp: at <= 0 ? last : at - 1, Home: 0, End: last }[event.key]
  if (next === undefined) return
  event.preventDefault()
  items[next]?.focus()
}

export function ShareMenu({
  editor,
  brandId,
  brandName,
  designName,
  everyBrand,
}: {
  editor: Editor
  brandId: string
  brandName: string
  designName: string
  /** How this workspace says "every brand": "All clients" in an agency (ADR-0011). */
  everyBrand: string
}) {
  const t = useMessages()
  const { design } = useEditorDesign(editor)
  const [open, setOpen] = useState<Open>(null)
  // Closes on Esc, before what is under it, or a press outside, giving the focus back to Share.
  const { box, button, overPanelMark } = useMenuClose(open !== null, () => setOpen(null))
  const id = useId()

  // The menu takes the focus as it opens, on its first item; a form, on its first control.
  useEffect(() => {
    if (!open) return
    box.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
      ?.querySelector<HTMLElement>(open === 'menu' ? '[role="menuitem"]' : FOCUSABLE)
      ?.focus()
  }, [open, id])

  return (
    <div ref={box} {...overPanelMark} className="relative">
      <Button
        ref={button}
        variant="primary"
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={id}
        onClick={() => setOpen(open ? null : 'menu')}
        data-testid="share-open"
        className="h-9 rounded-full px-4 text-sm font-semibold max-sm:w-9 max-sm:px-0"
      >
        <ShareFatIcon size={16} weight="fill" aria-hidden className="rtl:-scale-x-100" />
        <span className="max-sm:sr-only">{t.editor.share.open}</span>
      </Button>
      {open === 'menu' && (
        <div
          id={id}
          role="menu"
          aria-label={t.editor.share.title}
          onKeyDown={arrowThrough}
          className="pop-in-end absolute end-0 top-full z-30 mt-2 flex w-80 flex-col rounded-card surface-frost p-1.5"
        >
          {/* "Share" and the design's name, then each item. */}
          <div role="none" className="flex items-baseline justify-between gap-3 px-3 pt-2 pb-2.5">
            <span className="font-display text-[15px] font-bold tracking-tight">{t.editor.share.open}</span>
            <span className="min-w-0 truncate text-[11px] font-medium text-muted">{designName}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className={ROW}
            onClick={() => setOpen('export')}
            data-testid="export-open"
          >
            <DownloadSimpleIcon size={18} aria-hidden className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">{t.editor.exports.open}</span>
            <CaretRightIcon size={14} aria-hidden className="shrink-0 text-subtle rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            role="menuitem"
            className={ROW}
            onClick={() => setOpen('template')}
            data-testid="template-open"
          >
            <BookmarkSimpleIcon size={18} aria-hidden className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">{t.editor.templates.open}</span>
            <CaretRightIcon size={14} aria-hidden className="shrink-0 text-subtle rtl:-scale-x-100" />
          </button>
        </div>
      )}
      {open === 'export' && <ExportForm id={id} editor={editor} design={design} />}
      {open === 'template' && (
        <TemplateForm
          id={id}
          editor={editor}
          brandId={brandId}
          brandName={brandName}
          designName={designName}
          everyBrand={everyBrand}
        />
      )}
    </div>
  )
}
