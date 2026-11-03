'use client'

// The design's sizes, opened from the header pill after the design's name: "Sizes · 3" on desktop
// and tablet, the count alone on a phone. The panel lists each size with its picture, name and
// pixels, and its primary star, show alone and a menu (rename, move up, move down, remove); then
// Add a size, from the common presets at a tap or any size. Every change is a command, one undo step.
import * as Popover from '@radix-ui/react-popover'
import { DotsThreeIcon, EyeIcon, FrameCornersIcon, StarIcon } from '@phosphor-icons/react'
import type { Editor } from '@dazbee/editor'
import { FORMAT_PRESETS, type Design } from '@dazbee/schema'
import { useState } from 'react'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { format } from '../../lib/i18n/index.ts'
import { useMenuFocus } from './bar-popover.tsx'
import { PanelFrame } from './edit-panel.tsx'
import { setOpen, useEditState } from './edit-store.ts'
import { AddFormat, useEditorDesign } from './formats-panel.tsx'
import { CHIP, FOCUS_RING, ICON_BUTTON, MENU, MENU_DIVIDER, MENU_ITEM, PANEL_HEADING, PANEL_PART } from './styles.ts'

/** The presets Add a size offers at a tap; the rest, and any size, are under More sizes. */
const COMMON = ['feed-portrait', 'story', 'link-image', 'medium-rectangle'] as const

const sizeOf = ({ width, height }: { width: number; height: number }) => `${width} × ${height}`
/** A size as a chip shows it, short. */
const shortSizeOf = ({ width, height }: { width: number; height: number }) => `${width}×${height}`
/** A size's own button on its card: a 44 px target on a phone. */
const CARD_BUTTON = cn(ICON_BUTTON, 'max-sm:size-10')
const ordered = (design: Design) =>
  Object.entries(design.formats).sort(([a, x], [b, y]) => (x.order < y.order ? -1 : x.order > y.order ? 1 : a < b ? -1 : 1))
/** A size's picture in its proportions, its long side 34. */
const thumbOf = ({ width, height }: { width: number; height: number }) => {
  const scale = 34 / Math.max(width, height)
  return { width: Math.max(8, Math.round(width * scale)), height: Math.max(8, Math.round(height * scale)) }
}
/** The first page's background, when it is one colour: what a size's picture is filled with. */
const backgroundOf = (design: Design) => {
  const first = Object.values(design.pages).sort((x, y) => (x.order < y.order ? -1 : x.order > y.order ? 1 : 0))[0]
  const fill = first?.fills[0]
  return fill?.type === 'solid' ? fill.color : undefined
}

export function SizesButton({ editor }: { editor: Editor }) {
  const t = useMessages()
  const { design } = useEditorDesign(editor)
  const { open } = useEditState()
  const count = Object.keys(design.formats).length
  return (
    <button
      type="button"
      data-opens="sizes"
      data-testid="sizes-button"
      aria-expanded={open === 'sizes'}
      aria-label={format(t.editor.formats.button, { n: count })}
      title={format(t.editor.formats.button, { n: count })}
      onClick={() => setOpen(open === 'sizes' ? null : 'sizes')}
      className={cn('flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-[12px] font-semibold text-muted transition-colors hover:bg-hover hover:text-text aria-expanded:bg-accent-soft aria-expanded:text-accent-text', FOCUS_RING)}
    >
      <FrameCornersIcon size={14} aria-hidden />
      <span aria-hidden className="max-sm:hidden">{format(t.editor.formats.button, { n: count })}</span>
      <span aria-hidden className="font-mono tabular-nums sm:hidden">{count}</span>
    </button>
  )
}

export function SizesPanel({ editor, onRemoved }: { editor: Editor; onRemoved: (message: string) => void }) {
  const t = useMessages()
  const { open } = useEditState()
  if (open !== 'sizes') return null
  return (
    <PanelFrame id="sizes" title={t.editor.formats.title}>
      <SizeList editor={editor} onRemoved={onRemoved} />
      <AddSize editor={editor} />
    </PanelFrame>
  )
}

