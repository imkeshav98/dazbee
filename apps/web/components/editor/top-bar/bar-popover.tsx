'use client'

// One button of the bar by the selection and the popover it opens under it, or, for a pop-up the
// edit store names a sheet, at the bottom of a phone's screen. The bar keeps which one is open, so only one
// is open at a time. Also the hooks the editor's menus share: the focus as a
// popover opens and closes, Tab once into a toolbar, and a menu that shows it scrolls.
import { CaretDownIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { typingIn } from '@/components/editor/edit-panel/fields.tsx'
import { isSheet, useEditState, usePhone } from '@/components/editor/edit-store.ts'
import { BAR_BUTTON, POPOVER } from '@/components/editor/styles.ts'
import { useOverlayScroll } from '@/components/ui/overlay-scroll.ts'
import { fadedEdges, useScrollEdges } from '@/components/ui/scroll-edges.ts'
import { cn } from '@/lib/cn.ts'

/** The room between the bar's last row that shows and a popover under it, in pixels. */
const GAP = 8

/** The room between a sheet and the screen's edges on a phone, in pixels, as an edit panel's sheet keeps. */
const SHEET_EDGE = 8

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

/**
 * A menu that scrolls when it is longer than its room, and shows that it does: its overlay bar,
 * kept shown on a phone, and its cut edges faded. The ref goes on the scrolling element, and
 * `also` gets the element too.
 */
export function useScrollingMenu(also?: (element: HTMLDivElement | null) => void) {
  const phone = usePhone()
  const area = useRef<HTMLDivElement | null>(null)
  // A portal puts the menu in the page after its owner has rendered: the owner renders again once
  // it is there, so its edges are measured however the menu opened.
  const [, setShown] = useState<HTMLDivElement | null>(null)
  const bars = useOverlayScroll(area, { shown: phone })
  const edges = useScrollEdges(area)
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      also?.(element)
      setShown(element)
      const off = bars(element)
      return () => {
        off()
        also?.(null)
        setShown(null)
      }
    },
    [bars, also],
  )
  return { ref, onScroll: edges.measure, className: fadedEdges(edges) }
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
  caret = true,
  align = 'center',
  buttonRef,
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
  /** Whether the button shows ▾; a ⋯ that opens a menu of actions has none. */
  caret?: boolean
  /** Where the popover lines up under its button: its middle, or its end, as a menu of actions does. */
  align?: 'center' | 'end'
  /** Given the button, for a control that gives the focus back to it later. */
  buttonRef?: RefObject<HTMLButtonElement | null>
}) {
  const focus = useMenuFocus()
  const shown = open === id
  const phone = usePhone()
  // A sheet on a phone, as `isSheet` names it: the anchor is the screen's bottom edge, and Radix's
  // trigger width is the anchor's.
  const asSheet = phone && isSheet(id)
  // Measured as it opens, and again when the bar's bottom moves, as when its second row opens.
  const { barBottom } = useEditState()
  const [below, setBelow] = useState(GAP)
  useLayoutEffect(() => {
    if (shown) setBelow(offsetUnder(focus.button.current))
  }, [shown, barBottom, focus.button])
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
          aria-label={face ? label : undefined}
          title={face ? label : undefined}
          data-testid={`bar-${testId}`}
          className={BAR_BUTTON}
        >
          {icon}
          {face ?? label}
          {caret && <CaretDownIcon size={10} weight="bold" aria-hidden className="text-subtle" />}
        </button>
      </Popover.Trigger>
      {asSheet && <Popover.Anchor virtualRef={SCREEN_BOTTOM} />}
      <Popover.Portal>
        <Popover.Content
          side={asSheet ? 'top' : 'bottom'}
          align={asSheet ? 'center' : align}
          sideOffset={asSheet ? 0 : below}
          collisionPadding={asSheet ? SHEET_EDGE : 12}
          {...focus.content}
          // A number field being typed in takes Esc first, throwing away what was typed; the next
          // Esc closes the popover.
          onEscapeKeyDown={(event) => typingIn(document.activeElement) && event.preventDefault()}
          aria-label={label}
          data-testid={`bar-${testId}-menu`}
          data-sheet={asSheet || undefined}
          className={cn(
            POPOVER,
            'flex flex-col p-1.5',
            asSheet
              ? 'max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-[22px]'
              : (className ?? 'min-w-56'),
          )}
        >
          {focus.back}
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
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
