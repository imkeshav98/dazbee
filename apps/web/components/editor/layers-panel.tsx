'use client'

// The layers panel (#59): the page's layer tree, topmost first, in step with the stage's selection.
// Drag a row to reorder it or drop it into a group; rename, lock and hide; expand groups. Every
// change is an editor call, so each is one undo step. Only the rows in view are in the page, so a
// page of hundreds of layers scrolls as smoothly as one of ten.
import {
  CaretRightIcon,
  CircleIcon,
  EyeClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  FolderSimpleIcon,
  FrameCornersIcon,
  type Icon,
  ImageIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  PenNibIcon,
  SquareIcon,
  TextTIcon,
  UniteIcon,
} from '@phosphor-icons/react'
import {
  type DragEvent,
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { ancestorsOf, childrenOf } from '@dazbee/doc'
import type { Editor } from '@dazbee/editor'
import { canHold, type Design, formatScope, inOrder, LOCK_FLAGS } from '@dazbee/schema'

import { useOverlayScroll } from '@/components/ui/overlay-scroll.ts'
import { cn } from '@/lib/cn.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf, format } from '@/lib/i18n/index.ts'

import { afterDraws, sameUrls } from './after-draws.ts'
import { useSelectionWithFrame } from './editor-hooks.ts'
import { useFlyoutNote } from './shell.tsx'
import { DROP_LINE, LAYER_PICTURE, LAYER_PICTURE_PICKED } from './styles.ts'
import { useLiveDesign } from './use-live-design.ts'

/** A row's height in pixels: every row is the same, which is what lets only the rows in view render. */
export const LAYER_ROW = 36
/** Rows rendered beyond each edge of the view, so a fast scroll never shows a gap. */
const OVERSCAN = 8
const INDENT = 16
const DRAG_TYPE = 'application/x-dazbee-layer'

type Layer = Design['nodes'][string]
interface Row {
  id: string
  node: Layer
  depth: number
  parentId: string
  hasChildren: boolean
  position: number
  siblings: number
}
type Where = 'above' | 'below' | 'into'

/** The page's layers as rows, topmost first, with the children of expanded layers under them. */
function rowsOf(design: Design, pageId: string, expanded: ReadonlySet<string>) {
  const rows: Row[] = []
  const walk = (parentId: string, depth: number) => {
    const children = childrenOf(design, parentId).reverse()
    for (const [position, [id, node]] of children.entries()) {
      const hasChildren = childrenOf(design, id).length > 0
      rows.push({ id, node, depth, parentId, hasChildren, position: position + 1, siblings: children.length })
      if (hasChildren && expanded.has(id)) walk(id, depth + 1)
    }
  }
  walk(pageId, 0)
  return rows
}

function iconOf(node: Layer): Icon {
  if (node.type === 'text') return TextTIcon
  if (node.type === 'group') return FolderSimpleIcon
  if (node.type === 'frame') return FrameCornersIcon
  if (node.type === 'boolean') return UniteIcon
  const props = node.props as { shape?: { kind?: string }; fills?: { type: string }[] }
  if (props.fills?.some((f) => f.type === 'image')) return ImageIcon
  if (props.shape?.kind === 'ellipse') return CircleIcon
  if (props.shape?.kind === 'path') return PenNibIcon
  return SquareIcon
}

const isLocked = (node: Layer) => LOCK_FLAGS.some((flag) => node.lock?.[flag])

/** How long the list must be still before pictures are drawn, and a slice's budget where the browser can't say, in ms. */
const PICTURES_AFTER_SCROLL = 300
const PICTURES_SLICE = 6

/** Runs `work` when the browser is idle, with how many ms it may take; returns the cancel. */
function whenIdle(work: (left: () => number) => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback((deadline) => work(() => deadline.timeRemaining()), { timeout: 1000 })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(() => {
    const end = performance.now() + PICTURES_SLICE
    work(() => end - performance.now())
  }, 0)
  return () => clearTimeout(id)
}

/**
 * Each listed layer's picture in the frame the panel shows, drawn once the stage has settled and
 * the list has been still a moment (so a drag or a scroll draws none) and again once fonts and
 * images arrive, a few at a time in the browser's idle time so no frame waits on them.
 * `scrolledAt` is when the list last scrolled.
 */
function useLayerPictures(
  editor: Editor,
  frameKey: string,
  ids: readonly string[],
  scrolledAt: { current: number },
): Record<string, string | null> {
  const [pictures, setPictures] = useState<{ frameKey: string; urls: Record<string, string | null> }>({
    frameKey,
    urls: {},
  })
  const wanted = ids.join(' ')
  useEffect(() => {
    let cancel = () => {}
    const stop = afterDraws(editor, () => {
      cancel()
      const list = wanted.split(' ').filter(Boolean)
      const next: Record<string, string | null> = {}
      let i = 0
      const slice = (left: () => number) => {
        const still = performance.now() - scrolledAt.current
        if (still < PICTURES_AFTER_SCROLL) {
          const id = setTimeout(() => (cancel = whenIdle(slice)), PICTURES_AFTER_SCROLL - still)
          cancel = () => clearTimeout(id)
          return
        }
        while (i < list.length && left() > 1) {
          const id = list[i++] ?? ''
          next[id] = editor.layerThumbnail(id, 44, false, frameKey)
        }
        if (i < list.length) cancel = whenIdle(slice)
        else
          setPictures((now) => (now.frameKey === frameKey && sameUrls(now.urls, next) ? now : { frameKey, urls: next }))
      }
      cancel = whenIdle(slice)
    })
    return () => {
      cancel()
      stop()
    }
  }, [editor, frameKey, wanted, scrolledAt])
  // Another frame's pictures are not this one's.
  return pictures.frameKey === frameKey ? pictures.urls : {}
}

export function LayersPanel({ editor }: { editor: Editor }) {
  const t = useMessages()
  const rtl = dirOf(useLocale()) === 'rtl'
  const { design, version } = useLiveDesign(editor)
  const selection = useSelectionWithFrame(editor)
  const selected = useMemo(() => new Set(selection.ids), [selection.ids])

  // The frame the panel shows: the selection's, or the first page in the primary format.
  const [framePage, frameFormat] = selection.frame?.split('/') ?? []
  const pageId = framePage && design.pages[framePage] ? framePage : (inOrder(design.pages)[0]?.[0] ?? '')
  const formatId = frameFormat && design.formats[frameFormat] ? frameFormat : design.meta.primaryFormatId
  const page = design.pages[pageId]
  // The title row's note says which frame the tree is of, as in the mock: "Page 1 · Square".
  useFlyoutNote(page ? [page.name, design.formats[formatId]?.name].filter(Boolean).join(' · ') : null)

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  // A layer selected on the stage shows in the panel: the groups it is in open.
  useEffect(() => {
    const open = new Set<string>()
    for (const id of selection.ids) {
      for (const up of ancestorsOf(design, design.nodes[id]?.parentId ?? '')) open.add(up)
    }
    if ([...open].some((id) => !expanded.has(id))) setExpanded(new Set([...expanded, ...open]))
  }, [selection.ids, design, version, expanded])

  // The panel's own moves, counted so the rows show a move in the render that follows its key, not
  // a frame later at the redraw.
  const [moved, setMoved] = useState(0)
  // The version is how the live design says it changed.
  const rows = useMemo(() => rowsOf(design, pageId, expanded), [design, version, moved, pageId, expanded])
  const indexOf = useMemo(() => new Map(rows.map((row, i) => [row.id, i])), [rows])

  // Which rows are in view.
  const scroller = useRef<HTMLDivElement>(null)
  const scrollerRef = useOverlayScroll(scroller)
  // Kept in rows, not pixels: a scroll that shows no new row renders nothing.
  const [view, setView] = useState({ from: 0, to: Math.ceil(400 / LAYER_ROW) + OVERSCAN })
  const scrolledAt = useRef(0)
  const follow = useCallback((el: HTMLElement) => {
    const from = Math.max(0, Math.floor(el.scrollTop / LAYER_ROW) - OVERSCAN)
    const to = Math.ceil((el.scrollTop + el.clientHeight) / LAYER_ROW) + OVERSCAN
    setView((now) => (now.from === from && now.to === to ? now : { from, to }))
  }, [])
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    follow(el)
    const observer = new ResizeObserver(() => follow(el))
    observer.observe(el)
    return () => observer.disconnect()
  }, [follow])
  const first = view.from
  const last = Math.min(rows.length, view.to)

  // The row keyboard focus was last on: the one the arrows move from.
  const [active, setActive] = useState<string | null>(null)
  // Whether the focus is in the tree: from a row taking it until a press or focus outside the tree.
  const [inTree, setInTree] = useState(false)
  // The row Tab lands on, the tree's one tab stop: while the focus is in the tree, the row it is on;
  // from outside, the selected row the focus was last on, else the first selected row, else the row
  // the focus was last on, else the first row.
  const listedSelection = selection.ids.filter((id) => indexOf.has(id))
  const current =
    active && indexOf.has(active) && (inTree || listedSelection.includes(active))
      ? active
      : (listedSelection[0] ?? (active && indexOf.has(active) ? active : (rows[0]?.id ?? null)))
  // The row to focus once it is rendered, by id.
  const focusing = useRef<string | null>(null)
  // The row the focus is on while it is in the tree, and its place in the list at the last commit.
  const held = useRef<string | null>(null)
  const heldAt = useRef(0)
  // The layer of a row deleted while it had the focus: its row takes the focus again if it comes
  // back, as on undo, until a press or focus outside the tree.
  const gone = useRef<string | null>(null)
  useEffect(() => {
    const away = (event: Event) => {
      if (event.target instanceof Node && scroller.current?.contains(event.target)) return
      held.current = null
      gone.current = null
      setInTree(false)
    }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('focusin', away, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('focusin', away, true)
    }
  }, [])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; where: Where } | null>(null)
  const dragged = useRef<string | null>(null)

  /**
   * Scrolls a row into view, then focuses it once it is rendered. `at` is its place in the list, when
   * that is not where the panel last listed it, as after a move.
   */
  const reveal = useCallback(
    (id: string, at = indexOf.get(id)) => {
      const el = scroller.current
      if (!el || at === undefined) return
      const top = at * LAYER_ROW
      if (top < el.scrollTop) el.scrollTop = top
      else if (top + LAYER_ROW > el.scrollTop + el.clientHeight) el.scrollTop = top + LAYER_ROW - el.clientHeight
      follow(el)
      setActive(id)
      focusing.current = id
    },
    [indexOf, follow],
  )
  // Moves the focus off a row that left the list and back when it returns, then focuses the row
  // asked for in the commit that renders it, so it reads the rows that commit put in
  // the page and no effect of an earlier render is left to run after a key. The focus moves only from
  // the panel or from the page itself, never out of a field or control elsewhere; a row no longer in
  // the list is no longer asked for.
  useLayoutEffect(() => {
    // Focuses a row and selects it unless it is selected, so the focus and the selection agree.
    const take = (id: string) => {
      if (!selected.has(id)) editor.select([id], pageId, formatId)
      reveal(id)
    }
    const before = document.activeElement
    const dropped = !before || before === document.body || !before.isConnected
    const lost = held.current
    if (lost && !indexOf.has(lost)) {
      // The row the focus was on left the list, as when its layer is deleted or grouped: the focus
      // goes to the selected row, else to the row now in its place or the last row.
      held.current = null
      if (dropped) {
        gone.current = design.nodes[lost] ? null : lost
        const next = listedSelection[0] ?? rows[Math.min(heldAt.current, rows.length - 1)]?.id
        if (next) take(next)
      }
    } else if (gone.current && indexOf.has(gone.current) && (dropped || scroller.current?.contains(before))) {
      take(gone.current)
      gone.current = null
    }
    if (held.current) heldAt.current = indexOf.get(held.current) ?? heldAt.current

    const id = focusing.current
    if (!id) return
    if (!indexOf.has(id)) {
      focusing.current = null
      return
    }
    const row = scroller.current?.querySelector<HTMLElement>(`[data-layer="${CSS.escape(id)}"]`)
    if (!row) return
    const from = document.activeElement
    if (from !== row && (!from || from === document.body || !from.isConnected || scroller.current?.contains(from)))
      row.focus({ preventScroll: true })
    focusing.current = null
  })

  const select = (id: string, add = false) => {
    const ids = add ? (selected.has(id) ? selection.ids.filter((s) => s !== id) : [...selection.ids, id]) : [id]
    editor.select(ids, pageId, formatId)
  }
  const toggle = (id: string, open = !expanded.has(id)) => {
    const next = new Set(expanded)
    if (open) next.add(id)
    else next.delete(id)
    setExpanded(next)
  }

  /** Moves a layer next to or into another, as the panel shows them. */
  const place = (id: string, target: Row, where: Where) => {
    if (id === target.id) return false
    if (where === 'into') {
      const moved = editor.moveLayer(id, target.id)
      if (moved) toggle(target.id, true)
      return moved
    }
    // Rows run topmost first; in the document the topmost is last. Above a row is after it there.
    const siblings = childrenOf(design, target.parentId)
      .map(([sibling]) => sibling)
      .filter((sibling) => sibling !== id)
    const at = siblings.indexOf(target.id)
    const before = where === 'below' ? target.id : siblings[at + 1]
    return editor.moveLayer(id, target.parentId, before)
  }

  /** Alt with the arrows: up and down among its siblings, into the group above it, or out of its group. */
  const shift = (row: Row, key: string) => {
    const siblings = childrenOf(design, row.parentId).map(([sibling]) => sibling)
    const at = siblings.indexOf(row.id)
    const inward = rtl ? 'ArrowLeft' : 'ArrowRight'
    if (key === 'ArrowUp') {
      const above = siblings[at + 1]
      return above !== undefined && editor.moveLayer(row.id, row.parentId, siblings[at + 2])
    }
    if (key === 'ArrowDown') {
      const below = siblings[at - 1]
      return below !== undefined && editor.moveLayer(row.id, row.parentId, below)
    }
    if (key === inward) {
      const above = siblings[at + 1]
      const holder = above && design.nodes[above]
      if (!above || !holder || !canHold(holder.type, row.node.type)) return false
      const moved = editor.moveLayer(row.id, above)
      if (moved) toggle(above, true)
      return moved
    }
    const parent = design.nodes[row.parentId]
    if (!parent) return false
    const outer = childrenOf(design, parent.parentId).map(([sibling]) => sibling)
    return editor.moveLayer(row.id, parent.parentId, outer[outer.indexOf(row.parentId) + 1])
  }

  /** A layer's place in the list as the document has it now, with the groups it is in open: where a move took it. */
  const placeOf = (id: string) => {
    const open = new Set(expanded)
    for (const up of ancestorsOf(design, design.nodes[id]?.parentId ?? '')) open.add(up)
    const at = rowsOf(design, pageId, open).findIndex((r) => r.id === id)
    return at < 0 ? undefined : at
  }

  const onKey = (event: KeyboardEvent<HTMLElement>, row: Row, i: number) => {
    if (renaming) return
    const inward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const outward = rtl ? 'ArrowRight' : 'ArrowLeft'
    const go = (to: Row | undefined) => {
      if (!to) return
      select(to.id)
      reveal(to.id)
    }
    let handled = true
    if (event.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      if (shift(row, event.key)) {
        setMoved((n) => n + 1)
        reveal(row.id, placeOf(row.id))
      }
    } else if (event.key === 'ArrowDown') go(rows[i + 1])
    else if (event.key === 'ArrowUp') go(rows[i - 1])
    else if (event.key === 'Home') go(rows[0])
    else if (event.key === 'End') go(rows.at(-1))
    else if (event.key === inward) {
      if (row.hasChildren && !expanded.has(row.id)) toggle(row.id, true)
      else if (row.hasChildren) go(rows[i + 1])
    } else if (event.key === outward) {
      if (row.hasChildren && expanded.has(row.id)) toggle(row.id, false)
      else go(rows.find((r) => r.id === row.parentId))
    } else if (event.key === 'Enter' || event.key === 'F2') setRenaming(row.id)
    else if (event.key === ' ') select(row.id, event.shiftKey || event.metaKey || event.ctrlKey)
    else handled = false
    // The stage's own shortcuts, such as Delete or lock and hide, still act on the selection.
    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const whereOn = (event: DragEvent<HTMLElement>, row: Row): Where | null => {
    const id = dragged.current
    const node = id && design.nodes[id]
    if (!node || id === row.id) return null
    const box = event.currentTarget.getBoundingClientRect()
    const y = (event.clientY - box.top) / box.height
    if (canHold(row.node.type, node.type) && y > 0.25 && y < 0.75) return 'into'
    return y < 0.5 ? 'above' : 'below'
  }

  // The rows get one object whose calls reach the latest handlers, so a row that hasn't changed
  // isn't rendered again when the view scrolls or another row changes.
  const latest = useRef<RowApi | null>(null)
  latest.current = {
    focus: (id) => {
      setActive(id)
      setInTree(true)
      held.current = id
      heldAt.current = indexOf.get(id) ?? 0
    },
    key: onKey,
    click: (id, add) => select(id, add),
    rename: (id) => setRenaming(id),
    renamed: (id, name, before, byKey) => {
      setRenaming(null)
      if (name !== null && name.trim() && name.trim() !== before) editor.renameLayer(id, name)
      // Ended from the keyboard, the focus goes back to the row; ended by a click elsewhere, it
      // stays where the click put it.
      if (byKey) reveal(id)
    },
    toggle: (id) => toggle(id),
    lock: (id, locked) => editor.setLocked([id], locked),
    hide: (id, hidden, everyFormat) => editor.setHidden([id], hidden, pageId, formatId, everyFormat),
    dragStart: (id) => {
      dragged.current = id
    },
    dragEnd: () => {
      dragged.current = null
      setDrop(null)
    },
    dragOver: (event, row) => {
      const where = whereOn(event, row)
      if (!where) return false
      if (drop?.id !== row.id || drop.where !== where) setDrop({ id: row.id, where })
      return true
    },
    dragLeave: (id) => {
      if (drop?.id === id) setDrop(null)
    },
    drop: (event, row) => {
      const where = whereOn(event, row)
      const from = dragged.current
      setDrop(null)
      if (!where || !from) return false
      place(from, row, where)
      return true
    },
  }
  const api = useMemo<RowApi>(() => {
    const call = <K extends keyof RowApi>(name: K) =>
      ((...args: unknown[]) => (latest.current?.[name] as (...a: unknown[]) => unknown)(...args)) as RowApi[K]
    return {
      focus: call('focus'),
      key: call('key'),
      click: call('click'),
      rename: call('rename'),
      renamed: call('renamed'),
      toggle: call('toggle'),
      lock: call('lock'),
      hide: call('hide'),
      dragStart: call('dragStart'),
      dragEnd: call('dragEnd'),
      dragOver: call('dragOver'),
      dragLeave: call('dragLeave'),
      drop: call('drop'),
    }
  }, [])

  /** Hidden in some formats and shown in others. */
  const partlyHidden = (id: string) => {
    const visible = Object.keys(design.formats).map(
      (f) => (design.overrides[formatScope(f)]?.[id]?.visible ?? design.nodes[id]?.props.visible) !== false,
    )
    return visible.some(Boolean) && !visible.every(Boolean)
  }
  // The rows in view, with the row Tab lands on and the row the focus was last on wherever they are,
  // so the focus stays in the tree when its row scrolls away and Tab always reaches the tree.
  const places = new Set<number>()
  for (let i = first; i < last; i++) places.add(i)
  for (const id of [current, active]) {
    const at = id === null ? undefined : indexOf.get(id)
    if (at !== undefined) places.add(at)
  }
  const shown = [...places].sort((a, b) => a - b).flatMap((i) => (rows[i] ? [{ row: rows[i], i }] : []))
  const pictures = useLayerPictures(
    editor,
    `${pageId}/${formatId}`,
    shown.map(({ row }) => row.id),
    scrolledAt,
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="layers">
      {rows.length === 0 ? (
        <p className="p-4 text-[13px] text-muted">{t.editor.layersPanel.empty}</p>
      ) : (
        <div
          ref={scrollerRef}
          onScroll={(event) => {
            scrolledAt.current = performance.now()
            follow(event.currentTarget)
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2"
          data-testid="layers-scroller"
        >
          <div
            role="tree"
            aria-label={format(t.editor.layersPanel.tree, { page: page?.name ?? '' })}
            aria-multiselectable
            className="relative"
            style={{ height: rows.length * LAYER_ROW }}
          >
            {shown.map(({ row, i }) => (
              <LayerRow
                key={row.id}
                row={row}
                i={i}
                selected={selected.has(row.id)}
                focusable={row.id === current}
                renaming={renaming === row.id}
                open={expanded.has(row.id)}
                hidden={
                  (design.overrides[formatScope(formatId)]?.[row.id]?.visible ?? row.node.props.visible) === false
                }
                partlyHidden={partlyHidden(row.id)}
                drop={drop?.id === row.id ? drop.where : null}
                picture={pictures[row.id] ?? null}
                api={api}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface RowApi {
  focus: (id: string) => void
  key: (event: KeyboardEvent<HTMLElement>, row: Row, i: number) => void
  click: (id: string, add: boolean) => void
  rename: (id: string) => void
  renamed: (id: string, name: string | null, before: string, byKey: boolean) => void
  toggle: (id: string) => void
  lock: (id: string, locked: boolean) => void
  hide: (id: string, hidden: boolean, everyFormat: boolean) => void
  dragStart: (id: string) => void
  dragEnd: () => void
  dragOver: (event: DragEvent<HTMLElement>, row: Row) => boolean
  dragLeave: (id: string) => void
  drop: (event: DragEvent<HTMLElement>, row: Row) => boolean
}

/** One row of the tree. Rendered again only when something it shows changes. */
const LayerRow = memo(function LayerRow({
  row,
  i,
  selected,
  focusable,
  renaming,
  open,
  hidden,
  partlyHidden,
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
  partlyHidden: boolean
  drop: Where | null
  picture: string | null
  api: RowApi
}) {
  const t = useMessages()
  const { id, node, depth } = row
  const locked = isLocked(node)
  const LayerIcon = iconOf(node)
  // A frame says whether it is a plain box or stacks what it holds.
  const kind =
    node.type === 'frame'
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
      {/* In this format; with Alt, in every format: hidden in all of them if it shows in any. A layer hidden only in some shows a closed eye. */}
      <RowToggle
        on={hidden}
        stay={partlyHidden}
        label={format(hidden ? t.editor.layersPanel.show : t.editor.layersPanel.hide, { name: node.name })}
        title={`${partlyHidden ? `${t.editor.layersPanel.partlyHidden} · ` : ''}${t.editor.layersPanel.altEvery}`}
        state={partlyHidden ? 'some' : hidden ? 'hidden' : 'shown'}
        onToggle={(every) => api.hide(id, every ? !(hidden && !partlyHidden) : !hidden, every)}
        icon={partlyHidden ? EyeClosedIcon : hidden ? EyeSlashIcon : EyeIcon}
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

/** Lock or hide on a row: shown while the row is hovered or focused, and always while it is on. `onToggle` hears whether Alt was held. */
function RowToggle({
  on,
  stay = false,
  label,
  title,
  state,
  onToggle,
  icon: ToggleIcon,
  testId,
}: {
  on: boolean
  /** Shown even while off and not hovered. */
  stay?: boolean
  label: string
  title?: string
  state?: string
  onToggle: (alt: boolean) => void
  icon: Icon
  testId: string
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={on}
      title={title}
      aria-description={title}
      data-state={state}
      data-testid={testId}
      onClick={(event) => {
        event.stopPropagation()
        onToggle(event.altKey)
      }}
      className={cn(
        'grid size-6 shrink-0 cursor-pointer place-items-center rounded-[6px] text-subtle hover:bg-hover hover:text-text',
        !on && !stay && 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
      )}
    >
      <ToggleIcon size={14} aria-hidden />
    </button>
  )
}

/**
 * The name as a field: Enter or leaving it keeps the new name, Escape keeps the old one. `onDone`
 * hears whether it ended from the keyboard.
 */
function RenameField({
  name,
  label,
  onDone,
}: {
  name: string
  label: string
  onDone: (name: string | null, byKey: boolean) => void
}) {
  const [value, setValue] = useState(name)
  const done = useRef(false)
  const finish = (next: string | null, byKey: boolean) => {
    if (done.current) return
    done.current = true
    onDone(next, byKey)
  }
  return (
    <input
      name="layer-name"
      // Focused as it opens: the person asked to rename this layer.
      autoFocus
      aria-label={label}
      value={value}
      maxLength={120}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') finish(value, true)
        else if (event.key === 'Escape') finish(null, true)
      }}
      onBlur={() => finish(value, false)}
      className="h-6 min-w-0 flex-1 rounded-row border border-accent bg-raised px-1.5 text-[13px] outline-none"
    />
  )
}
