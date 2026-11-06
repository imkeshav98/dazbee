'use client'

// The editor's one action at the top end, as in the final mock: a pink Share button. Its menu
// holds what leaves the editor, Export (#55) and Save as template (#54), and each opens its form
// in the same place, with the focus on its first control. They stand over the edit panel: Esc
// closes them first, giving the focus back to Share when it was in them, and never clears the
// selection. A picked
// frame's ⋯ opens Export too, with its frame ticked alone; Esc then gives the focus back to that ⋯.
// While Export is open, Share shows it open as the rail's button for an open flyout does: glass
// under the pressed tint, its icon pink.
import { BookmarkSimpleIcon, CaretRightIcon, DownloadSimpleIcon, ShareFatIcon } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'

import type { Editor } from '@dazbee/editor'

import { onExportAsked } from '@/components/editor/edit-store.ts'
import { useEditorDesign } from '@/components/editor/editor-hooks.ts'
import { Button } from '@/components/ui/button.tsx'
import { Menu, MenuHeading, MenuItem } from '@/components/ui/menu.tsx'
import { useMenuClose } from '@/components/ui/menu-close.ts'
import { cn } from '@/lib/cn.ts'
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
  // The frames Export was asked for from a picked frame's ⋯, each ask its own form; null from Share.
  const [asked, setAsked] = useState<{ frameIds: string[]; key: number } | null>(null)
  // The ⋯ Export was asked from, which Esc gives the focus back to.
  const opener = useRef<HTMLElement | null>(null)
  // A form closes on Esc, before what is under it, or a press outside, giving the focus back to
  // Share, or to the ⋯ Export was asked from.
  const form = open === 'export' || open === 'template'
  const { box, button, overPanelMark } = useMenuClose(form, () => {
    if (document.activeElement === button.current && opener.current?.isConnected) opener.current.focus()
    opener.current = null
    setOpen(null)
  })
  const id = useId()

  useEffect(
    () =>
      onExportAsked((frameIds, from) => {
        opener.current = from
        setAsked((was) => ({ frameIds, key: (was?.key ?? 0) + 1 }))
        setOpen('export')
      }),
    [],
  )

  // A form takes the focus as it opens, on its first control.
  useEffect(() => {
    if (open !== 'export' && open !== 'template') return
    box.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
      ?.querySelector<HTMLElement>(FOCUSABLE)
      ?.focus()
  }, [open, id, asked])

  return (
    <div ref={box} {...overPanelMark} className="relative">
      <Menu
        trigger={
          <Button
            ref={button}
            variant={open === 'export' ? null : 'primary'}
            data-testid="share-open"
            className={cn(
              'h-9 rounded-full px-4 text-sm font-semibold max-sm:w-9 max-sm:px-0',
              open === 'export' && 'surface-frost text-text tint-pressed',
            )}
          >
            <ShareFatIcon
              size={16}
              weight="fill"
              aria-hidden
              className={cn('rtl:-scale-x-100', open === 'export' && 'text-accent-text')}
            />
            <span className="max-sm:sr-only">{t.editor.share.open}</span>
          </Button>
        }
        open={open === 'menu'}
        onOpenChange={(to) => {
          // Share closes a form that shows, as it closes its menu.
          if (to && form) return setOpen(null)
          opener.current = null
          setAsked(null)
          if (to) setOpen('menu')
          else if (open === 'menu') setOpen(null)
        }}
        label={t.editor.share.title}
        place={{ side: 'bottom', align: 'end', sideOffset: 8, collisionPadding: 12 }}
        className="w-80 rounded-card"
      >
        {/* "Share" and the design's name, then each item. */}
        <MenuHeading className="flex items-baseline justify-between gap-3 px-3 pt-2 pb-2.5">
          <span className="font-display text-[15px] font-bold tracking-tight">{t.editor.share.open}</span>
          <span className="min-w-0 truncate text-[11px] font-medium text-muted">{designName}</span>
        </MenuHeading>
        <MenuItem
          label={t.editor.exports.open}
          look={ROW}
          testId="export-open"
          onSelect={() => {
            setAsked(null)
            setOpen('export')
          }}
        >
          <DownloadSimpleIcon size={18} aria-hidden className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1">{t.editor.exports.open}</span>
          <CaretRightIcon size={14} aria-hidden className="shrink-0 text-subtle rtl:-scale-x-100" />
        </MenuItem>
        <MenuItem
          label={t.editor.templates.open}
          look={ROW}
          testId="template-open"
          onSelect={() => setOpen('template')}
        >
          <BookmarkSimpleIcon size={18} aria-hidden className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1">{t.editor.templates.open}</span>
          <CaretRightIcon size={14} aria-hidden className="shrink-0 text-subtle rtl:-scale-x-100" />
        </MenuItem>
      </Menu>
      {open === 'export' && (
        <ExportForm key={asked?.key ?? 0} id={id} editor={editor} design={design} asked={asked?.frameIds} />
      )}
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
