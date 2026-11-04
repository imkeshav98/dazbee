'use client'

// One row of the layers panel's tree: its layer's picture or icon, name and kind, and its hide and
// lock toggles. The panel hands every row one set of handlers, so a row renders again only when what
// it shows changes.
import {
  BoundingBoxIcon,
  CaretRightIcon,
  CircleIcon,
  EyeIcon,
  EyeSlashIcon,
  FolderSimpleIcon,
  type Icon,
  ImageIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  PenNibIcon,
  SquareIcon,
  TextTIcon,
  UniteIcon,
} from '@phosphor-icons/react'
import { type DragEvent, type KeyboardEvent, memo } from 'react'

import { type Design, LOCK_FLAGS } from '@dazbee/schema'

import { DROP_LINE, LAYER_PICTURE, LAYER_PICTURE_PICKED } from '@/components/editor/styles.ts'
import { RenameField } from '@/components/ui/rename-field.tsx'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

type Layer = Design['nodes'][string]
export interface Row {
  id: string
  node: Layer
  depth: number
  parentId: string
  hasChildren: boolean
  position: number
  siblings: number
}
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
const INDENT = 16
const DRAG_TYPE = 'application/x-dazbee-layer'

const isLocked = (node: Layer) => LOCK_FLAGS.some((flag) => node.lock?.[flag])

function iconOf(node: Layer): Icon {
  if (node.type === 'text') return TextTIcon
  if (node.type === 'group') return FolderSimpleIcon
  if (node.type === 'box') return BoundingBoxIcon
  if (node.type === 'boolean') return UniteIcon
  const props = node.props as { shape?: { kind?: string }; fills?: { type: string }[] }
  if (props.fills?.some((f) => f.type === 'image')) return ImageIcon
  if (props.shape?.kind === 'ellipse') return CircleIcon
  if (props.shape?.kind === 'path') return PenNibIcon
  return SquareIcon
}

/** One row of the tree. Rendered again only when something it shows changes. */
export const LayerRow = memo(function LayerRow({
  row,
  i,
  selected,
  focusable,
  renaming,
  open,
  hidden,
  drop,
  picture,
  api,
}: {
  row: Row
  i: number
  selected: boolean
  focusable: boolean
  renaming: boolean
  open: boolean
  hidden: boolean
  drop: Where | null
  picture: string | null
  api: RowApi
}) {
  const t = useMessages()
  const { id, node, depth } = row
  const locked = isLocked(node)
  const LayerIcon = iconOf(node)
  // A box says whether it is plain or stacks what it holds.
  const kind =
    node.type === 'box'
      ? (node.props as { layout?: unknown }).layout
        ? t.editor.layersPanel.stack
        : t.editor.layersPanel.box
      : null
  return (
    <div
      key={id}
      role="treeitem"
      data-layer={id}
      aria-level={depth + 1}
      aria-setsize={row.siblings}
      aria-posinset={row.position}
      aria-selected={selected}
      aria-expanded={row.hasChildren ? open : undefined}
      data-drop={drop ?? undefined}
      tabIndex={focusable ? 0 : -1}
      draggable={!renaming}
      onFocus={() => api.focus(id)}
      onKeyDown={(event) => api.key(event, row, i)}
      onClick={(event) => api.click(id, event.shiftKey || event.metaKey || event.ctrlKey)}
      onDoubleClick={() => api.rename(id)}
      onDragStart={(event) => {
        api.dragStart(id)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData(DRAG_TYPE, id)
      }}
      onDragEnd={() => api.dragEnd()}
      onDragOver={(event) => {
        if (!api.dragOver(event, row)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDragLeave={() => api.dragLeave(id)}
      onDrop={(event) => {
        if (api.drop(event, row)) event.preventDefault()
      }}
      // A 2 px gap between rows, so each selected row reads as its own pill.
      style={{ top: i * LAYER_ROW + 1, height: LAYER_ROW - 2, paddingInlineStart: 4 + depth * INDENT }}
      className={cn(
        'group absolute inset-x-1 flex cursor-default items-center gap-1.5 rounded-[8px] pe-1 text-[13px] font-medium outline-none select-none',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
        // The selected row is tinted pink, its type tile solid pink, as in the mock.
        selected ? 'bg-accent/20 text-text' : 'hover:bg-hover',
        drop === 'into' && 'ring-2 ring-accent ring-inset',
        hidden && 'text-subtle',
      )}
    >
      {drop === 'above' && <span aria-hidden className={cn(DROP_LINE, '-top-px')} />}
      {drop === 'below' && <span aria-hidden className={cn(DROP_LINE, '-bottom-px')} />}
      {row.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={format(open ? t.editor.layersPanel.collapse : t.editor.layersPanel.expand, { name: node.name })}
          onClick={(event) => {
            event.stopPropagation()
            api.toggle(id)
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
      ) : (
        <span aria-hidden className="size-4 shrink-0" />
      )}
      <span
        aria-hidden
        data-testid="layer-picture"
        className={cn(
          'grid size-[22px] shrink-0 place-items-center overflow-hidden rounded-[5px] transition-colors duration-[var(--chrome-fast)]',
          picture ? LAYER_PICTURE : selected ? 'bg-accent-solid text-on-accent' : 'bg-text/10 text-muted',
          picture && selected && LAYER_PICTURE_PICKED,
        )}
      >
        {picture ? (
          <img src={picture} alt="" draggable={false} className="size-full object-contain" />
        ) : (
          <LayerIcon size={13} weight={selected ? 'bold' : 'regular'} />
        )}
      </span>
      {renaming ? (
        <RenameField
          name={node.name}
          label={format(t.editor.layersPanel.rename, { name: node.name })}
          inputName="layer-name"
          maxLength={120}
          className="h-6 min-w-0 flex-1 rounded-row border border-accent bg-raised px-1.5 text-[13px] outline-none"
          onDone={(name, byKey) => api.renamed(id, name, node.name, byKey)}
        />
      ) : (
        <span
          data-testid="layer-name"
          className={cn('min-w-0 flex-1 truncate', hidden && 'line-through decoration-subtle/60')}
        >
          {node.name}
        </span>
      )}
      {kind && !renaming && (
        <span data-testid="layer-kind" className="shrink-0 font-mono text-[11px] text-subtle">
          {kind}
        </span>
      )}
      <RowToggle
        on={hidden}
        label={format(hidden ? t.editor.layersPanel.show : t.editor.layersPanel.hide, { name: node.name })}
        state={hidden ? 'hidden' : 'shown'}
        onToggle={() => api.hide(id, !hidden)}
        icon={hidden ? EyeSlashIcon : EyeIcon}
        testId="layer-hide"
      />
      <RowToggle
        on={locked}
        label={format(locked ? t.editor.layersPanel.unlock : t.editor.layersPanel.lock, { name: node.name })}
        onToggle={() => api.lock(id, !locked)}
        icon={locked ? LockSimpleIcon : LockSimpleOpenIcon}
        testId="layer-lock"
      />
    </div>
  )
})

/** Lock or hide on a row: shown while the row is hovered or focused, and always while it is on. */
function RowToggle({
  on,
  label,
  state,
  onToggle,
  icon: ToggleIcon,
  testId,
}: {
  on: boolean
  label: string
  state?: string
  onToggle: () => void
  icon: Icon
  testId: string
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={on}
      data-state={state}
      data-testid={testId}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className={cn(
        'grid size-6 shrink-0 cursor-pointer place-items-center rounded-[6px] text-subtle hover:bg-hover hover:text-text',
        !on && 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
      )}
    >
      <ToggleIcon size={14} aria-hidden />
    </button>
  )
}
