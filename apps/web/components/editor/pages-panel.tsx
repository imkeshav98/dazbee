'use client'

// The design's pages. Pages, by the zoom pill, says which page is in view and how many there are
// ("Pages 2/3", the numbers alone on a phone) and opens the Pages panel: each page's picture, name
// and sizes, shown with a click and reordered by dragging; ⋯ renames, duplicates, moves and deletes
// one, and Add page adds one. A click on a page's background picks it, and its Background panel
// paints it in every size. Every change is a command, so it is one undo step and reaches the other tabs.
import { FilesIcon, PlusIcon } from '@phosphor-icons/react'
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { Editor } from '@dazbee/editor'
import { type Design, inOrder } from '@dazbee/schema'

import { BackgroundBody } from '@/components/editor/edit-panel/colour-panel.tsx'
import { PanelFrame } from '@/components/editor/edit-panel/edit-panel.tsx'
import { FOCUS_RING } from '@/components/ui/looks.ts'
import { RenameField } from '@/components/ui/rename-field.tsx'
import { cn } from '@/lib/cn.ts'
import { useValue } from '@/lib/editor/value-store.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { afterDraws, sameUrls } from './after-draws.ts'
import { CARD_ROW, CardMenu } from './card.tsx'
import { setOpen, useEditState } from './edit-store.ts'
import { shownPage, useEditorDesign, usePickedPage } from './editor-hooks.ts'
import { DROP_LINE, PANEL_BUTTON } from './styles.ts'

/** The page in view: the one last shown or picked while it is still there, else the first. */
function useCurrentPage(design: Design) {
  const shown = useValue(shownPage)
  return shown && design.pages[shown] ? shown : (inOrder(design.pages)[0]?.[0] ?? null)
}

/** Each page's picture in the primary format, drawn once the stage settles and again once its fonts and images arrive. */
function usePagePictures(editor: Editor): Record<string, string | null> {
  const [pictures, setPictures] = useState<Record<string, string | null>>({})
  useEffect(
    () =>
      afterDraws(editor, () => {
        const next = Object.fromEntries(
          Object.keys(editor.session.design().pages).map((id) => [id, editor.pageThumbnail(id, 72)]),
        )
        setPictures((now) => (sameUrls(now, next) ? now : next))
      }),
    [editor],
  )
  return pictures
}

/**
 * Pages by the zoom pill: before it on desktop, over it on a tablet, where the tool dock leaves no
 * room beside it, and on a phone at the top start, across from it, hidden with it while the top bar shows.
 */
export function PagesButton({ editor }: { editor: Editor | null }) {
  const t = useMessages()
  if (!editor)
    return (
      <PagesFrame label={t.editor.pages.title} disabled>
        <span>{t.editor.pages.title}</span>
      </PagesFrame>
    )
  return <LivePages editor={editor} />
}

export function PagesPanel({ editor, onRemoved }: { editor: Editor; onRemoved: (message: string) => void }) {
  const t = useMessages()
  const { open } = useEditState()
  if (open !== 'pages') return null
  return (
    <PanelFrame id="pages" title={t.editor.pages.title}>
      <PageList editor={editor} onRemoved={onRemoved} />
    </PanelFrame>
  )
}

/** The picked page's Background panel: the Colour panel's choices, for the page in every size. */
export function BackgroundPanel({ editor, brandId }: { editor: Editor; brandId: string }) {
  const t = useMessages()
  const { open } = useEditState()
  const { design } = useEditorDesign(editor)
  const picked = usePickedPage(editor)
  const page = picked ? design.pages[picked] : undefined
  if (open !== 'background' || !picked || !page) return null
  return (
    <PanelFrame id="background" title={t.editor.page.backgroundColour} note={page.name}>
      <BackgroundBody editor={editor} design={design} pageId={picked} brandId={brandId} />
    </PanelFrame>
  )
}

