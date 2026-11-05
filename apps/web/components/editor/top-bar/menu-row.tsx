'use client'

// A row of the editor's menus that runs an action, its key at its end, greyed with the reason in a
// tooltip while it has nothing to do, as every menu's greyed rows are; and the tooltip that says why
// a greyed control has nothing to do.
import { CaretRightIcon } from '@phosphor-icons/react'
import { type MouseEvent, useRef, useState } from 'react'

import { usePhone } from '@/components/editor/edit-store.ts'
import { MENU_ITEM, MENU_ITEM_GREYED, MENU_KEY } from '@/components/editor/styles.ts'
import { TOOLTIP, Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { type Box, type TooltipPlace, tooltipPlace } from '@/lib/editor/tooltip-place.ts'
import { useLocale } from '@/lib/i18n/client.tsx'
import { dirOf } from '@/lib/i18n/index.ts'

/** The open menus: each popover's content. */
const MENUS = '[data-radix-popper-content-wrapper] > [role="dialog"]'

/** An element's box in the window. */
const boxOf = (el: Element): Box => {
  const { left, top, right, bottom } = el.getBoundingClientRect()
  return { left, top, right, bottom }
}

/**
 * A row of a menu that runs an action, ending in its key, or in a caret when it stands for a row
 * that opens a menu beside it. While it has nothing to do (`why`) it is greyed with the not-allowed
 * pointer, runs and opens nothing, and says why in a tooltip (`useWhyTip`); it keeps the focus, so
 * the keyboard still reaches it and hears why.
 */
export function MenuRow({
  action,
  testId,
  label,
  keys = '',
  why,
  danger = false,
  caret = false,
  onRun,
}: {
  /** The editor action it runs, as its `data-action`. */
  action?: string
  testId?: string
  label: string
  keys?: string
  why: string | null
  danger?: boolean
  /** It stands for a row that opens a menu beside it. */
  caret?: boolean
  onRun?: () => void
}) {
  const tip = useWhyTip<HTMLButtonElement>(why)
  const end = caret ? (
    <CaretRightIcon size={12} weight="bold" aria-hidden className="text-subtle rtl:-scale-x-100" />
  ) : (
    keys && <kbd className={MENU_KEY}>{keys}</kbd>
  )
  if (!why)
    return (
      <button
        type="button"
        data-action={action}
        data-testid={testId}
        onClick={onRun}
        className={cn(MENU_ITEM, danger && 'text-danger')}
      >
        {label}
        {end}
      </button>
    )
  return (
    <Tooltip {...tip.tooltip}>
      <button
        ref={tip.ref}
        type="button"
        data-action={action}
        data-testid={testId}
        aria-disabled="true"
        aria-description={why}
        onClick={tip.tap}
        className={cn(MENU_ITEM, MENU_ITEM_GREYED, danger && 'text-danger')}
      >
        {label}
        {end}
      </button>
    </Tooltip>
  )
}

/**
 * The tooltip of a greyed control, saying `why` it has nothing to do: under the pointer, on
 * keyboard focus and on a tap or click, placed as it shows so it covers no row of any open menu,
 * its own menu's included, and on a phone just above the control's menu, clear of the finger. The
 * ref and `tap` go on the control, and `tooltip` on the Tooltip around it.
 */
export function useWhyTip<T extends HTMLElement>(why: string | null) {
  const [told, setTold] = useState(false)
  const rtl = dirOf(useLocale()) === 'rtl'
  const phone = usePhone()
  const [place, setPlace] = useState<TooltipPlace>({ side: rtl ? 'left' : 'right', align: 'center', offset: 8 })
  const ref = useRef<T>(null)
  /** Shows or hides why, placed clear of every open menu's rows as it shows. */
  const tell = (open: boolean) => {
    if (open && ref.current && why) setPlace(placeFor(ref.current, why, rtl, phone))
    setTold(open)
  }
  return {
    ref,
    tooltip: {
      label: why ?? '',
      side: place.side,
      align: place.align,
      sideOffset: place.offset,
      open: told,
      onOpenChange: tell,
    },
    /** A tap or a click shows why, as the pointer resting on it does, and runs nothing. */
    tap: (event: MouseEvent) => {
      event.preventDefault()
      tell(true)
    },
  }
}

/**
 * Where a row's tooltip goes: beside it when there is room, otherwise past the top or bottom of its
 * menu, or on a phone just above its menu, clear of every row that shows in the open menus, measured
 * as it is about to show.
 */
function placeFor(row: HTMLElement, label: string, rtl: boolean, phone: boolean): TooltipPlace {
  const own = row.closest('[role="dialog"]') ?? row
  const rows = [...document.querySelectorAll(`${MENUS} :is(button, [data-scrub])`)].filter((one) =>
    one.checkVisibility(),
  )
  return tooltipPlace({
    row: boxOf(row),
    size: tooltipSize(label),
    own: boxOf(own),
    rows: rows.map(boxOf),
    room: { width: document.documentElement.clientWidth, height: window.innerHeight },
    rtl,
    phone,
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
