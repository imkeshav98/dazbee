'use client'

// The pieces every row of the layers panel's tree shares, a frame's and a layer's: the calls a row
// makes on the panel, its height, look and place in the list, and its caret.
import { CaretRightIcon } from '@phosphor-icons/react'
import type { DragEvent, KeyboardEvent, MouseEvent } from 'react'

import { cn } from '@/lib/cn.ts'
import type { Row } from '@/lib/editor/layer-tree.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

export type Where = 'above' | 'below' | 'into'

export interface RowApi {
  focus: (id: string) => void
  key: (event: KeyboardEvent<HTMLElement>, row: Row, i: number) => void
  click: (id: string, add: boolean) => void
  rename: (id: string) => void
  renamed: (id: string, name: string | null, before: string, byKey: boolean) => void
  toggle: (id: string) => void
  lock: (id: string, locked: boolean) => void
  hide: (id: string, hidden: boolean) => void
  dragStart: (id: string) => void
  dragEnd: () => void
  dragOver: (event: DragEvent<HTMLElement>, row: Row) => boolean
  dragLeave: (id: string) => void
  drop: (event: DragEvent<HTMLElement>, row: Row) => boolean
}

/** A row's height in pixels: every row is the same, which is what lets only the rows in view render. */
export const LAYER_ROW = 36
/** A row's look: a pill, its focus ring inset, its start padded by its depth. */
export const ROW_LOOK =
  'group absolute inset-x-1 flex cursor-default items-center gap-1.5 rounded-[8px] pe-1 text-[13px] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset'
/** A selected layer's or picked frame's row is tinted pink, as in the mock. */
export const ROW_SELECTED = 'bg-accent/20 text-text lit'
/** A row's end label in mono, at the row's end: a box's kind, "only here", a frame's size. */
export const ROW_LABEL = 'shrink-0 font-mono text-[11px] text-subtle'
const INDENT = 16

/** Where a row sits: its place in the list and its start padded by its depth, 2 px apart so each selected row reads as its own pill. */
export const rowPlace = (i: number, depth: number) => ({
  top: i * LAYER_ROW + 1,
  height: LAYER_ROW - 2,
  paddingInlineStart: 4 + depth * INDENT,
})

/**
 * The handlers every row of the tree has, a frame's and a layer's: taking the focus, its keys, a
 * click that picks or selects it (with Shift, Ctrl or Cmd adding to the selection or taking from
 * it), a double click that renames it, and a layer dragged over, off or dropped on it.
 */
export function rowHandlers(api: RowApi, row: Row, i: number) {
  return {
    onFocus: () => api.focus(row.id),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => api.key(event, row, i),
    onClick: (event: MouseEvent<HTMLElement>) => api.click(row.id, event.shiftKey || event.metaKey || event.ctrlKey),
    onDoubleClick: () => api.rename(row.id),
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!api.dragOver(event, row)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    },
    onDragLeave: () => api.dragLeave(row.id),
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (api.drop(event, row)) event.preventDefault()
    },
  }
}

/** A row's caret, which opens and closes it; an empty space of its size on a row with nothing inside. */
export function RowCaret({
  shown,
  open,
  name,
  onToggle,
}: {
  shown: boolean
  open: boolean
  name: string
  onToggle: () => void
}) {
  const t = useMessages()
  if (!shown) return <span aria-hidden className="size-4 shrink-0" />
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={format(open ? t.editor.layersPanel.collapse : t.editor.layersPanel.expand, { name })}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-row text-subtle hover:text-text"
    >
      <CaretRightIcon
        size={11}
        weight="bold"
        aria-hidden
        className={cn(
          'transition-transform duration-[var(--chrome-fast)] rtl:-scale-x-100',
          open && 'rotate-90 rtl:-rotate-90',
        )}
      />
    </button>
  )
}
