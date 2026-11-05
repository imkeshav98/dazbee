'use client'

// One frame's row in the layers panel's tree: its caret, a swatch of its background, its name and
// its size, as in the mock. A click picks the frame and a double click renames it in place. A layer
// of this frame dragged onto it goes to the frame's top.
import { memo } from 'react'

import { LAYER_PICTURE, MIXED_COLOUR } from '@/components/editor/styles.ts'
import { LIT_ROW } from '@/components/ui/looks.ts'
import { RenameField } from '@/components/ui/rename-field.tsx'
import { cn } from '@/lib/cn.ts'
import type { FrameTreeRow } from '@/lib/editor/layer-tree.ts'
import { shortSizeOf } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { ROW_LABEL, ROW_LOOK, ROW_SELECTED, type RowApi, RowCaret, rowPlace } from './tree-row.tsx'

/** A frame's row. Rendered again only when something it shows changes. */
export const FrameRow = memo(function FrameRow({
  row,
  i,
  picked,
  focusable,
  renaming,
  open,
  swatch,
  dropInto,
  api,
}: {
  row: FrameTreeRow
  i: number
  picked: boolean
  focusable: boolean
  renaming: boolean
  open: boolean
  /** The frame's background as its swatch shows it: a colour, mixed for an image or gradient, or none. */
  swatch: string
  dropInto: boolean
  api: RowApi
}) {
  const t = useMessages()
  const { id, frame } = row
  return (
    <div
      role="treeitem"
      data-frame={id}
      data-row={id}
      aria-level={1}
      aria-setsize={row.siblings}
      aria-posinset={row.position}
      aria-selected={picked}
      aria-expanded={row.hasChildren ? open : undefined}
      data-drop={dropInto ? 'into' : undefined}
      tabIndex={focusable ? 0 : -1}
      onFocus={() => api.focus(id)}
      onKeyDown={(event) => api.key(event, row, i)}
      onClick={(event) => api.click(id, event.shiftKey || event.metaKey || event.ctrlKey)}
      onDoubleClick={() => api.rename(id)}
      onDragOver={(event) => {
        if (!api.dragOver(event, row)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDragLeave={() => api.dragLeave(id)}
      onDrop={(event) => {
        if (api.drop(event, row)) event.preventDefault()
      }}
      style={rowPlace(i, 0)}
      className={cn(ROW_LOOK, picked ? ROW_SELECTED : LIT_ROW, dropInto && 'ring-2 ring-accent ring-inset')}
    >
      <RowCaret shown={row.hasChildren} open={open} name={frame.name} onToggle={() => api.toggle(id)} />
      <span
        aria-hidden
        data-testid="frame-swatch"
        className={cn('size-[22px] shrink-0 rounded-[5px]', LAYER_PICTURE, picked && 'border-accent')}
        style={{
          background: swatch === 'none' ? 'transparent' : swatch === 'mixed' ? MIXED_COLOUR : swatch,
        }}
      />
      {renaming ? (
        <RenameField
          name={frame.name}
          label={format(t.editor.frames.nameOf, { name: frame.name })}
          inputName="frame-name"
          maxLength={120}
          className="h-6 min-w-0 flex-1 rounded-row border border-accent bg-raised px-1.5 text-[13px] font-bold outline-none"
          onDone={(name, byKey) => api.renamed(id, name, frame.name, byKey)}
        />
      ) : (
        <span data-testid="frame-name" className="min-w-0 flex-1 truncate font-bold">
          {frame.name}
        </span>
      )}
      {!renaming && (
        <span data-testid="frame-size" className={cn(ROW_LABEL, 'pe-1.5')}>
          {shortSizeOf(frame)}
        </span>
      )}
    </div>
  )
})
