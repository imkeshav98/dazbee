'use client'

// The layers panel: the shown page's frames as top-level rows, each opening to its layers,
// topmost first, in step with the stage: a selection opens its frame and groups and scrolls to its
// row, a picked frame opens, and a click on a frame's row picks it. Drag a layer's row to reorder it
// or drop it into a group of its frame; rename frames and layers, lock and hide layers; expand frames
// and groups. Every change is an editor call or a command, so each is one undo step. Only the rows in
// view are in the page, so a page of hundreds of layers scrolls as smoothly as one of ten.
import { type DragEvent, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { ancestorsOf, childrenOf } from '@dazbee/doc'
import type { Editor } from '@dazbee/editor'
import { canHold, frameIdOf, framesOf } from '@dazbee/schema'

import { usePickedFrame, useSelection, useShownPage } from '@/components/editor/editor-hooks.ts'
import { useFlyoutNote } from '@/components/editor/shell.tsx'
import { useLiveDesign } from '@/components/editor/use-live-design.ts'
import { useOverlayScroll } from '@/components/ui/overlay-scroll.ts'
import { swatchOf } from '@/lib/editor/frame-swatch.ts'
import { arrowStep, type LayerTreeRow, opensFor, type Row, treeRows } from '@/lib/editor/layer-tree.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf, format } from '@/lib/i18n/index.ts'

import { FrameRow } from './frame-row.tsx'
import { LayerRow } from './layer-row.tsx'
import { LAYER_ROW, type RowApi, type Where } from './tree-row.tsx'
import { useLayerPictures } from './use-layer-pictures.ts'
import { scrollToRow, useRowWindow } from './use-row-window.ts'
import { useTreeFocus } from './use-tree-focus.ts'

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

export function LayersPanel({ editor }: { editor: Editor }) {
  const t = useMessages()
  const rtl = dirOf(useLocale()) === 'rtl'
  const { design, version } = useLiveDesign(editor)
  const selection = useSelection(editor)
  const picked = usePickedFrame(editor)
  // The rows lit as chosen: the selected layers', and the picked frame's.
  const selected = useMemo(() => new Set(picked === null ? selection : [...selection, picked]), [selection, picked])
  const isFrame = (id: string) => Object.hasOwn(design.frames, id)

  const pageId = useShownPage(editor)
  const page = design.pages[pageId]
  const frames = framesOf(design, pageId)
  // The title row's note names the page the tree is of, as in the mock.
  useFlyoutNote(page?.name ?? null)

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  // A selection on the stage, or a picked frame, shows in the panel: its frame and the groups it is
  // in open, each time what they are changes, so a row closed by hand stays closed until then.
  const opening = opensFor(design, selection, picked).join(' ')
  useEffect(() => {
    if (!opening) return
    setExpanded((now) => {
      const add = opening.split(' ').filter((id) => !now.has(id))
      return add.length > 0 ? new Set([...now, ...add]) : now
    })
  }, [opening])
  // A page of one frame opens it: there is no other to choose.
  const onlyFrame = frames.length === 1 ? frames[0]?.[0] : undefined
  useEffect(() => {
    if (onlyFrame !== undefined) setExpanded((now) => (now.has(onlyFrame) ? now : new Set([...now, onlyFrame])))
  }, [onlyFrame])

  // The panel's own moves, counted so the rows show a move in the render that follows its key, not
  // a frame later at the redraw.
  const [moved, setMoved] = useState(0)
  // The version is how the live design says it changed.
  const rows = useMemo(() => treeRows(design, pageId, expanded), [design, version, moved, pageId, expanded])
  const indexOf = useMemo(() => new Map(rows.map((row, i) => [row.id, i])), [rows])

  // Which rows are in view.
  const scroller = useRef<HTMLDivElement>(null)
  const scrollerRef = useOverlayScroll(scroller)
  const { view, follow } = useRowWindow(scroller)
  const scrolledAt = useRef(0)
  const first = view.from
  const last = Math.min(rows.length, view.to)

  const [renaming, setRenaming] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; where: Where } | null>(null)
  const dragged = useRef<string | null>(null)
  const { active, current, reveal, focused } = useTreeFocus({
    editor,
    design,
    rows,
    indexOf,
    selected,
    isFrame,
    scroller,
    follow,
  })

  // A selection made anywhere shows its row: the list scrolls to the topmost selected row once it
  // is listed, each time the selection changes.
  const shownFor = useRef('')
  useLayoutEffect(() => {
    const key = [...selected].join(' ')
    if (key === shownFor.current) return
    const at = Math.min(...[...selected].flatMap((id) => indexOf.get(id) ?? []))
    const el = scroller.current
    if (!Number.isFinite(at) && key) return
    shownFor.current = key
    if (!el || !Number.isFinite(at)) return
    scrollToRow(el, at)
    follow(el)
  })

  /** Picks a frame by its row, or selects a layer by its row, alone or added to the selection or taken from it. */
  const select = (id: string, add = false) => {
    if (isFrame(id)) {
      editor.pickFrame(id)
      return
    }
    const ids = add ? (selected.has(id) ? selection.filter((s) => s !== id) : [...selection, id]) : [id]
    editor.select(ids)
  }
  const toggle = (id: string, open = !expanded.has(id)) => {
    const next = new Set(expanded)
    if (open) next.add(id)
    else next.delete(id)
    setExpanded(next)
  }

  /** Moves a layer next to or into another, or to the top of its frame, as the panel shows them. */
  const place = (id: string, target: Row, where: Where) => {
    if (id === target.id) return false
    if (target.kind === 'frame') return editor.moveLayer(id, target.id)
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
  const shift = (row: LayerTreeRow, key: string) => {
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
    const at = treeRows(design, pageId, open).findIndex((r) => r.id === id)
    return at < 0 ? undefined : at
  }

  const onKey = (event: KeyboardEvent<HTMLElement>, row: Row, i: number) => {
    if (renaming) return
    let handled = true
    if (event.altKey && ARROWS.includes(event.key)) {
      // Frames keep their place: Alt with the arrows moves layers only.
      if (row.kind === 'layer' && shift(row, event.key)) {
        setMoved((n) => n + 1)
        reveal(row.id, placeOf(row.id))
      }
    } else if (ARROWS.includes(event.key) || event.key === 'Home' || event.key === 'End') {
      // Onto a frame's row picks the frame; onto a layer's selects the layer.
      const step = arrowStep(rows, i, event.key, expanded, rtl)
      if (step && 'go' in step) {
        select(step.go.id)
        reveal(step.go.id)
      } else if (step) toggle(step.toggle, step.open)
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
    // A layer moves only within its own frame; on its frame's row it goes to the frame's top.
    if (frameIdOf(design, id) !== row.frameId) return null
    if (row.kind === 'frame') return 'into'
    const box = event.currentTarget.getBoundingClientRect()
    const y = (event.clientY - box.top) / box.height
    if (canHold(row.node.type, node.type) && y > 0.25 && y < 0.75) return 'into'
    return y < 0.5 ? 'above' : 'below'
  }

  // The rows get one object whose calls reach the latest handlers, so a row that hasn't changed
  // isn't rendered again when the view scrolls or another row changes.
  const latest = useRef<RowApi | null>(null)
  latest.current = {
    focus: focused,
    key: onKey,
    click: (id, add) => select(id, add),
    rename: (id) => setRenaming(id),
    renamed: (id, name, before, byKey) => {
      setRenaming(null)
      const next = name?.trim()
      if (next && next !== before) {
        if (!isFrame(id)) editor.renameLayer(id, next)
        else if (editor.design().frames[id]) editor.session.run('frame.update', { frameId: id, name: next })
      }
      // Ended from the keyboard, the focus goes back to the row; ended by a click elsewhere, it
      // stays where the click put it.
      if (byKey) reveal(id)
    },
    toggle: (id) => toggle(id),
    lock: (id, locked) => editor.setLocked([id], locked),
    hide: (id, hidden) => editor.setHidden([id], hidden),
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

  // The rows in view, with the row Tab lands on and the row the focus was last on wherever they are,
  // so the focus stays in the tree when its row scrolls away and Tab always reaches the tree.
  const places = new Set<number>()
  for (let i = first; i < last; i++) places.add(i)
  for (const id of [current, active]) {
    const at = id === null ? undefined : indexOf.get(id)
    if (at !== undefined) places.add(at)
  }
  const shown = [...places].sort((a, b) => a - b).flatMap((i) => (rows[i] ? [{ row: rows[i], i }] : []))
  // A text's row shows the text icon, as every text row does: a picture of its words in their own
  // colour can vanish against the panel. A frame's row shows its background.
  const pictures = useLayerPictures(
    editor,
    pageId,
    shown.flatMap(({ row }) => (row.kind === 'frame' || row.node.type === 'text' ? [] : [row.id])),
    scrolledAt,
  )
  // A page whose frames hold no layer yet says how to add one under its frames.
  const noLayers = rows.every((row) => row.kind === 'frame' && !row.hasChildren)
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="layers">
      {rows.length === 0 ? (
        <p className="p-4 text-[13px] text-muted">{t.editor.frames.emptyPage}</p>
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
            {shown.map(({ row, i }) =>
              row.kind === 'frame' ? (
                <FrameRow
                  key={row.id}
                  row={row}
                  i={i}
                  picked={selected.has(row.id)}
                  focusable={row.id === current}
                  renaming={renaming === row.id}
                  open={expanded.has(row.id)}
                  swatch={swatchOf(design, row.id)}
                  dropInto={drop?.id === row.id}
                  api={api}
                />
              ) : (
                <LayerRow
                  key={row.id}
                  row={row}
                  i={i}
                  selected={selected.has(row.id)}
                  focusable={row.id === current}
                  renaming={renaming === row.id}
                  open={expanded.has(row.id)}
                  hidden={row.node.props.visible === false}
                  drop={drop?.id === row.id ? drop.where : null}
                  picture={pictures[row.id] ?? null}
                  api={api}
                />
              ),
            )}
          </div>
          {noLayers && <p className="px-2.5 pt-2 text-[13px] text-muted">{t.editor.layersPanel.empty}</p>}
        </div>
      )}
    </div>
  )
}
