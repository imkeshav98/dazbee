'use client'

// One button of the bar by the selection and the popover it opens under it, or, for a pop-up the
// edit store names a sheet, at the bottom of a phone's screen. The bar keeps which one is open, so
// only one is open at a time. Also what the editor's pop-ups share: the sheet a phone shows a pop-up
// as, the focus as a popover opens and closes, the arrows along a toolbar, Tab once into a toolbar,
// and how far under the bar a pop-up hangs.
import { CaretDownIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { typingIn } from '@/components/editor/edit-panel/fields.tsx'
import { isSheet, type PanelId, useEditState } from '@/components/editor/edit-store.ts'
import { BAR_BUTTON } from '@/components/editor/styles.ts'
import { POPOVER } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { usePhone } from '@/lib/phone.ts'

/**
 * The room between a sheet and the screen's edges on a phone, in pixels: an edit panel's sheet
 * keeps 0.5rem, which is 7 px at the 14 px root.
 */
export const SHEET_EDGE = 7

/**
 * Where a popover shown as a phone's sheet lies, for its content: above the screen's bottom edge
 * (`SheetAnchor`), as wide as the screen less SHEET_EDGE each side, SHEET_EDGE from every edge.
 */
export const SHEET_PLACE = {
  side: 'top',
  align: 'center',
  sideOffset: 0,
  collisionPadding: SHEET_EDGE,
  'data-sheet': true,
} as const
/** A sheet's look: as wide as its anchor, as tall as what it holds up to its room, scrolling past that. */
export const SHEET_LOOK =
  'max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-[22px]'

/** The room between the bar's last row that shows and a popover under it, in pixels. */
const GAP = 8

const nowhere = () => document.activeElement === null || document.activeElement === document.body

/**
 * Where a sheet hangs from on a phone: a line along the screen's bottom edge, SHEET_EDGE in from
 * each side and from the bottom, so a popover above it spans the screen's width.
 */
const SCREEN_BOTTOM = {
  current: {
    getBoundingClientRect: () => {
      const width = document.documentElement.clientWidth
      const bottom = window.innerHeight - SHEET_EDGE
      return DOMRect.fromRect({ x: SHEET_EDGE, y: bottom, width: width - SHEET_EDGE * 2, height: 0 })
    },
  },
}

/**
 * How far under its button a popover hangs to clear the whole bar: GAP under the bar's last row
 * that shows, which is its second row when that is open, even when the button is in the first row
 * or on the first line of a second row that wraps.
 */
function offsetUnder(button: HTMLElement | null) {
  const bar = button?.closest('[role="toolbar"]')
  if (!button || !bar) return GAP
  const rows = [...bar.children].filter((row) => row.checkVisibility({ visibilityProperty: true }))
  const end = Math.max(...rows.map((row) => row.getBoundingClientRect().bottom))
  return Math.max(GAP, Math.round(end - button.getBoundingClientRect().bottom) + GAP)
}

/** A toolbar's buttons that can be used and show, in order: a closed second row's are left out. */
const itemsOf = (bar: HTMLElement) =>
  [...bar.querySelectorAll<HTMLElement>('[data-bar-item]:not(:disabled)')].filter((item) =>
    item.checkVisibility({ visibilityProperty: true }),
  )

/** Moves focus along a toolbar's buttons with the arrow keys, Home and End. */
export function arrowAlong(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
  const items = itemsOf(event.currentTarget)
  const at = items.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  event.preventDefault()
  const forward = (event.key === 'ArrowRight') !== (getComputedStyle(event.currentTarget).direction === 'rtl')
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (at + (forward ? 1 : -1) + items.length) % items.length
  items[next]?.focus()
}

/**
 * How a popover gives the focus back to its button as it closes. It goes back as the popover leaves
 * the page, so a key or click straight after acts from the button and not from the page; a field
 * that had the focus is gone by then, so it never loses the focus and saves what was typed. Radix
 * gives it back again a moment later; that is skipped once the focus is somewhere, such as in a
 * menu opened since, which the focus leaving would close. `back` goes inside the popover's content.
 */
export function useMenuFocus() {
  const button = useRef<HTMLButtonElement>(null)
  const outside = useRef(false)
  const content = {
    // A pop-up takes the focus as it opens, as a menu does. When its first control is a field to
    // type in, the pop-up itself takes it: a click to open never leaves a field typing, and on a
    // phone never brings the keyboard up. Tab goes on to the field.
    onOpenAutoFocus: (event: Event) => {
      const into = event.currentTarget
      if (!(into instanceof HTMLElement)) return
      const first = into.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea, select, [href], [tabindex]:not([tabindex="-1"])',
      )
      if (first?.tagName !== 'INPUT' && first?.tagName !== 'TEXTAREA') return
      event.preventDefault()
      into.focus({ preventScroll: true })
    },
    onInteractOutside: () => {
      outside.current = true
    },
    onCloseAutoFocus: (event: Event) => {
      if (!nowhere()) event.preventDefault()
    },
  }
  return { button, content, back: <FocusBack button={button} outside={outside} /> }
}

