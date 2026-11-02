'use client'

// The design's pages in the inspector: add, duplicate, rename, reorder (by dragging or the arrows)
// and delete them, and bring one into view. Every change is a command, so it is one undo step and reaches the other tabs.
import { CaretDownIcon, CaretUpIcon, CopyIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react'
import type { Editor } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'
import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { format } from '../../lib/i18n/index.ts'
import { Tooltip } from '../ui/tooltip.tsx'
import { CARD, CardHeader } from './card.tsx'
import { afterDraws, sameUrls } from './after-draws.ts'
import { useEditorDesign } from './formats-panel.tsx'
import { CHIP, DROP_LINE, ICON_BUTTON } from './styles.ts'

const ordered = (design: Design) =>
  Object.entries(design.pages).sort(([a, x], [b, y]) => (x.order < y.order ? -1 : x.order > y.order ? 1 : a < b ? -1 : 1))

/** Each page's picture in the primary format, drawn once the stage settles and again once its fonts and images arrive. */
function usePagePictures(editor: Editor): Record<string, string | null> {
  const [pictures, setPictures] = useState<Record<string, string | null>>({})
  useEffect(() => afterDraws(editor, () => {
    const next = Object.fromEntries(Object.keys(editor.session.design().pages).map((id) => [id, editor.pageThumbnail(id, 72)]))
    setPictures((now) => (sameUrls(now, next) ? now : next))
  }), [editor])
  return pictures
}

export function PagesPanel({ editor, onRemoved, onShow }: { editor: Editor; onRemoved: (message: string) => void; onShow?: (pageId: string) => void }) {
  const t = useMessages()
  const { design } = useEditorDesign(editor)
  const pages = ordered(design)
  const [renaming, setRenaming] = useState<string | null>(null)
  // The page last brought into view from here; the stage itself shows every page.
  const [current, setCurrent] = useState<string | null>(null)
  // The page being dragged, and the page it would land before (null for the end).
  const [dragging, setDragging] = useState<string | null>(null)
  const [landing, setLanding] = useState<{ before: string | null } | null>(null)
  const run = editor.session.run.bind(editor.session)
  const pictures = usePagePictures(editor)

  const show = (id: string) => {
    setCurrent(id)
    onShow?.(id)
    // After the command's redraw, so a new page's row is in the grid already.
    requestAnimationFrame(() => editor.fitPage(id))
  }
  const rename = (id: string, name: string) => {
    setRenaming(null)
    const trimmed = name.trim()
    if (trimmed && trimmed !== design.pages[id]?.name) run('page.update', { id, name: trimmed })
  }
  // Landing just before or after the dragged page leaves the order as it is.
  const from = pages.findIndex(([p]) => p === dragging)
  const to = landing?.before === null ? pages.length : pages.findIndex(([p]) => p === landing?.before)
  const moves = dragging !== null && landing !== null && to !== from && to !== from + 1
  const drop = () => {
    if (moves) run('page.move', { id: dragging, before: landing.before })
    setDragging(null)
    setLanding(null)
  }
  const add = () => {
    // "Page N" after the last, skipping a name a page already has.
    const names = new Set(pages.map(([, p]) => p.name))
    let n = pages.length + 1
    while (names.has(format(t.editor.pages.newName, { n }))) n++
    show(run('page.add', { name: format(t.editor.pages.newName, { n }) }))
  }

  const formatCount = Object.keys(design.formats).length
  const primary = design.formats[design.meta.primaryFormatId]
  // Each page's tile: a picture of it in the primary format, on its background until one is drawn.
  const tile = primary ? { width: Math.round(36 * Math.min(1, primary.width / primary.height)), height: Math.round(36 * Math.min(1, primary.height / primary.width)) } : { width: 36, height: 36 }

  return (
    <section aria-labelledby="pages-title" className={CARD}>
      <CardHeader id="pages-title" title={t.editor.pages.title} count={pages.length} />
      <ol aria-label={t.editor.pages.title} className="flex flex-col gap-1 px-2.5" data-testid="pages">
        {pages.map(([id, page], i) => {
          const fill = page.fills[0]
          const picture = pictures[id]
          return (
            <li
              key={id}
              data-page={id}
              aria-current={current === id ? 'page' : undefined}
              data-dragging={dragging === id ? '' : undefined}
              draggable={renaming !== id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('application/x-dazbee-page', id)
                setDragging(id)
              }}
              onDragOver={(e) => {
                if (!dragging) return
                e.preventDefault()
                const box = e.currentTarget.getBoundingClientRect()
                const before = e.clientY < box.top + box.height / 2 ? id : (pages[i + 1]?.[0] ?? null)
                if (landing?.before !== before) setLanding({ before })
              }}
              onDrop={(e) => {
                e.preventDefault()
                drop()
              }}
              onDragEnd={() => {
                setDragging(null)
                setLanding(null)
              }}
              className="group relative flex h-12 cursor-grab items-center gap-2.5 rounded-[10px] ps-1.5 pe-1 hover:bg-hover active:cursor-grabbing aria-[current]:bg-accent-soft data-[dragging]:opacity-40"
            >
              {moves && landing?.before === id && <span aria-hidden className={cn(DROP_LINE, '-top-[3px]')} />}
              {moves && landing?.before === null && i === pages.length - 1 && <span aria-hidden className={cn(DROP_LINE, '-bottom-[3px]')} />}
              <span aria-hidden className="grid size-9 shrink-0 place-items-center">
                <span
                  data-testid="page-thumbnail"
                  className="relative grid place-items-center overflow-hidden rounded-[4px] border border-line-strong bg-hover font-mono text-[10px] font-semibold text-white tabular-nums [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]"
                  style={{ ...tile, backgroundColor: fill?.type === 'solid' ? fill.color : undefined }}
                >
                  {picture && <img src={picture} alt="" draggable={false} className="absolute inset-0 size-full" />}
                  {!picture && i + 1}
                </span>
              </span>
              {renaming === id ? (
                <input
                  name="page-name"
                  aria-label={t.editor.pages.rename}
                  defaultValue={page.name}
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => rename(id, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename(id, e.currentTarget.value)
                    if (e.key === 'Escape') setRenaming(null)
                    e.stopPropagation()
                  }}
                  className="h-7 min-w-0 flex-1 rounded-[6px] border border-accent bg-surface px-1.5 text-[13px] outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => show(id)}
                  onDoubleClick={() => setRenaming(id)}
                  onKeyDown={(e) => e.key === 'F2' && setRenaming(id)}
                  aria-label={format(t.editor.pages.show, { name: page.name })}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col items-start text-start"
                >
                  <span className="w-full truncate text-[13px]">{format(t.editor.pages.numbered, { n: i + 1, name: page.name })}</span>
                  <span className="w-full truncate text-[11px] text-muted">{format(formatCount === 1 ? t.editor.pages.formatsOne : t.editor.pages.formatsMany, { n: formatCount })}</span>
                </button>
              )}
              <span className="hidden shrink-0 items-center group-hover:flex group-focus-within:flex">
                <Tooltip label={t.editor.pages.duplicate}>
                  <button
                    type="button"
                    aria-label={t.editor.pages.duplicate}
                    onClick={() => show(run('page.duplicate', { id, name: format(t.editor.pages.copyName, { name: page.name }) }))}
                    className={ICON_BUTTON}
                  >
                    <CopyIcon size={14} aria-hidden />
                  </button>
                </Tooltip>
                <Tooltip label={t.editor.pages.moveUp}>
                  <button type="button" aria-label={t.editor.pages.moveUp} disabled={i === 0} onClick={() => run('page.move', { id, before: pages[i - 1]?.[0] ?? null })} className={ICON_BUTTON}>
                    <CaretUpIcon size={14} aria-hidden />
                  </button>
                </Tooltip>
                <Tooltip label={t.editor.pages.moveDown}>
                  <button type="button" aria-label={t.editor.pages.moveDown} disabled={i === pages.length - 1} onClick={() => run('page.move', { id, before: pages[i + 2]?.[0] ?? null })} className={ICON_BUTTON}>
                    <CaretDownIcon size={14} aria-hidden />
                  </button>
                </Tooltip>
                <Tooltip label={t.editor.pages.remove}>
                  <button
                    type="button"
                    aria-label={t.editor.pages.remove}
                    disabled={pages.length === 1}
                    onClick={() => {
                      run('page.delete', { id })
                      if (current === id) setCurrent(null)
                      onRemoved(format(t.editor.pages.removed, { name: page.name }))
                    }}
                    className={cn(ICON_BUTTON, 'hover:text-danger')}
                  >
                    <TrashIcon size={14} aria-hidden />
                  </button>
                </Tooltip>
              </span>
            </li>
          )
        })}
      </ol>
      <div className="px-[18px] pt-3 pb-4">
        <Tooltip label={t.editor.pages.add}>
          <button type="button" aria-label={t.editor.pages.add} onClick={add} className={CHIP}>
            <PlusIcon size={12} aria-hidden />
            {t.editor.pages.addShort}
          </button>
        </Tooltip>
      </div>
    </section>
  )
}
