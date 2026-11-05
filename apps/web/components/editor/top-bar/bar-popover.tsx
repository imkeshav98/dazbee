'use client'

// One button of the bar by the selection and the popover it opens under it, or, for a pop-up the
// edit store names a sheet, at the bottom of a phone's screen. The bar keeps which one is open, so
// only one is open at a time. Also what the editor's menus share: the sheet a phone shows a menu as,
// the focus as a popover opens and closes, the arrows along a toolbar and through a menu's rows, Tab
// once into a toolbar, Esc going back from a row's short menu shown in its menu's place, and a menu
// that shows it scrolls.
import { CaretDownIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import {
  createContext,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { typingIn } from '@/components/editor/edit-panel/fields.tsx'
import { isSheet, type PanelId, useEditState, usePhone } from '@/components/editor/edit-store.ts'
import { BAR_BUTTON, POPOVER } from '@/components/editor/styles.ts'
import { useOverlayScroll } from '@/components/ui/overlay-scroll.ts'
import { fadedEdges, linedEdges, useScrollEdges } from '@/components/ui/scroll-edges.ts'
import { cn } from '@/lib/cn.ts'

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

/** Where each key moves the focus in a menu, from the row at `i` of rows up to `last`. */
const STEPS = {
  ArrowDown: (i: number, last: number) => (i >= last ? 0 : i + 1),
  ArrowUp: (i: number, last: number) => (i <= 0 ? last : i - 1),
  Home: () => 0,
  End: (_: number, last: number) => last,
}

const nowhere = () => document.activeElement === null || document.activeElement === document.body

/**
 * The way back from the row's short menu that shows in its menu's place, kept for the menu that
 * holds it: null while none shows.
 */
const BackInPlace = createContext<RefObject<(() => void) | null> | null>(null)

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
 * Moves the focus between a menu's rows with the up and down arrows, wrapping round at the ends,
 * and Home and End: its buttons that show, greyed ones too. A field keeps its own keys, its arrows
 * stepping its value; Tab reaches it. Goes on the content of every menu of the editor (the full
 * menu, the right-click menu, Arrange ⋯, a picked frame's ⋯ and each menu beside one of their
 * rows); a menu opened beside a row, drawn elsewhere in the page, moves through its own rows.
 */
export function arrowThrough(event: KeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || !(event.key in STEPS)) return
  const at = document.activeElement
  if (!(at instanceof HTMLButtonElement) || !event.currentTarget.contains(at)) return
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')].filter((row) =>
    row.checkVisibility({ visibilityProperty: true }),
  )
  const i = rows.indexOf(at)
  if (i < 0) return
  event.preventDefault()
  rows[STEPS[event.key as keyof typeof STEPS](i, rows.length - 1)]?.focus()
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
 * Lets Esc go back from a row's short menu shown in the menu's place (SubMenu, on a phone) before it
 * closes the menu, through Radix's own layers: `onEscapeKeyDown` goes on the menu's content and
 * `rows` round its rows. A greyed row's tooltip that shows is a layer over the menu, so Radix gives
 * it Esc first and it closes. The Esc that goes back goes no further: going back takes the focused
 * row out of the page, and the stage would take an Esc from outside a menu as its own and let the
 * selection go, closing the menu with it.
 */
export function useEscapeBack() {
  const back = useRef<(() => void) | null>(null)
  const onEscapeKeyDown = useCallback((event: globalThis.KeyboardEvent) => {
    if (!back.current) return
    event.preventDefault()
    event.stopPropagation()
    back.current()
  }, [])
  const rows = useCallback((children: ReactNode) => <BackInPlace value={back}>{children}</BackInPlace>, [])
  return { onEscapeKeyDown, rows }
}

/** Keeps `goBack` as the way back Esc takes in the menu this short menu shows in the place of, while it shows. */
export function useBackInPlace(goBack: () => void) {
  const back = useContext(BackInPlace)
  useEffect(() => {
    if (!back) return
    back.current = goBack
    return () => {
      if (back.current === goBack) back.current = null
    }
  }, [back, goBack])
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
 * kept shown on a phone, and its cut edges faded, or on a phone lined, so a cut row never reads as
 * a greyed one. The ref goes on the scrolling element, and `also` gets the element too.
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
  return { ref, onScroll: edges.measure, className: phone ? linedEdges(edges) : fadedEdges(edges) }
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
  menu = false,
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
  /**
   * Whether it is a ⋯ that opens a menu of actions: its button shows no ▾, and the arrows, Home and
   * End move between the menu's rows.
   */
  menu?: boolean
  /** Where the popover lines up under its button: its middle, or its end, as a menu of actions does. */
  align?: 'center' | 'end'
  /** Given the button, for a control that gives the focus back to it later. */
  buttonRef?: RefObject<HTMLButtonElement | null>
  /** The edit panel a row of the popover opens, which gives the focus back to the button as it closes. */
  opens?: PanelId
  /** Something it sets is on, so its button takes the pink tint a pressed toggle has. */
  on?: boolean
}) {
  const focus = useMenuFocus()
  const escape = useEscapeBack()
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
          data-opens={opens}
          data-on={on || undefined}
          className={cn(BAR_BUTTON, 'data-on:bg-accent-soft')}
        >
          {icon}
          {face ?? label}
          {!menu && <CaretDownIcon size={10} weight="bold" aria-hidden className="text-subtle" />}
        </button>
      </Popover.Trigger>
      {asSheet && <SheetAnchor />}
      <Popover.Portal>
        <Popover.Content
          {...(asSheet ? SHEET_PLACE : { side: 'bottom', align, sideOffset: below, collisionPadding: 12 })}
          {...focus.content}
          // A number field being typed in takes Esc first, throwing away what was typed; the next
          // Esc goes back from a row's short menu shown in its place, then closes the popover.
          onEscapeKeyDown={(event) =>
            typingIn(document.activeElement) ? event.preventDefault() : escape.onEscapeKeyDown(event)
          }
          onKeyDown={menu ? arrowThrough : undefined}
          aria-label={label}
          data-testid={`bar-${testId}-menu`}
          data-menu={menu || undefined}
          className={cn(POPOVER, 'flex flex-col p-1.5', asSheet ? SHEET_LOOK : (className ?? 'min-w-56'))}
        >
          {focus.back}
          {escape.rows(children)}
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
