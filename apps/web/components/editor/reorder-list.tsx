'use client'

// A list of fills or strokes in an edit panel: the rows the selected layers share, with + to add one
// on top; when the layers' lists differ, a way to give them all one.
import { type ReactNode } from 'react'

import { type P, set, shared, type Target } from '@/components/editor/edit-panel/target.ts'
import { cn } from '@/lib/cn.ts'
import { format } from '@/lib/i18n/index.ts'

import { AddButton, Stack } from './paint-stack.tsx'
import { FIELD_LABEL } from './styles.ts'

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
