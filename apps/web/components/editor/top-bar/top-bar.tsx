'use client'

// The top bar: fixed at the top centre of the stage while layers are selected or a frame is picked,
// its items set by what is selected (text, a photo, a shape, a box, a group, or several, or the
// picked frame's Background and ⋯); a locked layer's bar says it is locked and unlocks it. An item
// with ▾ opens a pop-up under the bar; a panel item opens the one edit panel at the stage's end;
// the rest act at once. Its last item, Arrange ⋯ for layers or a picked frame's ⋯, always ends the
// first row. When the items don't fit, the others that don't go to a second row under the bar: on
// a tablet or desktop it opens from More controls, which stands before the last item; on a phone it
// is a second card that always shows, as the mock draws it. Nothing scrolls sideways.
import { CaretDownIcon } from '@phosphor-icons/react'
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

/** The gap after each of the bar's items, in pixels. */
const GAP = 2
/** The width More controls takes on the first row, with its gap, in pixels. */
const MORE = 30 + GAP
/** The bar's look: a frosted pill of buttons, centred at the top of the stage under the header pill. */
const TOP_BAR = 'flex items-center gap-0.5 rounded-[14px] surface-frost p-1'

/** The sum of an element's own widths along its sides, by their CSS names, in pixels. */
function sidesOf(el: Element, ...names: string[]) {
  const style = getComputedStyle(el)
  return names.reduce((sum, name) => sum + Number.parseFloat(style.getPropertyValue(name)), 0)
}

/**
 * How many of the items before the last fit on the bar's first row, which the last item always
 * ends; the others go to the second row. All of them fitting is Infinity. On a tablet or desktop
 * More controls stands before the last item while some don't fit, so its room is kept too. Every
 * item is drawn in one of the two rows at all times, so each one's width can be read; `keys` are
 * the items' keys in order, joined by spaces.
 */
function useFit(row: HTMLElement | null, extra: HTMLElement | null, keys: string, phone: boolean) {
  const [fit, setFit] = useState(Infinity)
  useLayoutEffect(() => {
    if (!row || !extra) return
    const wrapper = row.parentElement
    const measure = () => {
      // Inside the wrapper's padding, less the bar's own padding and border.
      const room =
        (wrapper ? wrapper.clientWidth - sidesOf(wrapper, 'padding-left', 'padding-right') : window.innerWidth) -
        sidesOf(row, 'padding-left', 'padding-right', 'border-left-width', 'border-right-width')
      // Each item's wrapper draws nothing of its own (display: contents); its button has the width.
      const widths = new Map<string, number>()
      for (const el of [...row.children, ...extra.children])
        if (el instanceof HTMLElement && el.dataset.item !== undefined)
          widths.set(el.dataset.item, ((el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) + GAP)
      const ordered = keys.split(' ').map((key) => widths.get(key) ?? 0)
      // The last item has no gap after it.
      if (ordered.reduce((sum, w) => sum + w, 0) - GAP <= room) return setFit(Infinity)
      let used = (ordered.at(-1) ?? 0) + (phone ? 0 : MORE)
      let n = 0
      for (const w of ordered.slice(0, -1)) {
        if (used + w - GAP > room) break
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
  }, [row, extra, keys, phone])
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
  // The last item ends the first row; before it, the items that fit. A divider never ends the first
  // row's items or starts the second row.
  const fits = fit >= items.length
  let shown = fits ? items.length : fit
  while (!fits && shown > 0 && items[shown - 1]?.key.startsWith('divider')) shown--
  const first = fits ? items : [...items.slice(0, shown), ...items.slice(-1)]
  const rest = fits ? [] : items.slice(shown, -1).filter((item, i) => !(i === 0 && item.key.startsWith('divider')))
  const overflowing = rest.length > 0
  // The second row is its own: opening it leaves an open panel, which moves down under it. On a
  // phone it always shows.
  const [rowOpen, setRowOpen] = useState(false)
  const overflowOpen = overflowing && (phone || rowOpen || rest.some((item) => item.key === open))
  const focused = useRovingTab(bar)
  // The bar's bottom edge, under the second row when it shows, for what sits under the bar: in the
  // stage's pixels, rounded up, as the rows' gap may leave it between two pixels.
  const reported = useRef(-1)
  useLayoutEffect(() => {
    const measure = () => {
      if (!row) return
      const lowest = overflowOpen && extra ? extra : row
      const stageTop = bar?.offsetParent?.getBoundingClientRect().top ?? 0
      const bottom = Math.ceil(lowest.getBoundingClientRect().bottom - stageTop)
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
  // Each selection's bar starts with its second row closed.
  const selectionKey = Object.values(named).join(' ')
  useLayoutEffect(() => setRowOpen(false), [selectionKey])
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
      <div ref={setRow} className={cn(TOP_BAR, 'pointer-events-auto max-w-full')} data-testid="top-bar-row">
        {first.slice(0, -1).map(item)}
        {overflowing && !phone && (
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
            {/* A caret, not a ⋯, so it never looks like the ⋯ beside it. */}
            <CaretDownIcon
              size={14}
              weight="bold"
              aria-hidden
              className={cn('transition-transform duration-[var(--chrome-fast)]', overflowOpen && 'rotate-180')}
            />
          </button>
        )}
        {first.slice(-1).map(item)}
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