function PagesFrame({ label, disabled = false, children }: { label: string; disabled?: boolean; children: ReactNode }) {
  const { open } = useEditState()
  const button = useRef<HTMLButtonElement>(null)
  // Where the zoom pill ends, so Pages sits just beside or above it.
  const [zoom, setZoom] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const pill = button.current?.parentElement?.querySelector<HTMLElement>('[data-zoom]')
    if (!pill) return
    const measure = () => setZoom({ width: pill.offsetWidth, height: pill.offsetHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(pill)
    return () => watch.disconnect()
  }, [])
  // As tall as the zoom pill beside it.
  const place = {
    '--zoom-width': `${zoom.width}px`,
    '--zoom-height': `${zoom.height}px`,
    ...(zoom.height > 0 ? { height: zoom.height } : {}),
  } as CSSProperties
  return (
    <button
      ref={button}
      type="button"
      data-pages
      data-opens="pages"
      data-testid="pages-button"
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-expanded={open === 'pages'}
      onClick={() => setOpen(open === 'pages' ? null : 'pages')}
      style={place}
      className={cn(
        'absolute z-10 flex h-9 cursor-pointer items-center gap-1.5 rounded-card surface-frost px-3 text-[12px] font-semibold text-text transition-colors hover:text-accent-text disabled:cursor-default disabled:opacity-40 aria-expanded:bg-accent-soft aria-expanded:text-accent-text',
        'end-[calc(1.5rem+var(--zoom-width))] bottom-4 max-lg:end-4 max-lg:bottom-[calc(1.5rem+var(--zoom-height))]',
        'max-sm:start-4 max-sm:end-auto max-sm:top-20 max-sm:bottom-auto max-sm:group-data-[bar]/stage:hidden',
        FOCUS_RING,
      )}
    >
      <FilesIcon size={15} aria-hidden />
      {children}
    </button>
  )
}

/** Pages once the design is open: which page is in view, of how many. */
function LivePages({ editor }: { editor: Editor }) {
  const t = useMessages()
  // Each design opens on its first page.
  useEffect(() => () => shownPage.set(null), [editor])
  const { design } = useEditorDesign(editor)
  usePickedPage(editor)
  const current = useCurrentPage(design)
  const pages = inOrder(design.pages)
  const counts = { n: Math.max(1, pages.findIndex(([id]) => id === current) + 1), total: pages.length }
  return (
    <PagesFrame label={format(t.editor.pages.buttonLabel, counts)}>
      <span aria-hidden className="tabular-nums max-sm:hidden">
        {format(t.editor.pages.button, counts)}
      </span>
      <span aria-hidden className="font-mono tabular-nums sm:hidden">
        {format(t.editor.pages.buttonShort, counts)}
      </span>
    </PagesFrame>
  )
}

