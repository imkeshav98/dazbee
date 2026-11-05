'use client'

// The editor's chrome: two islands floating at the top; a capsule floating over the canvas whose
// buttons open flyouts (Layers, Assets, AI, Brand); a bottom tool dock and a slot for the mini bar
// above the selection. The canvas runs edge to edge under all of it; the stage is the editor itself, told
// which edges the chrome covers so it fits the ads between.
import {
  CursorIcon,
  FrameCornersIcon,
  HandIcon,
  type Icon,
  ImageIcon,
  ImagesIcon,
  PaletteIcon,
  PenNibIcon,
  ShapesIcon,
  SparkleIcon,
  StackIcon,
  TextTIcon,
  XIcon,
} from '@phosphor-icons/react'
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { ShapeMenuTool } from '@dazbee/editor'

import { ShapeTools } from '@/components/editor/menus/shape-menu.tsx'
import { DazbeeMark } from '@/components/ui/dazbee-mark.tsx'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import type { Placeable } from '@/lib/editor/place-asset.ts'
import type { ValueStore } from '@/lib/editor/value-store.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf } from '@/lib/i18n/index.ts'

import { DesignName } from './design-name.tsx'
import { isPanel, setFlyoutEnd, setOpen, useEditState, usePhone } from './edit-store.ts'
import { ImageTool } from './image-tool.tsx'
import { SaveStatus } from './save-status.tsx'
import { BAR_ROW, BAR_ROW_HEIGHT, dockTool } from './styles.ts'

export type Flyout = 'layers' | 'assets' | 'ai' | 'brand'
export type Tool = 'select' | 'frame' | 'shape' | 'text' | 'pen' | 'image' | 'hand'

/** The stage's edges the floating chrome covers, in CSS pixels, left and right as on screen. */
export interface ChromeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

type Note = { owner: object; text: string } | null

const FLYOUTS: { id: Flyout; icon: Icon }[] = [
  { id: 'layers', icon: StackIcon },
  { id: 'assets', icon: ImagesIcon },
  { id: 'ai', icon: SparkleIcon },
  { id: 'brand', icon: PaletteIcon },
]
const TOOLS: { id: Tool; icon: Icon; key: string }[] = [
  { id: 'select', icon: CursorIcon, key: 'V' },
  { id: 'frame', icon: FrameCornersIcon, key: 'F' },
  { id: 'shape', icon: ShapesIcon, key: 'R' },
  { id: 'text', icon: TextTIcon, key: 'T' },
  { id: 'pen', icon: PenNibIcon, key: 'P' },
  { id: 'image', icon: ImageIcon, key: 'I' },
  { id: 'hand', icon: HandIcon, key: 'H' },
]

const CHROME = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] as const }
/** The capsule's blob, the pressed tint under the open panel's button, slides there on a spring, so it overshoots a little. */
const BLOB = { type: 'spring', stiffness: 520, damping: 34, mass: 0.9 } as const
/** On arrival the blob is stretched along its travel and settles round: the squish. */
const SQUISH = {
  tall: { scaleX: 0.78, scaleY: 1.28 },
  wide: { scaleX: 1.28, scaleY: 0.78 },
  still: { scaleX: 1, scaleY: 1 },
}

/** Lets the open flyout's content set the small grey note in its title row, as Layers does with its page and frame. */
const FlyoutNote = createContext<(change: (now: Note) => Note) => void>(() => undefined)

/**
 * Measures how much of the stage the islands, the capsule and the dock cover. The
 * islands at the top (#110) cover the top. Of the other pieces, one in the stage's lower part covers
 * the bottom (the dock, and the capsule when it is the phones' tab bar); one on the left or right of
 * the middle covers that side. The phones' open sheet spans the stage, so fitting around it would
 * leave nothing: it counts for nothing, as do hidden pieces.
 */
function measureInsets(stage: DOMRect, tops: (Element | null)[], pieces: (Element | null)[]): ChromeInsets {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 }
  const gap = 12
  for (const top of tops) {
    const box = top?.getBoundingClientRect()
    if (box && box.width > 0 && box.height > 0) insets.top = Math.max(insets.top, box.bottom - stage.top + gap)
  }
  for (const piece of pieces) {
    const box = piece?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) continue
    if (box.top > stage.top + stage.height * 0.6) insets.bottom = Math.max(insets.bottom, stage.bottom - box.top + gap)
    else if (box.width > stage.width * 0.6) continue
    else if (box.left + box.width / 2 < stage.left + stage.width / 2)
      insets.left = Math.max(insets.left, box.right - stage.left + gap)
    else insets.right = Math.max(insets.right, stage.right - box.left + gap)
  }
  return insets
}

/**
 * Shows a note at the end of the open flyout's title row while the caller is mounted. A flyout
 * fading out clears only its own note, never the next one's.
 */
