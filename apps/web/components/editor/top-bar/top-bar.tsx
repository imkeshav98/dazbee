'use client'

// The top bar: fixed at the top centre of the stage while layers are selected or a frame is picked,
// its items set by what is selected (text, a photo, a shape, a box, a group, or several, or the
// picked frame's Background and ⋯); a locked layer's bar says it is locked and unlocks it. An item
// with ▾ opens a pop-up
// under the bar; a panel item opens the one edit panel at the stage's end; the rest act at once.
// When the items don't fit, the last ones go into ⋯, which opens a second row under the bar;
// on a phone the bar scrolls sideways instead.
import { DotsThreeIcon } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { Editor } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { type Target, useTarget } from '@/components/editor/edit-panel/target.ts'
import {
  editState,
  isLayerPanel,
  isPanel,
  overPanel,
  setBar,
  setOpen,
  useEditState,
  usePhone,
} from '@/components/editor/edit-store.ts'
import { usePickedFrame, useSelection } from '@/components/editor/editor-hooks.ts'
import { BAR_BUTTON, BAR_ROW } from '@/components/editor/styles.ts'
import { useLiveDesign } from '@/components/editor/use-live-design.ts'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

import { arrowAlong, useRovingTab } from './bar-popover.tsx'
import { useFrameItems } from './frame-items.tsx'
import { type BarItem, useSelectionItems } from './top-bar-items.tsx'

/** Room kept between the bar and the stage's sides. */
const SIDE = 16
/** The bar's look: a frosted pill of buttons, centred at the top of the stage under the header pill. */
const TOP_BAR = 'flex items-center gap-0.5 rounded-[14px] surface-frost p-1'

/**
 * How many of the items fit on the bar's row; the rest go in the second row behind ⋯. Every item
 * is drawn in one of the two rows at all times, so each one's width can be read.
 */
