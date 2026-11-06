'use client'

// A button greyed because it has nothing to do, and the tooltip that says why a greyed control has
// nothing to do, placed clear of every open menu's rows.
import { type ComponentProps, type MouseEvent, type PointerEvent, useRef, useState } from 'react'

import { MENU_ITEM_GREYED } from '@/components/ui/looks.ts'
import { TOOLTIP, Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { useLocale } from '@/lib/i18n/client.tsx'
import { dirOf } from '@/lib/i18n/index.ts'
import { usePhone } from '@/lib/phone.ts'
import { type Box, type TipScreen, type TooltipPlace, tooltipPlace } from '@/lib/tooltip-place.ts'

/** What a greyed control's tooltip keeps clear of: each open popover's content, the edit panel and the top bar. */
const HOLDERS =
  ':is([data-radix-popper-content-wrapper] > :is([role="dialog"], [role="menu"]), #edit-panel, [role="toolbar"])'

/** An element's box in the window. */
const boxOf = (el: Element): Box => {
  const { left, top, right, bottom } = el.getBoundingClientRect()
  return { left, top, right, bottom }
}

/** Hides the greyed control's tooltip that shows now, if one does. */
let shownTip: (() => void) | null = null

/**
 * A button greyed because it has nothing to do, in its own look (`className`): the not-allowed
 * pointer, it runs nothing, and it says `why` in a tooltip under the pointer, on keyboard focus and
 * on a tap (`useWhyTip`). It keeps the focus, so the keyboard still reaches it and hears why.
 */
export function GreyedButton({
  why,
  className,
  children,
  ...button
}: Omit<ComponentProps<'button'>, 'onClick' | 'ref' | 'type'> & { why: string }) {
  const tip = useWhyTip<HTMLButtonElement>(why)
  return (
    <Tooltip {...tip.tooltip}>
      <button
        {...button}
        ref={tip.ref}
        type="button"
        aria-disabled="true"
        aria-description={why}
        onClick={tip.tap}
        onPointerLeave={tip.leave}
        className={cn(className, MENU_ITEM_GREYED)}
      >
        {children}
      </button>
    </Tooltip>
  )
}

/**
 * The tooltip of a greyed control, saying `why` it has nothing to do: under the pointer, on
 * keyboard focus and on a tap or click, placed as it shows so it covers no row of any open menu
 * or control of the edit panel, its own menu's or panel's included, and on a phone just above the
 * control's menu, clear of the finger. The
 * ref and `tap` go on the control, and `tooltip` on the Tooltip around it.
 */
export function useWhyTip<T extends HTMLElement>(why: string | null) {
  const [told, setTold] = useState(false)
  const screen: TipScreen = { rtl: dirOf(useLocale()) === 'rtl', phone: usePhone() }
  const [place, setPlace] = useState<TooltipPlace>({ side: screen.rtl ? 'left' : 'right', align: 'center', offset: 8 })
  const ref = useRef<T>(null)
  /** Hides this one, as another greyed control's tooltip shows. */
  const hide = useRef(() => setTold(false))
  /** Shows or hides why, placed clear of every open menu's rows as it shows; one shows at a time. */
  const tell = (open: boolean) => {
    if (open && ref.current && why) setPlace(placeFor(ref.current, why, screen))
    if (open && shownTip !== hide.current) {
      shownTip?.()
      shownTip = hide.current
    }
    if (!open && shownTip === hide.current) shownTip = null
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
      plain: true,
    },
    /** Shows why, as a menu's greyed row does when picked by a tap, a click or a key. */
    show: () => tell(true),
    /** A tap or a click shows why, as the pointer resting on it does, and runs nothing. */
    tap: (event: MouseEvent) => {
      event.preventDefault()
      tell(true)
    },
    /** A mouse leaving the control hides why, a click's showing included; a finger lifting keeps it. */
    leave: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') tell(false)
    },
  }
}

/**
 * Where a row's tooltip goes: beside it when there is room, in the edit panel beside the panel level
 * with it, otherwise past the top or bottom of its menu (in the edit panel, of its grid), or on a
 * phone just above its menu or grid, clear of every row that shows in the open menus, measured as it
 * is about to show.
 */
function placeFor(row: HTMLElement, label: string, screen: TipScreen): TooltipPlace {
  // In the edit panel a control sits in a grid of its own (the numbers, Order, Line up): the
  // tooltip goes beside the panel level with the control, or past that grid near the control, rather
  // than past the whole panel.
  const panel = row.closest('#edit-panel')
  const own = (panel ? row.parentElement : row.closest('[role="dialog"], [role="menu"]')) ?? row
  const rows = [...document.querySelectorAll(`${HOLDERS} :is(button, [data-scrub])`)].filter((one) =>
    one.checkVisibility(),
  )
  return tooltipPlace({
    row: boxOf(row),
    size: tooltipSize(label),
    own: boxOf(own),
    rows: rows.map(boxOf),
    room: { width: document.documentElement.clientWidth, height: window.innerHeight },
    screen,
    ...(panel && { panel: boxOf(panel) }),
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
