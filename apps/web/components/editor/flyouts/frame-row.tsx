'use client'

// One frame's row in the layers panel's tree: its caret, a swatch of its background as it looks, its
// name and its size, as in the mock. A click picks the frame and a double click renames it in place. A layer
// of this frame dragged onto it goes to the frame's top.
import { memo } from 'react'

import { MIXED_COLOUR } from '@/components/editor/styles.ts'
import { LIT_ROW } from '@/components/ui/looks.ts'
import { RenameField } from '@/components/ui/rename-field.tsx'
import { cn } from '@/lib/cn.ts'
import type { FrameTreeRow } from '@/lib/editor/layer-tree.ts'
import { shortSizeOf } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { ROW_LABEL, ROW_LOOK, ROW_SELECTED, type RowApi, RowCaret, rowHandlers, rowPlace } from './tree-row.tsx'

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
  pitch,
  api,
}: {
  row: FrameTreeRow
  i: number
  picked: boolean
  focusable: boolean
  renaming: boolean
  open: boolean
  /** The frame's background as its swatch shows it: a colour, see-through or not, mixed for an image, or none. */
  swatch: string
  dropInto: boolean
  /** The rows' height on this screen. */
  pitch: number
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
      {...rowHandlers(api, row, i)}
      style={rowPlace(i, 0, pitch)}
      className={cn(ROW_LOOK, picked ? ROW_SELECTED : LIT_ROW, dropInto && 'ring-2 ring-accent ring-inset')}
    >
      <RowCaret shown={row.hasChildren} open={open} name={frame.name} onToggle={() => api.toggle(id)} />
      {/* Over a checkerboard, so a see-through background shows as one; its edge stays neutral when picked. */}
      <span
        aria-hidden
        data-testid="frame-swatch"
        className="checker relative size-[22px] shrink-0 overflow-hidden rounded-[5px] border border-line"
      >
        <span
          className="absolute inset-0"
          style={{ background: swatch === 'none' ? 'transparent' : swatch === 'mixed' ? MIXED_COLOUR : swatch }}
        />
      </span>
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
        // Isolated left to right, so it reads width × height in a right-to-left language too.
        <span data-testid="frame-size" dir="ltr" className={cn(ROW_LABEL, 'pe-1.5')}>
          {shortSizeOf(frame)}
        </span>
      )}
    </div>
  )
})
