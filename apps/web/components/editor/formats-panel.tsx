'use client'

// The design's sizes, opened from the header pill after the design's name: "Sizes · 3" on desktop
// and tablet, the count alone on a phone. The panel lists each size with its picture, name and
// pixels, and its primary star, show alone and a menu (rename, move up, move down, remove); then
// Add a size, from the common presets at a tap or any size. Every change is a command, one undo step.
import { EyeIcon, FrameCornersIcon, StarIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import type { Editor } from '@dazbee/editor'
import { type Design, FORMAT_PRESETS, inOrder } from '@dazbee/schema'

import { PanelFrame } from '@/components/editor/edit-panel/edit-panel.tsx'
import { cn } from '@/lib/cn.ts'
import { shortSizeOf, sizeOf } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { AddFormat } from './add-format.tsx'
import { CARD_BUTTON, CARD_ROW, CardMenu } from './card.tsx'
import { setOpen, useEditState } from './edit-store.ts'
import { useEditorDesign } from './editor-hooks.ts'
import { CHIP, FOCUS_RING, PANEL_HEADING, PANEL_PART } from './styles.ts'

/** The presets Add a size offers at a tap; the rest, and any size, are under More sizes. */
const COMMON = ['feed-portrait', 'story', 'link-image', 'medium-rectangle'] as const

/** A size's picture in its proportions, its long side 34. */
const thumbOf = ({ width, height }: { width: number; height: number }) => {
  const scale = 34 / Math.max(width, height)
  return { width: Math.max(8, Math.round(width * scale)), height: Math.max(8, Math.round(height * scale)) }
}
/** The first page's background, when it is one colour: what a size's picture is filled with. */
const backgroundOf = (design: Design) => {
  const fill = inOrder(design.pages)[0]?.[1].fills[0]
  return fill?.type === 'solid' ? fill.color : undefined
}

export function FormatsButton({ editor }: { editor: Editor }) {
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
      className={cn(
        'flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-[12px] font-semibold text-text transition-colors hover:bg-hover aria-expanded:border-transparent aria-expanded:bg-accent-soft aria-expanded:text-accent-text',
        FOCUS_RING,
      )}
    >
      <FrameCornersIcon size={14} aria-hidden />
      <span aria-hidden className="max-sm:hidden">
        {format(t.editor.formats.button, { n: count })}
      </span>
      <span aria-hidden className="font-mono tabular-nums sm:hidden">
        {count}
      </span>
    </button>
  )
}

export function FormatsPanel({ editor, onRemoved }: { editor: Editor; onRemoved: (message: string) => void }) {
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
  const formats = inOrder(design.formats)
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
          <li
            key={id}
            data-format={id}
            data-focused={focused === id ? '' : undefined}
            className={cn(CARD_ROW, 'data-[focused]:border-accent data-[focused]:bg-accent-soft')}
          >
            <span aria-hidden className="grid size-[34px] shrink-0 place-items-center">
              <span
                className="rounded-[3px] border border-line-strong bg-hover"
                style={{ ...thumbOf(size), backgroundColor: background }}
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              {renaming === id ? (
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
              ) : (
                <button
                  type="button"
                  onDoubleClick={() => setRenaming(id)}
                  onKeyDown={(e) => e.key === 'Enter' && setRenaming(id)}
                  aria-label={`${f.rename}: ${size.name}`}
                  className="min-w-0 cursor-default truncate text-start text-[13px] font-semibold text-text"
                >
                  {size.name}
                </button>
              )}
              <span className="font-mono text-[11px] text-subtle tabular-nums">{sizeOf(size)}</span>
            </span>
            <button
              type="button"
              aria-label={primary ? f.primary : f.makePrimary}
              title={primary ? f.primary : f.makePrimary}
              aria-pressed={primary}
              onClick={() => primary || run('format.setPrimary', { id })}
              className={cn(CARD_BUTTON, primary && 'text-accent-text')}
            >
              <StarIcon size={15} weight={primary ? 'fill' : 'regular'} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={focused === id ? f.exitFocus : f.focus}
              title={focused === id ? f.exitFocus : f.focus}
              aria-pressed={focused === id}
              onClick={() => editor.focus(focused === id ? null : id)}
              className={cn(CARD_BUTTON, focused === id && 'text-accent-text')}
            >
              <EyeIcon size={15} aria-hidden />
            </button>
            <CardMenu
              label={format(f.more, { name: size.name })}
              items={[
                { label: f.rename, run: () => setRenaming(id) },
                {
                  label: f.moveUp,
                  disabled: i === 0,
                  run: () => run('format.update', { id, before: formats[i - 1]?.[0] ?? null }),
                },
                {
                  label: f.moveDown,
                  disabled: i === formats.length - 1,
                  run: () => run('format.update', { id, before: formats[i + 2]?.[0] ?? null }),
                },
                {
                  label: f.remove,
                  disabled: primary || formats.length === 1,
                  danger: true,
                  run: () => {
                    run('format.remove', { id })
                    onRemoved(format(f.removed, { name: size.name }))
                  },
                },
              ]}
            />
          </li>
        )
      })}
    </ul>
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
        <h3 id="add-size-title" className={cn(PANEL_HEADING, 'flex-1')}>
          {f.addSize}
        </h3>
        <AddFormat editor={editor} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COMMON.map((presetId) => {
          const preset = FORMAT_PRESETS.find((p) => p.id === presetId)
          if (!preset || has.has(sizeOf(preset))) return null
          const name = f.preset[preset.id] ?? preset.id
          return (
            <button
              key={preset.id}
              type="button"
              data-preset={preset.id}
              onClick={() => add(name, preset.width, preset.height)}
              className={cn(CHIP, 'h-7 gap-1.5 px-2.5 text-[12px] font-medium text-text max-sm:h-9', FOCUS_RING)}
            >
              {name}
              <span className="text-subtle tabular-nums">{shortSizeOf(preset)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