function useFit(row: HTMLElement | null, extra: HTMLElement | null, keys: string, off: boolean) {
  const [fit, setFit] = useState(Infinity)
  useLayoutEffect(() => {
    if (!row || !extra || off) {
      setFit(Infinity)
      return
    }
    const wrapper = row.parentElement
    const measure = () => {
      // The bar's own padding and border take 8 px; each item has 2 px of gap after it; ⋯ is 34 px.
      const room = (wrapper?.clientWidth ?? window.innerWidth) - SIDE * 2 - 8
      // Each item's wrapper draws nothing of its own (display: contents); its button has the width.
      const widths = [...row.children, ...extra.children]
        .filter((el) => el instanceof HTMLElement && el.dataset.item !== undefined)
        .map((el) => ((el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) + 2)
      const total = widths.reduce((sum, w) => sum + w, 0)
      if (total <= room) return setFit(Infinity)
      const more = 34
      let used = 0
      let n = 0
      for (const w of widths) {
        if (used + w > room - more) break
        used += w
        n++
      }
      setFit(n)
    }
    measure()
    const watch = new ResizeObserver(measure)
    if (wrapper) watch.observe(wrapper)
    for (const el of [...row.children, ...extra.children]) watch.observe(el.firstElementChild ?? el)
    return () => watch.disconnect()
  }, [row, extra, keys, off])
  return fit
}

export function TopBar({ editor, brandId }: { editor: Editor; brandId: string }) {
  const ids = useSelection(editor)
  const picked = usePickedFrame(editor)
  const selected = useTarget(editor, ids)
  // A pop-up or panel belongs to the selection or the picked frame it was opened for: another one
  // closes it. Pages stays open when showing another page lets the selection go.
  const opened = useRef({ ids, picked })
  useLayoutEffect(() => {
    const was = opened.current
    if (was.ids === ids && was.picked === picked) return
    opened.current = { ids, picked }
    const now = editState().open
    if (ids.length > 0 || !isPanel(now) || isLayerPanel(now) || now === 'background') setOpen(null)
  }, [ids, picked])
  useEffect(
    () => () => {
      setBar(false)
      setOpen(null)
    },
    [],
  )
  if (selected) return <LayerBar target={selected.target} design={selected.design} brandId={brandId} />
  if (picked) return <FrameBar editor={editor} frameId={picked} />
  return <BarGone />
}

function LayerBar({ target, design, brandId }: { target: Target; design: Design; brandId: string }) {
  const items = useSelectionItems(target, design, brandId)
  return (
    <Bar items={items} label={useMessages().editor.bar.topBar} named={{ 'data-selection': target.ids.join(' ') }} />
  )
}

function FrameBar({ editor, frameId }: { editor: Editor; frameId: string }) {
  const { design } = useLiveDesign(editor)
  const items = useFrameItems(editor, frameId, design)
  const label = useMessages().editor.frames.bar
  // A frame duplicated a moment ago is picked before the design that holds it is drawn.
  if (!design.frames[frameId]) return <BarGone />
  return <Bar items={items} label={label} named={{ 'data-frame': frameId }} />
}

/** With nothing selected there is no bar. */
function BarGone() {
  useLayoutEffect(() => setBar(false), [])
  return null
}

/** The bar for what it acts on, which `named` names on it: the selected layers, or the picked frame. */
function Bar({
  items,
  label,
  named,
}: {
  items: BarItem[]
  label: string
  named: { 'data-selection': string } | { 'data-frame': string }
}) {
  const t = useMessages()
  const { open, flyoutEnd } = useEditState()
  const phone = usePhone()
  // Beside an open rail flyout, the bar is centred in the room left at the end side.
  const startAt = !phone && flyoutEnd !== null ? flyoutEnd + 12 : 0
  const [bar, setBarEl] = useState<HTMLDivElement | null>(null)
  const [row, setRow] = useState<HTMLDivElement | null>(null)
  const [extra, setExtra] = useState<HTMLDivElement | null>(null)
  const keys = items.map((item) => item.key).join(' ')
  const fit = useFit(row, extra, keys, phone)
  // A divider never ends the first row or starts the second.
  let shown = Math.min(fit, items.length)
  while (shown > 0 && items[shown - 1]?.key.startsWith('divider')) shown--
  const first = items.slice(0, shown)
  const rest = items.slice(shown).filter((item, i) => !(i === 0 && item.key.startsWith('divider')))
  const overflowing = rest.length > 0
  // The second row is its own: opening it leaves an open panel, which moves down under it.
  const [rowOpen, setRowOpen] = useState(false)
  const overflowOpen = overflowing && (rowOpen || rest.some((item) => item.key === open))
  const focused = useRovingTab(bar)
  // The bar's bottom edge, under the second row when it is open, for what sits under the bar.
  const reported = useRef(-1)
  useLayoutEffect(() => {
    const measure = () => {
      if (!row) return
      const bottom =
        Math.round(
          (overflowOpen && extra ? extra.offsetTop + extra.offsetHeight : 0) || row.offsetTop + row.offsetHeight,
        ) + (bar?.offsetTop ?? 0)
      if (bottom === reported.current) return
      reported.current = bottom
      setBar(true, bottom)
    }
    measure()
    const watch = new ResizeObserver(measure)
    if (bar) watch.observe(bar)
    return () => watch.disconnect()
  }, [bar, row, extra, overflowOpen])
  useLayoutEffect(() => () => setBar(false), [])
  // Each selection's bar starts at its first item, on a phone too, where the bar scrolls sideways.
  const selectionKey = Object.values(named).join(' ')
  useLayoutEffect(() => {
    if (row) row.scrollLeft = 0
    setRowOpen(false)
  }, [row, selectionKey])
  // A panel whose item has left the bar closes, as a shape's Colour does once it holds a photo.
  useLayoutEffect(() => {
    if (isLayerPanel(open) && !items.some((item) => item.key === open)) setOpen(null)
  }, [open, keys])
  // A pop-up hangs from its item: once the window changes size the item may have moved, so it closes.
  useEffect(() => {
    const onResize = () => {
      const now = editState().open
      if (now !== null && !isPanel(now)) setOpen(null)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Esc closes the bar's second row before anything else, so it never also clears the selection.
  useEffect(() => {
    if (!rowOpen) return
    const onKey = (event: KeyboardEvent) => {
      // A pop-up or panel open from the row, or what stands over it, closes first, on its own Esc.
      if (event.key !== 'Escape' || editState().open !== null || overPanel()) return
      event.stopImmediatePropagation()
      setRowOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [rowOpen])
  const item = ({ key, node }: BarItem) => (
    <span key={key} data-item={key} className="contents [&>*]:shrink-0">
      {node}
    </span>
  )
  return (
    <div
      ref={setBarEl}
      role="toolbar"
      aria-label={label}
      data-testid="top-bar"
      {...named}
      onKeyDown={arrowAlong}
      onFocus={focused}
      style={{ insetInlineStart: startAt }}
      className={cn(
        'pointer-events-none absolute end-0 z-20 flex flex-col items-center gap-1.5 px-4 max-sm:px-2',
        BAR_ROW,
      )}
    >
      <div
        ref={setRow}
        className={cn(TOP_BAR, 'pointer-events-auto max-w-full', phone && 'no-scrollbar overflow-x-auto')}
        data-testid="top-bar-row"
      >
        {first.map(item)}
        {overflowing && (
          <button
            type="button"
            data-bar-item
            aria-label={t.editor.bar.overflow}
            title={t.editor.bar.overflow}
            aria-expanded={overflowOpen}
            data-testid="bar-overflow"
            onClick={() => setRowOpen(!overflowOpen)}
            className={cn(BAR_BUTTON, 'px-1.5')}
          >
            <DotsThreeIcon size={18} weight="bold" aria-hidden />
          </button>
        )}
      </div>
      <div
        ref={setExtra}
        data-testid="top-bar-overflow"
        className={cn(
          TOP_BAR,
          'pointer-events-auto max-w-full flex-wrap justify-center',
          !overflowOpen && 'invisible absolute',
          !overflowing && 'hidden',
        )}
      >
        {rest.map(item)}
      </div>
    </div>
  )
}