export function useFlyoutNote(text: string | null) {
  const setNote = useContext(FlyoutNote)
  const [owner] = useState(() => ({}))
  useEffect(() => {
    setNote(() => (text ? { owner, text } : null))
    return () => setNote((now) => (now?.owner === owner ? null : now))
  }, [setNote, owner, text])
}

export function EditorShell({
  brandId,
  brandName,
  designName,
  onRename,
  status,
  history,
  tool: shownTool,
  shape = 'rect',
  onToolChange,
  image,
  onInsets,
  fitted = true,
  actions,
  account,
  flyouts,
  children,
}: {
  brandId: string
  brandName: string
  designName: string
  /** Saves a new name for the design; left out, the name can't be changed here. */
  onRename?: (name: string) => Promise<void>
  /** The editor's save state, or what it is doing before it opens. */
  status: ValueStore<string>
  /** Undo and redo, after the save state in the header pill. */
  history?: ReactNode
  /** The tool in use, when the editor decides it (a key, or drawing a shape ends); the dock keeps its own otherwise. */
  tool?: Tool
  /** The shape the shape tool draws (#44). */
  shape?: ShapeMenuTool
  onToolChange?: (tool: Tool, shape: ShapeMenuTool) => void
  /** The image tool: whether it is waiting for an image to be picked, and what to do with the one picked. */
  image?: { picking: boolean; onPick: (asset: Placeable) => void }
  /** Called with the stage's edges the always-on chrome covers, once it is first measured and whenever they change. */
  onInsets?: (insets: ChromeInsets) => void
  /** False until the stage has fitted the design between the chrome: the editor is not ready before. */
  fitted?: boolean
  /** The design's one action at the header's end: Share, holding Export and Save as template. */
  actions?: ReactNode
  /** The account avatar after it, with language, theme, settings and sign out. */
  account?: ReactNode
  /** What a flyout shows once its ticket fills it, such as the asset library (#52); an empty state until then. */
  flyouts?: Partial<Record<Flyout, ReactNode>>
  children: ReactNode
}) {
  const t = useMessages()
  const rtl = dirOf(useLocale()) === 'rtl'
  // Motion's own reduced-motion mode still fades; chrome should simply appear.
  const reduced = useReducedMotion()
  const chrome = reduced ? { duration: 0 } : CHROME
  const phone = usePhone()
  const [flyout, setFlyout] = useState<Flyout | null>(null)
  const [flyoutNote, setNote] = useState<Note>(null)
  const note = flyoutNote?.text ?? null
  const [ownTool, setTool] = useState<Tool>('select')
  const tool = shownTool ?? ownTool
  const flyoutTitle = (id: Flyout) => t.editor[id]
  const flyoutEmpty = {
    layers: t.editor.layersEmpty,
    assets: t.editor.assetsEmpty,
    ai: t.editor.aiEmpty,
    brand: t.editor.brandEmpty,
  }
  // What the top bar has open: on a phone an edit panel is a sheet, which hides the tab bar and the
  // dock, and a sheet and a rail flyout close each other. Pages drops under its button instead.
  const edit = useEditState()
  const panelOnPhone = phone && isPanel(edit.open)
  const sheet = panelOnPhone && edit.open !== 'pages'
  useEffect(() => {
    if (panelOnPhone) setFlyout((now) => (now === null ? now : null))
  }, [panelOnPhone])
  const stage = useRef<HTMLElement>(null)
  const flyoutEl = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = flyoutEl.current
    if (!flyout || phone || !el || !stage.current) {
      setFlyoutEnd(null)
      return
    }
    const measure = () => {
      const box = el.getBoundingClientRect()
      const area = stage.current?.getBoundingClientRect()
      if (!area) return
      setFlyoutEnd(Math.round(rtl ? area.right - box.left : box.right - area.left))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => {
      watch.disconnect()
      setFlyoutEnd(null)
    }
  }, [flyout, phone, rtl])

  const startIsland = useRef<HTMLDivElement>(null)
  const endIsland = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  const barRow = useRef<HTMLDivElement>(null)
  const reported = useRef('')
  const report = useRef(onInsets)
  report.current = onInsets
  useLayoutEffect(() => {
    const measure = () => {
      if (!stage.current) return
      const box = stage.current.getBoundingClientRect()
      // The zoom pill and Pages: under the islands on a phone, so the ads start below them; at the
      // bottom elsewhere, so the ads end above them.
      const corner = [stage.current.querySelector('[data-zoom]'), stage.current.querySelector('[data-pages]')]
      const phone = box.width < 640
      // The top bar's row is kept clear whether or not the bar shows, so selecting never covers the design.
      const insets = measureInsets(
        box,
        [startIsland.current, endIsland.current, ...(phone ? corner : []), barRow.current],
        [rail.current, dock.current, ...(phone ? [] : corner)],
      )
      const key = JSON.stringify(insets)
      if (key === reported.current) return
      reported.current = key
      report.current?.(insets)
    }
    const watch = new ResizeObserver(measure)
    for (const el of [
      stage.current,
      startIsland.current,
      endIsland.current,
      rail.current,
      dock.current,
      stage.current?.querySelector('[data-zoom]'),
      stage.current?.querySelector('[data-pages]'),
    ])
      if (el) watch.observe(el)
    measure()
    return () => watch.disconnect()
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-dvh overflow-hidden bg-bg text-text">
        <div className="relative flex h-full min-h-0">
          {/* No top bar (#110): two islands float over the canvas, the design's name and save state at
              the start and Share and the account at the end, clear of the rulers when they are on (top and
              left in either direction, so the insets swap in right-to-left). The start island sits on a
              small frosted pill, so its words read over an ad zoomed in under it; the end island's
              buttons are solid and need none. */}
          <header className="pointer-events-none absolute start-6 end-4 rtl:start-4 rtl:end-6 top-6 z-30 flex items-center justify-between gap-3">
            <div
              ref={startIsland}
              data-testid="island-start"
              className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full surface-frost py-0.5 ps-0.5 pe-3"
            >
              <Link
                href="/"
                aria-label={t.library.home}
                className="grid size-9 shrink-0 place-items-center rounded-row hover:bg-hover active:bg-pressed"
              >
                <DazbeeMark size={28} />
              </Link>
              <nav aria-label={t.library.designs} className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <Link
                  href={`/brands/${brandId}`}
                  className="truncate text-muted transition-colors hover:text-text max-sm:hidden"
                >
                  {brandName}
                </Link>
                <span aria-hidden className="text-subtle max-sm:hidden">
                  /
                </span>
                <DesignName name={designName} onRename={onRename} />
              </nav>
              <SaveStatus status={status} fitted={fitted} />
              {history}
            </div>
            <div
              ref={endIsland}
              data-testid="island-end"
              className="pointer-events-auto flex shrink-0 items-center gap-2"
            >
              {actions}
              {account}
            </div>
          </header>
          <nav
            ref={rail}
            aria-label={t.editor.tools}
            data-testid="rail"
            className={cn(
              // Clipped, so the AI button's soft gradient stays inside and never shows on the canvas.
              'absolute z-20 flex gap-2 overflow-hidden rounded-full surface-frost p-2',
              // A vertical capsule at the start edge; on phones a tab bar floating at the bottom.
              'start-5 top-1/2 -translate-y-1/2 flex-col sm:p-2.5 max-sm:start-1/2 max-sm:top-auto max-sm:bottom-3 max-sm:translate-y-0 max-sm:flex-row max-sm:-translate-x-1/2 max-sm:rtl:translate-x-1/2',
              sheet && 'max-sm:hidden',
            )}
          >
            {FLYOUTS.map(({ id, icon: FlyoutIcon }) => {
              const open = flyout === id
              const ai = id === 'ai'
              return (
                <Tooltip key={id} label={flyoutTitle(id)} side={rtl ? 'left' : 'right'}>
                  <button
                    type="button"
                    aria-label={flyoutTitle(id)}
                    aria-expanded={open}
                    aria-controls="editor-flyout"
                    data-panel={id}
                    onClick={() => {
                      setFlyout(open ? null : id)
                      if (phone && !open) setOpen(null)
                    }}
                    className={cn(
                      'relative grid size-11 sm:size-13 cursor-pointer place-items-center rounded-full transition-colors duration-[var(--chrome-fast)]',
                      // Open, it keeps the rail's glass under the pressed tint, its icon pink.
                      open
                        ? 'text-accent-text'
                        : 'text-subtle hover:bg-hover hover:text-text active:bg-pressed active:text-text',
                      ai && !open && 'text-accent-text',
                    )}
                  >
                    {open && (
                      <motion.span
                        layoutId="rail-blob"
                        transition={reduced ? { duration: 0 } : BLOB}
                        aria-hidden
                        data-testid="rail-blob"
                        className="absolute inset-0"
                      >
                        <motion.span
                          key={id}
                          initial={reduced ? false : phone ? 'wide' : 'tall'}
                          animate="still"
                          variants={SQUISH}
                          transition={BLOB}
                          className="absolute inset-0 rounded-full bg-pressed"
                        />
                      </motion.span>
                    )}
                    {/* A still gradient: a blur over a sliding one would be redrawn on every frame. */}
                    {ai && !open && (
                      <span
                        aria-hidden
                        className="absolute inset-1.5 rounded-full bg-[image:var(--ai-gradient)] opacity-20 blur-[6px]"
                      />
                    )}
                    <FlyoutIcon
                      size={22}
                      weight={ai ? 'duotone' : open ? 'fill' : 'regular'}
                      aria-hidden
                      className="relative"
                    />
                  </button>
                </Tooltip>
              )
            })}
          </nav>

          <AnimatePresence>
            {flyout && (
              <motion.section
                ref={flyoutEl}
                key={flyout}
                id="editor-flyout"
                aria-label={flyoutTitle(flyout)}
                initial={{ opacity: 0, x: rtl ? 12 : -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: rtl ? 12 : -12 }}
                transition={chrome}
                data-testid="flyout"
                className="absolute start-[7.25rem] top-20 z-10 flex max-h-[calc(100%-5.75rem)] w-[21.5rem] flex-col overflow-hidden rounded-[16px] surface-frost max-sm:inset-x-3 max-sm:start-3 max-sm:top-auto max-sm:bottom-[9rem] max-sm:max-h-[calc(100%-9rem-7.5rem)] max-sm:w-auto"
              >
                {/* The title at the start and, as in the mock, a small grey note at the end: the brand, or the page and frame. */}
                <div className="flex h-14 shrink-0 items-center gap-2 ps-[18px] pe-2">
                  <h2
                    className={cn(
                      'min-w-0 flex-1 truncate font-display text-[17px] font-bold tracking-tight',
                      flyout === 'ai' && 'text-accent-text',
                    )}
                  >
                    {flyoutTitle(flyout)}
                  </h2>
                  {(note ?? (flyout === 'assets' || flyout === 'brand' ? brandName : null)) && (
                    <span
                      data-testid="flyout-note"
                      className="min-w-0 max-w-[60%] truncate text-[11px] font-medium text-muted"
                    >
                      {note ?? brandName}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={t.editor.closePanel}
                    onClick={() => setFlyout(null)}
                    className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-subtle hover:bg-hover hover:text-text active:bg-pressed"
                  >
                    <XIcon size={14} aria-hidden />
                  </button>
                </div>
                <FlyoutNote.Provider value={setNote}>
                  {flyouts?.[flyout] ?? <p className="px-[18px] pb-4 text-[13px] text-muted">{flyoutEmpty[flyout]}</p>}
                </FlyoutNote.Provider>
              </motion.section>
            )}
          </AnimatePresence>

          <main
            ref={stage}
            data-bar={edit.bar ? '' : undefined}
            className="group/stage canvas-dots relative min-w-0 flex-1 overflow-clip"
          >
            <div
              ref={barRow}
              aria-hidden
              data-bar-row
              className={cn('pointer-events-none invisible absolute inset-x-0', BAR_ROW, BAR_ROW_HEIGHT)}
            />
            {children}
            <div
              ref={dock}
              role="toolbar"
              aria-label={t.editor.tools}
              data-dock
              className={cn(
                'absolute inset-x-0 bottom-4 z-10 mx-auto flex w-max max-sm:bottom-[5.25rem] items-center gap-1 rounded-[18px] surface-frost p-1.5',
                sheet && 'max-sm:hidden',
              )}
            >
              {TOOLS.map(({ id, icon: ToolIcon, key }) => {
                if (id === 'shape') {
                  return (
                    <ShapeTools
                      key={id}
                      active={tool === 'shape'}
                      shape={shape}
                      onPick={(picked) => {
                        setTool('shape')
                        onToolChange?.('shape', picked)
                      }}
                    />
                  )
                }
                if (id === 'image') {
                  return (
                    <ImageTool
                      key={id}
                      brandId={brandId}
                      active={tool === 'image'}
                      open={tool === 'image' && Boolean(image?.picking)}
                      onPress={() => {
                        setTool('image')
                        onToolChange?.('image', shape)
                      }}
                      onPick={(asset) => image?.onPick(asset)}
                      onClose={() => {
                        setTool('select')
                        onToolChange?.('select', shape)
                      }}
                    />
                  )
                }
                const label = t.editor[`tool${id[0]?.toUpperCase()}${id.slice(1)}` as `tool${Capitalize<Tool>}`]
                const on = tool === id
                return (
                  <Tooltip key={id} label={`${label} · ${key}`}>
                    <button
                      type="button"
                      aria-label={label}
                      aria-pressed={on}
                      data-tool={id}
                      // The Frame tool opens Add a frame, which gives the focus back here as it closes.
                      data-opens={id === 'frame' ? 'addFrame' : undefined}
                      onClick={() => {
                        setTool(id)
                        onToolChange?.(id, shape)
                      }}
                      className={dockTool(on)}
                    >
                      <ToolIcon size={20} weight={on ? 'fill' : 'regular'} aria-hidden />
                    </button>
                  </Tooltip>
                )
              })}
            </div>
          </main>
        </div>
      </div>
    </MotionConfig>
  )
}
