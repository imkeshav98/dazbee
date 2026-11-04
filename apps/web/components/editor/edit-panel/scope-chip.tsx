'use client'

// The scope chip: where a change goes when a design has more than one format, and what the format
// shown has of its own, each part with Reset.
import { CaretDownIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { type ReactNode } from 'react'

import { type Editor } from '@dazbee/editor'
import { type Design, formatScope } from '@dazbee/schema'

import { setEveryFormat, useEveryFormat } from '@/components/editor/edit-store.ts'
import { CHIP, CHIP_ACCENT, LINK_BUTTON, POPOVER } from '@/components/editor/styles.ts'
import { FOCUS_RING, SEGMENT, SEGMENTS } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { type P, type Target } from './target.ts'

type OwnGroup = keyof P['ownGroups']

/** Which card's words name a property a format can have of its own. */
const OWN_GROUP: Record<string, OwnGroup> = {
  x: 'layout',
  y: 'layout',
  width: 'layout',
  height: 'layout',
  rotation: 'layout',
  sizing: 'layout',
  absolute: 'layout',
  opacity: 'appearance',
  blendMode: 'appearance',
  visible: 'appearance',
  fills: 'fill',
  strokes: 'stroke',
  effects: 'effects',
  shape: 'shape',
  cornerRadius: 'shape',
  text: 'text',
  runs: 'text',
  style: 'text',
  align: 'text',
  verticalAlign: 'text',
  direction: 'text',
  boxMode: 'text',
  list: 'text',
  paragraphSpacing: 'text',
  maxLines: 'text',
  shrinkToFit: 'text',
  layout: 'autoLayout',
}

/**
 * The scope chip, the top bar's first item when the design has more than one format: which formats
 * a change goes to, and the own changes of the one shown, each with Reset.
 */
export function ScopeChip({
  target,
  design,
  open,
  onOpen,
}: {
  target: Target
  design: Design
  open: boolean
  onOpen: (open: boolean) => void
}) {
  const p = useMessages().editor.props
  const everyFormat = useEveryFormat()
  if (Object.keys(design.formats).length < 2) return null
  return (
    <ScopeMenu
      everyFormat={everyFormat}
      onChange={setEveryFormat}
      size={design.formats[target.formatId]?.name ?? ''}
      p={p}
      open={open}
      onOpen={onOpen}
    >
      <OwnChanges design={design} ids={target.ids} formatId={target.formatId} editor={target.editor} p={p} />
    </ScopeMenu>
  )
}

/**
 * Where changes go when a design has more than one size: a chip in the header card naming them, which
 * opens to choose all sizes or only this one, and to reset what this size has of its own.
 */
function ScopeMenu({
  everyFormat,
  onChange,
  size,
  p,
  open,
  onOpen,
  children,
}: {
  everyFormat: boolean
  onChange: (every: boolean) => void
  size: string
  p: P
  open: boolean
  onOpen: (open: boolean) => void
  children?: ReactNode
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-bar-item
          data-testid="scope-chip"
          className={cn(CHIP_ACCENT, 'shrink-0', FOCUS_RING)}
        >
          {everyFormat ? p.forAllSizes : format(p.onlySize, { size })}
          <CaretDownIcon size={10} weight="bold" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-label={p.applyTo}
          data-testid="scope-menu"
          className={cn(POPOVER, 'flex w-64 flex-col gap-2.5 p-2.5')}
        >
          <div role="radiogroup" aria-label={p.applyTo} className={SEGMENTS}>
            {([true, false] as const).map((every) => (
              <button
                key={String(every)}
                type="button"
                role="radio"
                aria-checked={everyFormat === every}
                onClick={() => onChange(every)}
                className={SEGMENT}
              >
                {every ? p.allSizes : format(p.onlySize, { size })}
              </button>
            ))}
          </div>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * What the format shown has of its own for the selected layers (#157), grouped as the cards are;
 * each group, or all of them, goes back to following the other formats in one undo step.
 */
function OwnChanges({
  design,
  ids,
  formatId,
  editor,
  p,
}: {
  design: Design
  ids: string[]
  formatId: string
  editor: Editor
  p: P
}) {
  const scope = formatScope(formatId)
  const byNode = design.overrides[scope] ?? {}
  const paths = [...new Set(ids.flatMap((id) => Object.keys(byNode[id] ?? {})))]
  if (paths.length === 0) return null
  const groups = new Map<OwnGroup, string[]>()
  for (const path of paths) {
    const group = OWN_GROUP[path] ?? 'other'
    groups.set(group, [...(groups.get(group) ?? []), path])
  }
  const reset = (only?: string[]) => editor.resetOwn(ids, scope, only)
  const name = design.formats[formatId]?.name ?? ''
  return (
    <div data-testid="own-changes" className="flex flex-col gap-1">
      <p className="px-1 text-[11px] font-semibold text-subtle">{format(p.ownChanges, { format: name })}</p>
      <ul className="flex flex-col">
        {[...groups].map(([group, groupPaths]) => (
          <li key={group} className="flex h-8 items-center justify-between gap-2 px-1 text-[13px]">
            <span className="min-w-0 truncate">{p.ownGroups[group]}</span>
            <button
              type="button"
              onClick={() => reset(groupPaths)}
              aria-label={format(p.resetOwn, { name: p.ownGroups[group] })}
              className={LINK_BUTTON}
            >
              {p.reset}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => reset()} className={cn(CHIP, 'mt-1 h-8 w-full justify-center')}>
        {p.resetAll}
      </button>
    </div>
  )
}
