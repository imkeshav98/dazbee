'use client'

// One layer's row in the layers panel's tree: its picture or icon, name and kind, "only here" when
// none of its frame's linked frames holds a copy of it, and its hide and lock toggles, which act on
// this layer alone. A picture about the colour of its tile in a theme shows on a backdrop that sets
// it off there. The panel hands every row one set of handlers, so a row renders again only when what
// it shows changes.
import {
  BoundingBoxIcon,
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
import { memo, useState } from 'react'

import { type Design, LOCK_FLAGS } from '@dazbee/schema'

import { DROP_LINE, LAYER_PICTURE, LAYER_PICTURE_PICKED } from '@/components/editor/styles.ts'
import { LIT_ROW } from '@/components/ui/looks.ts'
import { RenameField } from '@/components/ui/rename-field.tsx'
import { cn } from '@/lib/cn.ts'
import type { LayerTreeRow } from '@/lib/editor/layer-tree.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { ROW_LABEL, ROW_LOOK, ROW_SELECTED, type RowApi, RowCaret, rowPlace, type Where } from './tree-row.tsx'

type Layer = Design['nodes'][string]

const DRAG_TYPE = 'application/x-dazbee-layer'
/**
 * The mean luminance of a picture under which it nearly vanishes on the dark theme's tile, and over
 * which on the light theme's: under 2:1 contrast with each (#1b1621 and #ffffff, the `--surface` of
 * styles/tokens.css).
 */
const DARK_CLOSE = 0.069
const LIGHT_CLOSE = 0.475
/** A picture's backdrop in the theme its colour is close to: the text colour, inset round it. */
const BACKDROP = {
  dark: 'dark:bg-text dark:p-[3px]',
  light: '[[data-theme=light]_&]:bg-text [[data-theme=light]_&]:p-[3px]',
}

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

/**
 * Which theme's tile a drawn picture is about the colour of, by the mean colour of its pixels; null
 * when it reads on both.
 */
function closeTheme(img: HTMLImageElement): keyof typeof BACKDROP | null {
  const paint = document.createElement('canvas')
  const scale = Math.min(1, 32 / Math.max(img.naturalWidth, img.naturalHeight, 1))
  paint.width = Math.max(1, Math.round(img.naturalWidth * scale))
  paint.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const g = paint.getContext('2d', { willReadFrequently: true })
  if (!g) return null
  g.drawImage(img, 0, 0, paint.width, paint.height)
  const data = g.getImageData(0, 0, paint.width, paint.height).data
  const sum = [0, 0, 0]
  let weight = 0
  for (let i = 0; i < data.length; i += 4) {
    const a = (data[i + 3] ?? 0) / 255
    for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (data[i + c] ?? 0) * a
    weight += a
  }
  if (weight === 0) return null
  const [r = 0, gr = 0, b = 0] = sum.map((c) => {
    const v = c / weight / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * gr + 0.0722 * b
  return luminance < DARK_CLOSE ? 'dark' : luminance > LIGHT_CLOSE ? 'light' : null
}

/** A layer's row. Rendered again only when something it shows changes. */
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
  row: LayerTreeRow
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
  // The theme whose tile the picture is about the colour of, read once it has loaded.
  const [close, setClose] = useState<keyof typeof BACKDROP | null>(null)
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
      data-row={id}
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
      style={rowPlace(i, depth)}
      className={cn(
        ROW_LOOK,
        'font-medium',
        // The selected row's type tile is solid pink, as in the mock.
        selected ? ROW_SELECTED : LIT_ROW,
        drop === 'into' && 'ring-2 ring-accent ring-inset',
        hidden && 'text-subtle',
      )}
    >
      {drop === 'above' && <span aria-hidden className={cn(DROP_LINE, '-top-px')} />}
      {drop === 'below' && <span aria-hidden className={cn(DROP_LINE, '-bottom-px')} />}
      <RowCaret shown={row.hasChildren} open={open} name={node.name} onToggle={() => api.toggle(id)} />
      <span
        aria-hidden
        data-testid="layer-picture"
        className={cn(
          'grid size-[22px] shrink-0 place-items-center overflow-hidden rounded-[5px] transition-colors duration-[var(--chrome-fast)]',
          picture || !selected ? LAYER_PICTURE : 'bg-accent-solid text-on-accent',
          !picture && !selected && 'text-muted',
          picture && selected && LAYER_PICTURE_PICKED,
          picture && close && BACKDROP[close],
        )}
      >
        {picture ? (
          <img
            src={picture}
            alt=""
            draggable={false}
            onLoad={(event) => setClose(closeTheme(event.currentTarget))}
            className="size-full object-contain"
          />
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
      {/* The end labels line up with the frames' sizes, after the toggles. */}
      {kind && !renaming && (
        <span data-testid="layer-kind" className={cn(ROW_LABEL, 'pe-1.5')}>
          {kind}
        </span>
      )}
      {row.onlyHere && !renaming && (
        <span data-testid="layer-only-here" className={cn(ROW_LABEL, 'pe-1.5')}>
          {t.editor.layersPanel.onlyHere}
        </span>
      )}
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
        'grid size-6 shrink-0 cursor-pointer place-items-center rounded-[6px] text-subtle hover:bg-hover hover:text-text active:bg-pressed',
        !on && 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
      )}
    >
      <ToggleIcon size={14} aria-hidden />
    </button>
  )
}
