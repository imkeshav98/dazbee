'use client'

// A list of fills or strokes in an edit panel: the rows the selected layers share, with + to add one
// on top; when the layers' lists differ, a way to give them all one.
import { DotsSixVerticalIcon, MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { type CSSProperties, type ReactNode, useRef, useState } from 'react'

import { type P, set, shared, type Target } from '@/components/editor/edit-panel/target.ts'
import { FOCUS_RING } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { FIELD_LABEL, ICON_BUTTON } from './styles.ts'

/** A list of fills or strokes: the rows the selected layers share, and adding one on top. */
function useList<T>(target: Target, field: string, fresh: T, onTop: T, topFirst: boolean) {
  const list = shared(target.props.map((pr) => (pr[field] ?? []) as T[]))
  const write = (to: (now: T[]) => T[]) => set(target, (now) => ({ [field]: to((now[field] ?? []) as T[]) }))
  const add = () =>
    write((now) => (list === 'mixed' && !topFirst ? [fresh] : [...now, now.length === 0 ? fresh : onTop]))
  return { list, write, add }
}

export function ListBody<T>({
  title,
  item = title,
  p,
  target,
  field,
  fresh,
  onTop = fresh,
  topFirst = false,
  header = true,
  testId,
  render,
}: {
  /** What one row is called in its add and remove buttons, where it differs from `title`. */
  item?: string
  /** What + adds over a list that has items already; `fresh` starts an empty one. */
  onTop?: T
  /** The last item, drawn on top, shows first, and rows can be reordered. */
  topFirst?: boolean
  /** Its name with +; without it, + is in the card's header. */
  header?: boolean
  title: string
  p: P
  target: Target
  field: string
  fresh: T
  testId: string
  /** `n` is the row's place as shown, from 1; `change` takes the item as the document holds it when the change is made, not as last drawn. */
  render: (item: T, n: number, change: (to: (now: T) => T) => void) => ReactNode
}) {
  const { list, write, add } = useList(target, field, fresh, onTop, topFirst)
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {header && (
        <div className={cn('flex items-center justify-between', FIELD_LABEL)}>
          {title}
          <AddButton label={format(p.add, { name: item.toLowerCase() })} onClick={add} />
        </div>
      )}
      {list === 'mixed' ? (
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          {p.mixedList}
          <button
            type="button"
            onClick={() => write(() => [fresh])}
            className="cursor-pointer font-medium text-accent-text hover:underline"
          >
            {p.useOne}
          </button>
        </div>
      ) : (
        <Stack
          items={list}
          field={field}
          topFirst={topFirst}
          removeLabel={(n) => format(p.remove, { name: item.toLowerCase(), n })}
          onWrite={write}
          render={render}
        />
      )}
    </div>
  )
}

/**
 * Rows of a list the cards edit (fills, strokes, effects): each with a remove button. With
 * `topFirst` the last item, the one drawn on top, is the first row, and rows can be dragged by
 * their grip, or moved with its arrow keys, into another order.
 */
export function Stack<T>({
  items,
  field,
  topFirst = false,
  removeLabel,
  onWrite,
  render,
}: {
  items: T[]
  /** What the list holds, for each row's `data-item`, `<field>-<index>`. */
  field: string
  topFirst?: boolean
  /** The remove button's name for the row at a place, counted from 1 in the order shown. */
  removeLabel: (n: number) => string
  onWrite: (to: (now: T[]) => T[]) => void
  /** A row's content; `n` is its place in the order shown, from 1. */
  render: (item: T, n: number, change: (to: (now: T) => T) => void) => ReactNode
}) {
  const t = useMessages()
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const grips = useRef(new Map<number, HTMLButtonElement>())
  const shown = items.map((_, i) => i)
  if (topFirst) shown.reverse()
  /** Moves the item at `from` to where the item at `to` is, as the document holds them. */
  const reorder = (from: number, to: number) => {
    if (from === to) return
    onWrite((now) => {
      const next = [...now]
      const [moved] = next.splice(from, 1)
      if (moved === undefined) return now
      next.splice(to, 0, moved)
      return next
    })
  }
  return (
    <>
      {shown.map((i, row) => {
        const item = items[i] as T
        const n = row + 1
        const style: CSSProperties | undefined =
          over === i && dragging !== null && dragging !== i
            ? { boxShadow: `inset 0 ${dragging < i === topFirst ? 2 : -2}px 0 var(--accent)` }
            : undefined
        return (
          // Paints have no ids; their place in the list is what they are.
          <div
            key={i}
            className="flex items-center gap-1 rounded-row"
            style={style}
            data-item={`${field}-${i}`}
            data-row={n}
            draggable={topFirst}
            onDragStart={(e) => {
              setDragging(i)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              if (dragging === null) return
              e.preventDefault()
              setOver(i)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragging !== null) reorder(dragging, i)
              setDragging(null)
              setOver(null)
            }}
            onDragEnd={() => {
              setDragging(null)
              setOver(null)
            }}
          >
            {topFirst && (
              <button
                type="button"
                aria-label={format(t.editor.props.moveRow, { n })}
                title={t.editor.props.moveHint}
                data-testid="row-grip"
                ref={(el) => {
                  if (el) grips.current.set(i, el)
                  else grips.current.delete(i)
                }}
                onKeyDown={(e) => {
                  // Up moves a row towards the top coat, which is the end of the list.
                  const to = e.key === 'ArrowUp' ? i + 1 : e.key === 'ArrowDown' ? i - 1 : null
                  if (to === null) return
                  e.preventDefault()
                  e.stopPropagation()
                  if (to < 0 || to >= items.length) return
                  reorder(i, to)
                  // The grip goes with its paint, so the next press moves it on.
                  requestAnimationFrame(() => grips.current.get(to)?.focus())
                }}
                className={cn(
                  'grid w-4 shrink-0 cursor-grab place-items-center self-stretch text-subtle hover:text-text active:cursor-grabbing',
                  FOCUS_RING,
                )}
              >
                <DotsSixVerticalIcon size={14} weight="bold" aria-hidden />
              </button>
            )}
            {render(item, n, (to) => onWrite((now) => now.map((x, j) => (j === i ? to(x) : x))))}
            <RemoveButton label={removeLabel(n)} onClick={() => onWrite((now) => now.filter((_, j) => j !== i))} />
          </div>
        )
      })}
    </>
  )
}

/** Takes one item out of a list the cards edit. */
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={ICON_BUTTON}>
      <MinusIcon size={14} aria-hidden />
    </button>
  )
}

/** Adds an item to a list the cards edit. */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={ICON_BUTTON}>
      <PlusIcon size={14} aria-hidden />
    </button>
  )
}