/**
 * How far under its button (`button`) a pop-up of the bar hangs while it shows, to clear the whole
 * bar (`offsetUnder`): measured as it opens, and again when the bar's bottom moves, as when its
 * second row opens.
 */
export function useUnderBar(button: RefObject<HTMLElement | null>, shown: boolean) {
  const { barBottom } = useEditState()
  const [below, setBelow] = useState(GAP)
  useLayoutEffect(() => {
    if (shown) setBelow(offsetUnder(button.current))
  }, [shown, barBottom, button])
  return below
}

/**
 * Lets Tab reach a toolbar once, at the button last focused, as a toolbar should; the arrows move
 * along it. Returns the focus handler to put on the toolbar.
 */
export function useRovingTab(bar: HTMLElement | null) {
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    if (!bar) return
    const items = itemsOf(bar)
    const at = Math.min(current, items.length - 1)
    items.forEach((item, i) => {
      item.tabIndex = i === at ? 0 : -1
    })
  })
  return (event: FocusEvent<HTMLElement>) => {
    if (!(event.currentTarget instanceof HTMLElement)) return
    const at = itemsOf(event.currentTarget).indexOf(event.target as HTMLElement)
    if (at >= 0) setCurrent(at)
  }
}

export function BarPopover({
  id,
  open,
  onOpen,
  label,
  face,
  icon,
  children,
  testId,
  className,
  align = 'center',
  buttonRef,
  opens,
  on = false,
}: {
  id: string
  open: string | null
  onOpen: (id: string | null) => void
  /** The button's name, and its words when it has no face of its own. */
  label: string
  /** What the button shows instead of its name, such as the font or the size. */
  face?: ReactNode
  icon?: ReactNode
  children: ReactNode
  testId: string
  className?: string
  /** Where the popover lines up under its button: its middle, or its end. */
  align?: 'center' | 'end'
  /** Given the button, for a control that gives the focus back to it later. */
  buttonRef?: RefObject<HTMLButtonElement | null>
  /** The edit panel a row of the popover opens, which gives the focus back to the button as it closes. */
  opens?: PanelId
  /** Something it sets is on, so its button takes the pink tint a pressed toggle has. */
  on?: boolean
}) {
  const focus = useMenuFocus()
  const shown = open === id
  const phone = usePhone()
  // On a phone a button with an icon shows it alone, named by its label, so the bar keeps to two rows.
  const bare = phone && icon !== undefined && face === undefined
  // A sheet on a phone, as `isSheet` names it: the anchor is the screen's bottom edge, and Radix's
  // trigger width is the anchor's.
  const asSheet = phone && isSheet(id)
  const below = useUnderBar(focus.button, shown)
  return (
    <Popover.Root open={shown} onOpenChange={(to) => onOpen(to ? id : null)}>
      <Popover.Trigger asChild>
        <button
          ref={(button) => {
            focus.button.current = button
            if (buttonRef) buttonRef.current = button
          }}
          type="button"
          data-bar-item
          aria-label={face || bare ? label : undefined}
          title={face || bare ? label : undefined}
          data-testid={`bar-${testId}`}
          data-opens={opens}
          data-on={on || undefined}
          className={cn(BAR_BUTTON, 'data-on:bg-accent-soft')}
        >
          {icon}
          {face ?? (bare ? null : label)}
          <CaretDownIcon size={10} weight="bold" aria-hidden className="text-subtle" />
        </button>
      </Popover.Trigger>
      {asSheet && <SheetAnchor />}
      <Popover.Portal>
        <Popover.Content
          {...(asSheet ? SHEET_PLACE : { side: 'bottom', align, sideOffset: below, collisionPadding: 12 })}
          {...focus.content}
          // A number field being typed in takes Esc first, throwing away what was typed; the next
          // Esc closes the popover.
          onEscapeKeyDown={(event) => {
            if (typingIn(document.activeElement)) event.preventDefault()
          }}
          aria-label={label}
          data-testid={`bar-${testId}-menu`}
          className={cn(POPOVER, 'flex flex-col p-1.5', asSheet ? SHEET_LOOK : (className ?? 'min-w-56'))}
        >
          {focus.back}
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * A popover's anchor while it shows as a phone's sheet (`SHEET_PLACE`, `SHEET_LOOK`): the screen's
 * bottom edge. It goes in the popover's root in place of any other anchor.
 */
export function SheetAnchor() {
  return <Popover.Anchor virtualRef={SCREEN_BOTTOM} />
}

/**
 * Inside a popover: once it is gone from the page, puts the focus back on its button, unless the
 * popover closed from a press or focus outside it, or the focus is already somewhere.
 */
function FocusBack({ button, outside }: { button: RefObject<HTMLButtonElement | null>; outside: RefObject<boolean> }) {
  useEffect(() => {
    outside.current = false
    return () => {
      if (!outside.current && nowhere()) button.current?.focus()
    }
  }, [button, outside])
  return null
}