/** Each size: its picture, name and pixels; its star, show alone and its menu. */
function SizeList({ editor, onRemoved }: { editor: Editor; onRemoved: (message: string) => void }) {
  const t = useMessages()
  const f = t.editor.formats
  const { design, focused } = useEditorDesign(editor)
  const run = editor.session.run.bind(editor.session)
  const formats = ordered(design)
  const background = backgroundOf(design)
  const [renaming, setRenaming] = useState<string | null>(null)
  const rename = (id: string, name: string) => {
    setRenaming(null)
    const trimmed = name.trim()
    if (trimmed && trimmed !== design.formats[id]?.name) run('format.update', { id, name: trimmed })
  }
  return (
    <ul aria-label={f.title} className={cn(PANEL_PART, 'gap-1.5')} data-testid="formats">
      {formats.map(([id, size], i) => {
        const primary = design.meta.primaryFormatId === id
        return (
          <li key={id} data-format={id} data-focused={focused === id ? '' : undefined} className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface p-2 data-[focused]:border-accent data-[focused]:bg-accent-soft">
            <span aria-hidden className="grid size-[34px] shrink-0 place-items-center">
              <span className="rounded-[3px] border border-line-strong bg-hover" style={{ ...thumbOf(size), backgroundColor: background }} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              {renaming === id
                ? (
                  <input
                    name="format-name"
                    aria-label={f.rename}
                    defaultValue={size.name}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => rename(id, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') rename(id, e.currentTarget.value)
                      if (e.key === 'Escape') setRenaming(null)
                      e.stopPropagation()
                    }}
                    className="h-6 min-w-0 rounded-[6px] border border-accent bg-surface px-1.5 text-[13px] outline-none"
                  />
                )
                : (
                  <button type="button" onDoubleClick={() => setRenaming(id)} onKeyDown={(e) => e.key === 'Enter' && setRenaming(id)} aria-label={`${f.rename}: ${size.name}`} className="min-w-0 cursor-default truncate text-start text-[13px] font-semibold text-text">
                    {size.name}
                  </button>
                )}
              <span className="font-mono text-[11px] text-subtle tabular-nums">{sizeOf(size)}</span>
            </span>
            <button type="button" aria-label={primary ? f.primary : f.makePrimary} title={primary ? f.primary : f.makePrimary} aria-pressed={primary} onClick={() => primary || run('format.setPrimary', { id })} className={cn(CARD_BUTTON, primary && 'text-accent-text')}>
              <StarIcon size={15} weight={primary ? 'fill' : 'regular'} aria-hidden />
            </button>
            <button type="button" aria-label={focused === id ? f.exitFocus : f.focus} title={focused === id ? f.exitFocus : f.focus} aria-pressed={focused === id} onClick={() => editor.focus(focused === id ? null : id)} className={cn(CARD_BUTTON, focused === id && 'text-accent-text')}>
              <EyeIcon size={15} aria-hidden />
            </button>
            <SizeMenu
              name={size.name}
              first={i === 0}
              last={i === formats.length - 1}
              removable={!primary && formats.length > 1}
              onRename={() => setRenaming(id)}
              onUp={() => run('format.update', { id, before: formats[i - 1]?.[0] ?? null })}
              onDown={() => run('format.update', { id, before: formats[i + 2]?.[0] ?? null })}
              onRemove={() => {
                run('format.remove', { id })
                onRemoved(format(f.removed, { name: size.name }))
              }}
            />
          </li>
        )
      })}
    </ul>
  )
}

/** A size's menu: rename, move up, move down and remove, which a toast undoes. */
function SizeMenu({ name, first, last, removable, onRename, onUp, onDown, onRemove }: {
  name: string
  first: boolean
  last: boolean
  removable: boolean
  onRename: () => void
  onUp: () => void
  onDown: () => void
  onRemove: () => void
}) {
  const t = useMessages()
  const f = t.editor.formats
  const [open, setMenuOpen] = useState(false)
  const focus = useMenuFocus()
  const act = (run: () => void) => () => {
    setMenuOpen(false)
    run()
  }
  return (
    <Popover.Root open={open} onOpenChange={setMenuOpen}>
      <Popover.Trigger asChild>
        <button ref={focus.button} type="button" aria-label={format(f.more, { name })} title={format(f.more, { name })} className={CARD_BUTTON}>
          <DotsThreeIcon size={16} weight="bold" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} {...focus.content} aria-label={format(f.more, { name })} onKeyDown={(e) => e.stopPropagation()} className={cn(MENU, 'min-w-44')}>
          {focus.back}
          <button type="button" onClick={act(onRename)} className={MENU_ITEM}>{f.rename}</button>
          <button type="button" disabled={first} onClick={act(onUp)} className={MENU_ITEM}>{f.moveUp}</button>
          <button type="button" disabled={last} onClick={act(onDown)} className={MENU_ITEM}>{f.moveDown}</button>
          <div className={MENU_DIVIDER} />
          <button type="button" disabled={!removable} onClick={act(onRemove)} className={cn(MENU_ITEM, 'text-danger')}>{f.remove}</button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Add a size: the common presets the design doesn't have yet at a tap, and + for every preset and a size of your own. */
function AddSize({ editor }: { editor: Editor }) {
  const t = useMessages()
  const f = t.editor.formats
  const { design } = useEditorDesign(editor)
  // A preset the design has a size of already isn't offered again.
  const has = new Set(Object.values(design.formats).map(sizeOf))
  const add = (name: string, width: number, height: number) => {
    const id = editor.session.run('format.add', { name, width, height })
    // Show where the new size landed: every frame, with the new column at the end.
    if (editor.focused()) editor.focus(id)
    else editor.fitAll()
  }
  return (
    <section aria-labelledby="add-size-title" className={PANEL_PART} data-testid="add-size">
      <div className="flex h-7 items-center gap-2">
        <h3 id="add-size-title" className={cn(PANEL_HEADING, 'flex-1')}>{f.addSize}</h3>
        <AddFormat editor={editor} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COMMON.map((presetId) => {
          const preset = FORMAT_PRESETS.find((p) => p.id === presetId)
          if (!preset || has.has(sizeOf(preset))) return null
          const name = f.preset[preset.id] ?? preset.id
          return (
            <button key={preset.id} type="button" data-preset={preset.id} onClick={() => add(name, preset.width, preset.height)} className={cn(CHIP, 'h-7 gap-1.5 px-2.5 text-[12px] font-medium text-text max-sm:h-9', FOCUS_RING)}>
              {name}
              <span className="text-subtle tabular-nums">{shortSizeOf(preset)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
