'use client'

// A row of the editor's menus that runs an action, its key at its end, greyed with the reason in a
// tooltip while it has nothing to do; and the arrow keys that move the focus through a menu's rows.
import { CaretRightIcon } from '@phosphor-icons/react'
import { type KeyboardEvent, useRef, useState } from 'react'

import { MENU_ITEM, MENU_ITEM_GREYED, MENU_KEY } from '@/components/editor/styles.ts'
import { TOOLTIP, Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { type Box, type TooltipPlace, tooltipPlace } from '@/lib/editor/tooltip-place.ts'
import { useLocale } from '@/lib/i18n/client.tsx'
import { dirOf } from '@/lib/i18n/index.ts'

/** The keys that move the focus through a menu's rows. */
const ROW_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End']

/** An element's box in the window. */
const boxOf = (el: Element): Box => {
  const { left, top, right, bottom } = el.getBoundingClientRect()
  return { left, top, right, bottom }
}

/**
 * Where a row's tooltip goes: beside it when there is room, otherwise above or below it, clear of
 * the other open menus, measured as it is about to show.
 */
function placeFor(row: HTMLElement, label: string, rtl: boolean): TooltipPlace {
  const own = row.closest('[role="dialog"]') ?? row
  const others = [...document.querySelectorAll('[data-radix-popper-content-wrapper] > [role="dialog"]')].filter(
    (menu) => menu !== own,
  )
  return tooltipPlace({
    row: boxOf(row),
    size: tooltipSize(label),
    own: boxOf(own),
    others: others.map(boxOf),
    room: { width: document.documentElement.clientWidth, height: window.innerHeight },
    rtl,
  })
}

/** A tooltip's size with these words, measured on a hidden one. */
function tooltipSize(label: string) {
  const probe = document.createElement('div')
  probe.className = TOOLTIP
  probe.textContent = label
  Object.assign(probe.style, { position: 'fixed', left: '0', top: '0', visibility: 'hidden' })
  document.body.append(probe)
  const { width, height } = probe.getBoundingClientRect()
  probe.remove()
  return { width, height }
}

/**
 * Moves the focus through a menu's rows with the up and down arrows, round from the ends, and to
 * its first and last row with Home and End, as the app's other menus do. A key pressed in a field
 * of the menu, or in a menu beside one of its rows, is left to them.
 */
export function arrowThroughRows(event: KeyboardEvent<HTMLElement>) {
  if (!ROW_KEYS.includes(event.key) || event.defaultPrevented) return
  const rows = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button, :scope > [role="group"] > button'),
  ].filter((row) => !row.disabled && row.checkVisibility())
  const at = rows.indexOf(document.activeElement as HTMLButtonElement)
  if (at < 0) return
  const last = rows.length - 1
  const next = { ArrowDown: at >= last ? 0 : at + 1, ArrowUp: at <= 0 ? last : at - 1, Home: 0, End: last }[
    event.key as 'ArrowDown'
  ]
  event.preventDefault()
  rows[next]?.focus()
}

/**
 * A row of the menu that runs an action, its key at the end. While it has nothing to do it is
 * greyed, and says why in a tooltip under the pointer, on keyboard focus and on a tap, placed so it
 * covers no row of another open menu.
 */
export function MenuRow({
  action,
  label,
  keys,
  why,
  danger = false,
  caret = false,
  onRun,
}: {
  action: string
  label: string
  keys: string
  why: string | null
  danger?: boolean
  /** It stands for a row that opens a menu beside it. */
  caret?: boolean
  onRun?: () => void
}) {
  const [told, setTold] = useState(false)
  const rtl = dirOf(useLocale()) === 'rtl'
  const [place, setPlace] = useState<TooltipPlace>({ side: rtl ? 'left' : 'right', align: 'center' })
  const button = useRef<HTMLButtonElement>(null)
  /** Shows or hides why, placed clear of the other open menus as it shows. */
  const tell = (open: boolean) => {
    if (open && button.current && why) setPlace(placeFor(button.current, why, rtl))
    setTold(open)
  }
  const end = caret ? (
    <CaretRightIcon size={12} weight="bold" aria-hidden className="text-subtle rtl:-scale-x-100" />
  ) : (
    keys && <kbd className={MENU_KEY}>{keys}</kbd>
  )
  if (!why)
    return (
      <button type="button" data-action={action} onClick={onRun} className={cn(MENU_ITEM, danger && 'text-danger')}>
        {label}
        {end}
      </button>
    )
  return (
    <Tooltip label={why} side={place.side} align={place.align} open={told} onOpenChange={tell}>
      <button
        ref={button}
        type="button"
        data-action={action}
        aria-disabled="true"
        aria-description={why}
        // A tap shows why, as the pointer resting on it does.
        onClick={(event) => {
          event.preventDefault()
          tell(true)
        }}
        className={cn(MENU_ITEM, MENU_ITEM_GREYED, danger && 'text-danger')}
      >
        {label}
        {end}
      </button>
    </Tooltip>
  )
}