/** Each page: its picture, name and sizes, shown with a click, renamed with a double click, dragged to reorder; then Add page. */
function PageList({ editor, onRemoved }: { editor: Editor; onRemoved: (message: string) => void }) {
  const t = useMessages()
  const g = t.editor.pages
  const { design } = useEditorDesign(editor)
  const pages = inOrder(design.pages)
  const current = useCurrentPage(design)
  const [renaming, setRenaming] = useState<string | null>(null)
  // The page being dragged, and the page it would land before (null for the end).
  const [dragging, setDragging] = useState<string | null>(null)
  const [landing, setLanding] = useState<{ before: string | null } | null>(null)
  const run = editor.session.run.bind(editor.session)
  const pictures = usePagePictures(editor)

  const show = (id: string) => {
    shownPage.set(id)
    // Another page in view lets the picked one go.
    if (editor.pickedPage() !== id) editor.pickPage(null)
    // After the command's redraw, so a new page's row is in the grid already.
    requestAnimationFrame(() => editor.fitPage(id))
  }
  const rename = (id: string, name: string | null) => {
    setRenaming(null)
    const trimmed = name?.trim()
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
    while (names.has(format(g.newName, { n }))) n++
    show(run('page.add', { name: format(g.newName, { n }) }))
  }

  const formatCount = Object.keys(design.formats).length
  const primary = design.formats[design.meta.primaryFormatId]
  // Each page's picture in the primary format, its long side 34, on its background until one is drawn.
  const tile = primary
    ? {
        width: Math.max(8, Math.round(34 * Math.min(1, primary.width / primary.height))),
        height: Math.max(8, Math.round(34 * Math.min(1, primary.height / primary.width))),
      }
    : { width: 34, height: 34 }

  return (
    <>
      <ol aria-label={g.title} className="flex flex-col gap-1.5" data-testid="pages">
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
              className={cn(
                CARD_ROW,
                'relative cursor-grab active:cursor-grabbing aria-[current]:border-accent aria-[current]:bg-accent-soft data-[dragging]:opacity-40',
              )}
            >
              {moves && landing?.before === id && <span aria-hidden className={cn(DROP_LINE, '-top-[4px]')} />}
              {moves && landing?.before === null && i === pages.length - 1 && (
                <span aria-hidden className={cn(DROP_LINE, '-bottom-[4px]')} />
              )}
              <span aria-hidden className="grid size-[34px] shrink-0 place-items-center">
                <span
                  data-testid="page-thumbnail"
                  className="relative grid place-items-center overflow-hidden rounded-[3px] border border-line-strong bg-hover font-mono text-[10px] font-semibold text-white tabular-nums [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]"
                  style={{ ...tile, backgroundColor: fill?.type === 'solid' ? fill.color : undefined }}
                >
                  {picture && <img src={picture} alt="" draggable={false} className="absolute inset-0 size-full" />}
                  {!picture && i + 1}
                </span>
              </span>
              {renaming === id ? (
                <RenameField
                  name={page.name}
                  label={g.rename}
                  inputName="page-name"
                  className="h-7 min-w-0 flex-1 rounded-[6px] border border-accent bg-surface px-1.5 text-[13px] outline-none"
                  onDone={(name) => rename(id, name)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => show(id)}
                  onDoubleClick={() => setRenaming(id)}
                  onKeyDown={(e) => e.key === 'F2' && setRenaming(id)}
                  aria-label={format(g.show, { name: page.name })}
                  className={cn(
                    'flex min-w-0 flex-1 cursor-pointer flex-col items-start rounded-[6px] text-start',
                    FOCUS_RING,
                  )}
                >
                  <span className="w-full truncate text-[13px] font-semibold text-text">
                    {format(g.numbered, { n: i + 1, name: page.name })}
                  </span>
                  <span className="w-full truncate text-[11px] text-subtle">
                    {format(formatCount === 1 ? g.formatsOne : g.formatsMany, { n: formatCount })}
                  </span>
                </button>
              )}
              <CardMenu
                label={format(g.more, { name: page.name })}
                items={[
                  { label: g.rename, run: () => setRenaming(id) },
                  {
                    label: g.duplicate,
                    run: () => show(run('page.duplicate', { id, name: format(g.copyName, { name: page.name }) })),
                  },
                  {
                    label: g.moveUp,
                    disabled: i === 0,
                    run: () => run('page.move', { id, before: pages[i - 1]?.[0] ?? null }),
                  },
                  {
                    label: g.moveDown,
                    disabled: i === pages.length - 1,
                    run: () => run('page.move', { id, before: pages[i + 2]?.[0] ?? null }),
                  },
                  {
                    label: g.remove,
                    disabled: pages.length === 1,
                    danger: true,
                    run: () => {
                      run('page.delete', { id })
                      if (shownPage.get() === id) shownPage.set(null)
                      onRemoved(format(g.removed, { name: page.name }))
                    },
                  },
                ]}
              />
            </li>
          )
        })}
      </ol>
      <button type="button" onClick={add} data-testid="add-page" className={cn(PANEL_BUTTON, 'justify-center')}>
        <PlusIcon size={14} aria-hidden className="shrink-0" />
        <span>{g.add}</span>
      </button>
    </>
  )
}
