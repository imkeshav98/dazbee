'use client'

// The top bar: fixed at the top centre of the stage while layers are selected or a frame is picked,
// its items set by what is selected (text, a photo, a shape, a box, a group, or several, or the
// picked frame's Background and ⋯); a locked layer's bar says it is locked and unlocks it. An item
// with ▾ opens a pop-up under the bar; a panel item opens the one edit panel at the stage's end;
// the rest act at once. Its last items, Position for layers (Line up ▾ and Position for several) or
// a picked frame's ⋯, always end the first row together. When the items don't fit, the others that
// don't go to a second row under the bar, cut between two groups where the group fits in a row: on a
// tablet or desktop it opens from More controls, which stands after a divider before the last
// items; on a phone it is a second card that always shows, as the mock draws it, and every item is
// a 44 px target 8 px from the next. Nothing scrolls sideways.
import { CaretDownIcon } from '@phosphor-icons/react'
import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { Editor } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { type Target, useTarget } from '@/components/editor/edit-panel/target.ts'
import {
  closesWithSelection,
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
import { BAR_BUTTON, BAR_DIVIDER, BAR_ROW } from '@/components/editor/styles.ts'
import { useLiveDesign } from '@/components/editor/use-live-design.ts'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

import { arrowAlong, useRovingTab } from './bar-popover.tsx'
import { useFrameItems } from './frame-items.tsx'
import { type BarItem, useSelectionItems } from './top-bar-items.tsx'

/** The width a divider takes with its margins, as a tablet or desktop draws it, in pixels. */
const DIVIDER = 5
/** The width More controls and the divider before it take on the first row, without their gaps, in pixels. */
const MORE = 30 + DIVIDER
/**
 * The bar's look: a frosted pill of buttons, centred at the top of the stage under the header pill.
 * On a phone every item is a 44 px target, 8 px from the next.
 */
const TOP_BAR =
  'flex items-center gap-0.5 rounded-[14px] surface-frost p-1 max-sm:gap-[8px] max-sm:rounded-[18px] max-sm:p-[2px] max-sm:[&_[data-bar-item]]:h-[44px] max-sm:[&_[data-bar-item]]:min-w-[44px] max-sm:[&_[data-bar-item]]:px-[6px]'

/** Room kept between the bar and a selection the stage moves clear of it, its handles' reach included, in pixels. */
const CLEAR = 12

/** When the last press on the page went down, and whether a press is held, as a window listener keeps them. */
const press = { at: 0, held: false }

/** An element's width with its margins, in pixels. */
function outerWidth(el: Element | null) {
  if (!(el instanceof HTMLElement)) return 0
  return el.offsetWidth + sidesOf(el, 'margin-left', 'margin-right')
}

/**
 * Where the first row ends when it would cut a group of items in two, `cut` being the first item
 * that doesn't fit: before the group, when the group starts after a divider and fits in a row of
 * its own, so it goes whole to the second row; else at `cut`. `widths` are the items' widths, each
 * with the gap after it.
 */
function groupCut(keys: string[], widths: number[], cut: number, room: number, gap: number) {
  const divider = (i: number) => keys[i]?.startsWith('divider') === true
  if (cut <= 0 || cut >= keys.length || divider(cut) || divider(cut - 1)) return cut
  let start = cut
  while (start > 0 && !divider(start - 1)) start--
  if (start === 0) return cut
  let end = cut
  while (end < keys.length && !divider(end)) end++
  const wide = widths.slice(start, end).reduce((sum, w) => sum + w, 0) - gap
  return wide <= room ? start : cut
}

/** The sum of an element's own widths along its sides, by their CSS names, in pixels. */
function sidesOf(el: Element, ...names: string[]) {
  const style = getComputedStyle(el)
  return names.reduce((sum, name) => sum + Number.parseFloat(style.getPropertyValue(name)), 0)
}

/** Keeps `press` as presses go down and up anywhere on the page, before anything else hears them. */
function usePressWatch() {
  useEffect(() => {
    const down = () => {
      press.at = performance.now()
      press.held = true
    }
    const up = () => {
      press.held = false
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [])
}

/**
 * The top edge, in the stage's pixels, of the open flyout or sheet that covers the stage's lower
 * part on a phone; Infinity with neither open.
 */
function floorOf(overlay: HTMLElement) {
  const flyout = document.querySelector('#editor-flyout')?.getBoundingClientRect()
  const flyoutTop = flyout && flyout.height > 0 ? flyout.top - overlay.getBoundingClientRect().top : Infinity
  return Math.min(flyoutTop, editState().sheetTop ?? Infinity)
}

/**
 * On a phone, once no press is held, moves the stage so the selection lies clear under the bar,
 * when it sits under it: the bar takes two rows there and must never cover what it acts on. The
 * move never takes the selection under an open flyout or sheet: where it can't clear both, it
 * stops short of them, and the frame's label, or the selection's top, stays under the bar.
 */
function useSelectionClear(editor: Editor, ids: string[], phone: boolean) {
  const key = ids.join(' ')
  useEffect(() => {
    if (!phone || key === '') return
    const clear = () => {
      const rect = editor.selectionRect()
      const overlay = document.querySelector<HTMLElement>('.stage-overlay')
      if (!rect || !overlay) return
      // The selection's frame label, lit while a layer in it is selected, is kept clear too; the
      // overlay places it in the stage's pixels.
      const label = overlay.querySelector<HTMLElement>('.frame-label[data-active]')
      const top = Math.min(rect.y, label ? Number.parseFloat(label.style.top) : Infinity)
      const room = floorOf(overlay) - CLEAR - (rect.y + rect.height)
      const under = Math.min(editState().barBottom + CLEAR - top, room)
      if (under <= 0) return
      const camera = editor.camera()
      // The camera's offset is in screen pixels: adding to it moves the design down.
      editor.setCamera({ ...camera, y: camera.y + under })
    }
    if (!press.held) return clear()
    // After the editor has heard the press end, so the stage moves under no press it reads.
    let frame = 0
    const later = () => {
      frame = requestAnimationFrame(clear)
    }
    window.addEventListener('pointerup', later, { once: true })
    return () => {
      window.removeEventListener('pointerup', later)
      cancelAnimationFrame(frame)
    }
  }, [editor, key, phone])
}

/**
 * How many of the items before the last `tail` fit on the bar's first row, which those always end;
 * the others go to the second row, cut between two groups where `groupCut` says so. All of them
 * fitting is Infinity. On a tablet or desktop More controls stands before the last items while some
 * don't fit, so its room is kept too. Every item is drawn in one of the two rows at all times, so
 * each one's width can be read; `keys` are the items' keys in order, joined by spaces.
 */
function useFit(row: HTMLElement | null, extra: HTMLElement | null, keys: string, tail: number, phone: boolean) {
  const [fit, setFit] = useState(Infinity)
  useLayoutEffect(() => {
    if (!row || !extra) return
    const wrapper = row.parentElement
    const measure = () => {
      // Inside the wrapper's padding, less the bar's own padding and border.
      const room =
        (wrapper ? wrapper.clientWidth - sidesOf(wrapper, 'padding-left', 'padding-right') : window.innerWidth) -
        sidesOf(row, 'padding-left', 'padding-right', 'border-left-width', 'border-right-width')
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0
      // Each item's wrapper draws nothing of its own (display: contents); its button has the width.
      const widths = new Map<string, number>()
      for (const el of [...row.children, ...extra.children])
        if (el instanceof HTMLElement && el.dataset.item !== undefined)
          widths.set(el.dataset.item, outerWidth(el.firstElementChild) + gap)
      // A divider the cut leaves out is not drawn, yet counts as wide as a drawn one, so the fit never
      // changes for its having been left out.
      const drawn = [...widths].find(([key]) => key.startsWith('divider'))?.[1] ?? DIVIDER + gap
      const named = keys.split(' ')
      const ordered = named.map((key) => widths.get(key) ?? (key.startsWith('divider') ? drawn : 0))
      // The last item has no gap after it.
      if (ordered.reduce((sum, w) => sum + w, 0) - gap <= room) return setFit(Infinity)
      let used = ordered.slice(-tail).reduce((sum, w) => sum + w, 0) + (phone ? 0 : MORE + gap * 2)
      let n = 0
      for (const w of ordered.slice(0, -tail)) {
        if (used + w - gap > room) break
        used += w
        n++
      }
      setFit(groupCut(named.slice(0, -tail), ordered.slice(0, -tail), n, room, gap))
    }
    measure()
    const watch = new ResizeObserver(measure)
    if (wrapper) watch.observe(wrapper)
    for (const el of [...row.children, ...extra.children]) watch.observe(el.firstElementChild ?? el)
    return () => watch.disconnect()
  }, [row, extra, keys, tail, phone])
  return fit
}

export function TopBar({ editor, brandId }: { editor: Editor; brandId: string }) {
  const ids = useSelection(editor)
  usePressWatch()
  useSelectionClear(editor, ids, usePhone())
  const picked = usePickedFrame(editor)
  const selected = useTarget(editor, ids)
  // A pop-up or panel belongs to the selection or the picked frame it was opened for: another one
  // closes it, and selecting layers closes any. Pages and Add a frame stay open as the selection goes
  // or another frame is picked (`closesWithSelection`).
  const opened = useRef({ ids, picked })
  useLayoutEffect(() => {
    const was = opened.current
    if (was.ids === ids && was.picked === picked) return
    opened.current = { ids, picked }
    const now = editState().open
    if (ids.length > 0 || closesWithSelection(now)) setOpen(null)
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
  const { open, flyoutEnd, rightClick } = useEditState()
  const phone = usePhone()
  // On a phone the full menu and the right-click menu are a sheet over the stage, which the bar,
  // having nothing for it, gives way to, as the dock and the tab bar do.
  const givesWay = phone && (open === 'more' || rightClick)
  // Beside an open rail flyout, the bar is centred in the room left at the end side.
  const startAt = !phone && flyoutEnd !== null ? flyoutEnd + 12 : 0
  const [bar, setBarEl] = useState<HTMLDivElement | null>(null)
  const [row, setRow] = useState<HTMLDivElement | null>(null)
  const [extra, setExtra] = useState<HTMLDivElement | null>(null)
  const keys = items.map((item) => item.key).join(' ')
  // The items that end the bar together: those marked as its tail, or at least the last one.
  let tail = 1
  while (tail < items.length && items[items.length - tail - 1]?.tail) tail++
  const fit = useFit(row, extra, keys, tail, phone)
  // The last items end the first row; before them, the items that fit. A divider never ends the
  // first row's items or starts the second row.
  const fits = fit >= items.length - tail
  let shown = fits ? items.length - tail : fit
  while (!fits && shown > 0 && items[shown - 1]?.key.startsWith('divider')) shown--
  const first = fits ? items : [...items.slice(0, shown), ...items.slice(-tail)]
  const rest = fits
    ? []
    : items
        .slice(shown, -tail)
        .filter((item, i, all) => !(item.key.startsWith('divider') && (i === 0 || i === all.length - 1)))
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
  // The press that showed this bar, as the tap that selected its layer, presses nothing on it,
  // though it lifts over one of its buttons.
  const showing = useRef({ at: 0, press: 0 })
  useLayoutEffect(() => {
    showing.current = { at: performance.now(), press: press.at }
  }, [selectionKey])
  const onClickCapture = (event: MouseEvent) => {
    // A pointer's click with no press since the bar showed, coming as that press ends.
    const fromThatPress = event.detail > 0 && press.at === showing.current.press && press.at < showing.current.at
    if (!fromThatPress) return
    event.preventDefault()
    event.stopPropagation()
  }
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
  // Each item names its group, counted by the dividers before it, which a row's cut may leave out.
  const groupOf = new Map(
    items.map((one, i) => [one.key, items.slice(0, i).filter((it) => it.key.startsWith('divider')).length]),
  )
  const item = ({ key, node }: BarItem) => (
    <span key={key} data-item={key} data-group={groupOf.get(key)} className="contents [&>*]:shrink-0">
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
      onClickCapture={onClickCapture}
      onFocus={focused}
      style={{ insetInlineStart: startAt }}
      className={cn(
        'pointer-events-none absolute end-0 z-20 flex flex-col items-center gap-1.5 px-4 max-sm:px-2',
        BAR_ROW,
        givesWay && 'invisible',
      )}
    >
      <div ref={setRow} className={cn(TOP_BAR, 'pointer-events-auto max-w-full')} data-testid="top-bar-row">
        {first.slice(0, -tail).map(item)}
        {overflowing && !phone && (
          // A divider sets More controls apart, so it never reads as the caret of the item before it.
          <span aria-hidden data-testid="divider-more" className={BAR_DIVIDER} />
        )}
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
        {first.slice(-tail).map(item)}
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
