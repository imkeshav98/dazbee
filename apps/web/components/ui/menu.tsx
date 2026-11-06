'use client'
/* eslint-disable max-lines -- one deep module: every menu's keys, focus, greyed rows, submenus and phone sheet, written once */

// The one menu every menu of the app is built on, over Radix's menus: a menu under its button
// (`Menu`) or at a right-click (`RightClickMenu`), its rows (`MenuItem`, `MenuCheck`, `MenuRadio`),
// a row that opens a menu beside it (`MenuSub`), and its lines and headings. Radix gives the arrows
// round from the ends, Home, End, typing to jump, the focus and Esc; this adds the app's look (smooth
// glass, tinted hover, no row outlines, rows 44 px on a phone, keys shown beside rows except on a
// phone), a greyed row that stays in the arrow order and says why in a tooltip beside it, the menu as
// a sheet along a phone's bottom edge, a row's menu shown in the menu's place there under a back row,
// and the app's direction, so all of it mirrors in Arabic.
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  createContext,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'

import { useWhyTip } from '@/components/ui/greyed.tsx'
import { MENU, MENU_DIVIDER, MENU_HEADING, MENU_ITEM, MENU_ITEM_GREYED, MENU_KEY } from '@/components/ui/looks.ts'
import { useOverlayScroll } from '@/components/ui/overlay-scroll.ts'
import { fadedEdges, linedEdges, useScrollEdges } from '@/components/ui/scroll-edges.ts'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { holdHover } from '@/lib/hover-hold.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf, format } from '@/lib/i18n/index.ts'
import { usePhone } from '@/lib/phone.ts'

/** Where a menu under its button opens, as Radix places it, while it is no phone's sheet. */
export interface MenuPlace {
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  alignOffset?: number
  collisionPadding?: number | Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>
  sticky?: 'partial' | 'always'
}

/** Radix's parts a menu is drawn with: a dropdown's under a button, or a context menu's at a right-click. */
type Parts = typeof DropdownMenu | typeof ContextMenu

/** What a menu's rows share with it. */
interface Shared {
  parts: Parts
  /** It shows as a phone's sheet, where a row's menu opens in the menu's place. */
  sheet: boolean
  /** The way back from the row's menu shown in this menu's place, which Esc takes; null while none shows. */
  back: RefObject<(() => void) | null>
}

/** The width of a menu beside a row whose rows have long keys, as the mock draws Copy to other frames ▸. */
export const WIDE_MENU = 258

/**
 * A menu shown as a phone's sheet: as wide as the screen less 7 px each side, as tall as what it holds
 * up to the screen's height less those 7 px top and bottom, scrolling past that. Its place along the
 * screen's bottom edge is app/globals.css's, for whatever Radix placed it by.
 */
const SHEET = 'w-full max-h-[calc(100dvh-14px)] overflow-y-auto rounded-[22px]'
/** A menu's room by its button or right-click, as Radix measures it, scrolling past that. */
const ROOM = {
  dropdown: 'max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto',
  context: 'max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto',
}

const SharedContext = createContext<Shared | null>(null)

/** The row the last press started on, or null when it started anywhere else. */
let pressedRow: EventTarget | null = null
/** Whether the last press was a key's rather than a pointer's, so a control focused now is reached by keyboard. */
let keyed = false
/** Whether the page tells `keyed` each press yet. */
let watching = false

/**
 * A row's pointer handlers so that only a press that starts on the row runs it. Radix also runs the
 * row a pointer is let go over after a press elsewhere, and a phone sends a tap's click to what lies
 * under the finger once the tap ends: either way the press that opened a menu would run the row
 * the menu put under it, as on a phone, where the sheet covers its button. A click the keyboard
 * makes (Enter on a row) comes from no press, and runs.
 */
const PRESS = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => {
    pressedRow = event.currentTarget
  },
  onPointerUp: (event: PointerEvent<HTMLElement>) => {
    if (pressedRow !== event.currentTarget) event.preventDefault()
  },
  onClick: (event: MouseEvent<HTMLElement>) => {
    if (event.detail > 0 && pressedRow !== event.currentTarget) event.preventDefault()
  },
}

/** Whether nothing has the focus, as when the focused row of a menu that closed has left the page. */
const nowhere = () => document.activeElement === null || document.activeElement === document.body

/** The caret at the end of a row that opens a menu, pointing to the page's end. */
const caret = <CaretRightIcon size={12} weight="bold" aria-hidden className="text-subtle rtl:-scale-x-100" />

/**
 * A menu that scrolls when it is longer than its room, and shows that it does: its overlay bar,
 * kept shown on a phone, and its cut edges faded, or on a phone lined, so a cut row never reads as
 * a greyed one. The ref goes on the scrolling element, and `also` gets the element too.
 */
function useScrollingMenu(also?: (element: HTMLDivElement | null) => void) {
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

/** What the rows of the menu they are in share with it. */
function useShared() {
  const shared = useContext(SharedContext)
  if (!shared) throw new Error('a menu row outside a menu')
  return shared
}

/**
 * Has the page tell `keyed` whether each press is a key's or a pointer's, and forget `pressedRow` as
 * each press starts, from the first menu on.
 */
function useWatchKeys() {
  useEffect(() => {
    if (watching) return
    watching = true
    // The page's mark says the same, so a menu's rows ring only for the keyboard (app/globals.css).
    const press = (byKey: boolean) => {
      keyed = byKey
      document.documentElement.dataset.input = byKey ? 'key' : 'pointer'
    }
    window.addEventListener('keydown', () => press(true), true)
    window.addEventListener(
      'pointerdown',
      () => {
        press(false)
        pressedRow = null
      },
      true,
    )
  }, [])
}

/** The arrow key towards the page's end, which opens a row's menu, and the one back. */
function useArrows() {
  return dirOf(useLocale()) === 'rtl'
    ? { toward: 'ArrowLeft', back: 'ArrowRight' }
    : { toward: 'ArrowRight', back: 'ArrowLeft' }
}

/**
 * A menu under its button (`trigger`, a button element), opened and closed by its owner. With
 * `sheet` it shows on a phone as a sheet along the screen's bottom edge; elsewhere, and on a phone
 * without it, where `place` says.
 */
export function Menu({
  trigger,
  open,
  onOpenChange,
  label,
  testId,
  sheet = false,
  place,
  tooltip,
  className,
  children,
}: {
  trigger: ReactElement
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  testId?: string
  sheet?: boolean
  place?: MenuPlace
  /** A tooltip its button shows on hover and keyboard focus, naming it. */
  tooltip?: string
  /** Its width, and any look of its own, while it is no sheet. */
  className?: string
  children: ReactNode
}) {
  const dir = dirOf(useLocale())
  const button = useRef<HTMLButtonElement>(null)
  // Whether its button was reached by keyboard, as Space presses only such a button; reached by a
  // pointer, Space is the stage's, to pan.
  const byKey = useRef(false)
  useWatchKeys()
  const opener = (
    <DropdownMenu.Trigger
      asChild
      ref={button}
      onFocus={() => {
        byKey.current = keyed
      }}
      onKeyDown={(event) => {
        if (event.key === ' ' && !byKey.current) event.preventDefault()
      }}
    >
      {trigger}
    </DropdownMenu.Trigger>
  )
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} dir={dir} modal={false}>
      {tooltip ? <Tooltip label={tooltip}>{opener}</Tooltip> : opener}
      <MenuContent
        parts={DropdownMenu}
        button={button}
        label={label}
        testId={testId}
        sheet={sheet}
        place={place}
        className={className}
      >
        {children}
      </MenuContent>
    </DropdownMenu.Root>
  )
}

/**
 * A menu at a right-click on `area` (an element), opened by Radix as the right-click lands unless the
 * area's own `onContextMenu` prevents it, and closed by its owner. A press-and-hold opens it only as
 * the owner says, through `onOpenChange`. With `sheet` it shows on a phone as a sheet.
 */
export function RightClickMenu({
  area,
  open,
  onOpenChange,
  label,
  testId,
  sheet = false,
  place,
  className,
  children,
}: {
  area: ReactElement
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  testId?: string
  sheet?: boolean
  place?: Pick<MenuPlace, 'collisionPadding' | 'sticky' | 'alignOffset'>
  className?: string
  children: ReactNode
}) {
  const dir = dirOf(useLocale())
  return (
    <ContextMenu.Root open={open} onOpenChange={onOpenChange} dir={dir} modal={false}>
      <ContextMenu.Trigger asChild>{area}</ContextMenu.Trigger>
      <MenuContent parts={ContextMenu} label={label} testId={testId} sheet={sheet} place={place} className={className}>
        {children}
      </MenuContent>
    </ContextMenu.Root>
  )
}

/**
 * A row of a menu that runs `onSelect` and closes the menu, unless `keepOpen`; its key (`keys`) at
 * its end, or a caret for a row that stands for one opening a menu. While it has nothing to do
 * (`why`) it is greyed, runs nothing and stays in the arrow order, and says why in a tooltip beside
 * it on hover, keyboard focus and a tap.
 */
export function MenuItem({
  label,
  keys,
  why = null,
  danger = false,
  caret: withCaret = false,
  keepOpen = false,
  checked,
  action,
  testId,
  onSelect,
  className,
  look = MENU_ITEM,
  children,
}: {
  /** Its words, which typing jumps to, and what it shows unless given `children`. */
  label: string
  keys?: string
  why?: string | null
  danger?: boolean
  caret?: boolean
  keepOpen?: boolean
  /** Whether what it turns on is on, for a row that turns something on or off. */
  checked?: boolean
  /** The action it runs, as its `data-action`. */
  action?: string
  testId?: string
  onSelect?: () => void
  /** Its own look over a row's. */
  className?: string
  /** A look of its own in place of a row's, for a menu drawn its own way, as Share's. */
  look?: string
  /** What it shows in place of its words and key, as an icon before them. */
  children?: ReactNode
}) {
  const { parts } = useShared()
  const tip = useWhyTip<HTMLButtonElement>(why)
  const end = withCaret ? caret : keys ? <kbd className={MENU_KEY}>{keys}</kbd> : null
  const row = (
    <parts.Item
      asChild
      textValue={label}
      onSelect={(event) => {
        if (why) {
          event.preventDefault()
          tip.show()
          return
        }
        if (keepOpen) event.preventDefault()
        onSelect?.()
      }}
    >
      <button
        ref={tip.ref}
        type="button"
        data-action={action}
        data-testid={testId}
        {...(checked === undefined ? {} : { role: 'menuitemcheckbox', 'aria-checked': checked })}
        aria-disabled={why ? 'true' : undefined}
        aria-description={why ?? undefined}
        {...PRESS}
        onPointerLeave={why ? tip.leave : undefined}
        className={cn(look, danger && 'text-danger', className, why && MENU_ITEM_GREYED)}
      >
        {children ?? (
          <>
            {label}
            {end}
          </>
        )}
      </button>
    </parts.Item>
  )
  return why ? <Tooltip {...tip.tooltip}>{row}</Tooltip> : row
}

/** A row that turns something on or off and keeps the menu open: `mark` shows whether it is on. */
export function MenuCheck({
  label,
  keys,
  checked,
  onCheckedChange,
  mark,
}: {
  label: string
  keys?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  mark: ReactNode
}) {
  const { parts } = useShared()
  return (
    <parts.CheckboxItem
      asChild
      textValue={label}
      checked={checked}
      onCheckedChange={onCheckedChange}
      onSelect={(event) => event.preventDefault()}
    >
      <button type="button" {...PRESS} className={MENU_ITEM}>
        {label}
        {keys && <kbd className={cn(MENU_KEY, 'ms-auto me-2')}>{keys}</kbd>}
        {mark}
      </button>
    </parts.CheckboxItem>
  )
}

/** Rows of which one is picked (`MenuRadio`), `value` the picked one's. */
export function MenuRadios({
  value,
  onValueChange,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
}) {
  const { parts } = useShared()
  return (
    <parts.RadioGroup value={value} onValueChange={onValueChange}>
      {children}
    </parts.RadioGroup>
  )
}

/**
 * One of `MenuRadios`' rows, picked when its `value` is theirs, in a row's look or its own
 * (`className`); the menu opens with the focus on the picked one.
 */
export function MenuRadio({
  value,
  label,
  className,
  children,
  ...rest
}: {
  value: string
  label: string
  className?: string
  children: ReactNode
} & Record<`data-${string}`, string>) {
  const { parts } = useShared()
  return (
    <parts.RadioItem asChild value={value} textValue={label}>
      <button type="button" {...rest} {...PRESS} className={className ?? MENU_ITEM}>
        {children}
      </button>
    </parts.RadioItem>
  )
}

/** The hairline between a menu's groups of rows. */
export function MenuDivider() {
  const { parts } = useShared()
  return <parts.Separator className={MENU_DIVIDER} />
}

/** A short line over a menu's rows saying what they act on, or a heading of its own look (`className`). */
export function MenuHeading({ className, children }: { className?: string; children: ReactNode }) {
  const { parts } = useShared()
  return <parts.Label className={className ?? MENU_HEADING}>{children}</parts.Label>
}

/**
 * A row that opens a menu beside it on tablet and desktop, by the pointer, Enter or the arrow towards
 * it, lit while the menu shows; the arrow back and Esc close it, back onto the row. In a phone's
 * sheet the menu opens in the sheet's place instead, under a back row naming the row
 * (`SubInPlace`). Its test id names the row, and `<testId>-menu` its menu.
 */
export function MenuSub({
  label,
  testId,
  heading,
  wide = false,
  children,
}: {
  label: string
  testId: string
  /** A short line over its rows saying what they act on. */
  heading?: string
  /** As wide as the mock draws a menu whose rows have long keys. */
  wide?: boolean
  children: ReactNode
}) {
  const { parts, sheet } = useShared()
  const [open, setOpen] = useState(false)
  const row = useRef<HTMLButtonElement>(null)
  const rows = (
    <>
      {heading && <MenuHeading>{heading}</MenuHeading>}
      {children}
    </>
  )
  if (sheet)
    return (
      <SubInPlace label={label} testId={testId}>
        {rows}
      </SubInPlace>
    )
  return (
    <parts.Sub open={open} onOpenChange={setOpen}>
      <parts.SubTrigger asChild textValue={label}>
        <button
          ref={row}
          type="button"
          data-testid={testId}
          {...PRESS}
          className={cn(MENU_ITEM, 'data-[state=open]:bg-hover data-[state=open]:lit')}
        >
          {label}
          {caret}
        </button>
      </parts.SubTrigger>
      <parts.Portal>
        <parts.SubContent
          sideOffset={8}
          collisionPadding={12}
          loop
          aria-label={label}
          data-testid={`${testId}-menu`}
          // The pointer leaving both menus gives the focus to the menu it is beside, which keeps this
          // one open; the focus moving to another row closes it.
          onFocusOutside={(event) => {
            if (event.target === row.current?.closest('[role="menu"]')) event.preventDefault()
          }}
          // Esc closes this menu alone, back onto its row, and goes no further; the next closes the
          // menu it is beside.
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
            row.current?.focus()
          }}
          style={wide ? { width: WIDE_MENU } : undefined}
          className={cn(MENU, !wide && 'min-w-52')}
        >
          {rows}
        </parts.SubContent>
      </parts.Portal>
    </parts.Sub>
  )
}

/**
 * A menu's content in Radix's parts, in the app's look: its rows, the focus on the picked row or the
 * first as it opens, the focus back on its button as it closes unless the focus is somewhere by then
 * (in a field a row opened, say), and Esc going back from a row's menu shown in its place first.
 */
function MenuContent({
  parts,
  button,
  label,
  testId,
  sheet: asSheet,
  place,
  className,
  children,
}: {
  parts: Parts
  /** The button it opens from, which the focus goes back to as it closes; a right-click menu has none. */
  button?: RefObject<HTMLElement | null>
  label: string
  testId?: string | undefined
  sheet: boolean
  place?: MenuPlace | undefined
  className?: string | undefined
  children: ReactNode
}) {
  const phone = usePhone()
  const sheet = asSheet && phone
  const scroll = useScrollingMenu()
  const back = useRef<(() => void) | null>(null)
  const entered = useRef(false)
  const dropdown = parts === DropdownMenu
  return (
    <parts.Portal>
      <parts.Content
        loop
        {...(sheet ? {} : place)}
        ref={scroll.ref}
        onScroll={scroll.onScroll}
        // Named by its own words, not its button's: Share's menu is "Share and export".
        aria-label={label}
        aria-labelledby={undefined}
        data-testid={testId}
        data-menu
        data-menu-sheet={sheet || undefined}
        onFocus={(event: FocusEvent<HTMLDivElement>) => {
          // As it opens, by a click or a key: the focus on the picked row, or the first.
          if (event.target !== event.currentTarget || entered.current) return
          entered.current = true
          const into = event.currentTarget
          const first =
            into.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]') ??
            [...into.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((row) => row.checkVisibility())
          if (!first) return
          event.preventDefault()
          // Ringed only when opened from the keyboard; the rows the pointer moves to after stay unringed.
          first.focus({ preventScroll: true, focusVisible: keyed } as FocusOptions)
        }}
        onCloseAutoFocus={(event) => {
          entered.current = false
          if (!nowhere()) return event.preventDefault()
          // Closed by a pointer, the focus goes back without its keyboard ring or a tooltip.
          if (keyed || !button?.current) return
          event.preventDefault()
          button.current.focus({ focusVisible: false } as FocusOptions)
        }}
        // Back from a row's menu shown in its place first, else closing the menu. Either way that Esc
        // goes no further: it takes the focused row out of the page, and the stage would take an Esc
        // from outside a menu as its own and let the selection go.
        onEscapeKeyDown={(event) => {
          event.stopPropagation()
          if (!back.current) return
          event.preventDefault()
          back.current()
        }}
        className={cn(MENU, dropdown ? ROOM.dropdown : ROOM.context, className, scroll.className, sheet && SHEET)}
      >
        <SharedContext value={{ parts, sheet, back }}>{children}</SharedContext>
      </parts.Content>
    </parts.Portal>
  )
}

/**
 * A row's menu in the place of the phone's sheet it is in: the row, until it opens by a tap, Enter
 * or the arrow towards it; then a back row naming the row, then the menu's rows, while every other
 * piece of the sheet hides (app/globals.css hides what in a `data-menu` neither is the
 * `data-menu-in-place` nor holds it). It takes the focus at its back row, so a greyed first row
 * doesn't say why unasked; the back row, the arrow back and Esc go back to the row, Esc once a
 * greyed row's tooltip that shows has closed. Rows that show up under a pointer at rest take no
 * hover tint until it moves.
 */
function SubInPlace({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  const t = useMessages()
  const { parts, back } = useShared()
  const arrows = useArrows()
  const [open, setOpen] = useState(false)
  const row = useRef<HTMLButtonElement>(null)
  const backRow = useRef<HTMLButtonElement>(null)
  const show = useCallback((to: boolean) => {
    holdHover((row.current ?? backRow.current)?.closest<HTMLElement>('[data-menu]') ?? null)
    flushSync(() => setOpen(to))
  }, [])
  const goBack = useCallback(() => {
    show(false)
    row.current?.focus()
  }, [show])
  useLayoutEffect(() => {
    if (open) backRow.current?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    back.current = goBack
    return () => {
      if (back.current === goBack) back.current = null
    }
  }, [open, back, goBack])
  if (!open)
    return (
      <parts.Item
        asChild
        textValue={label}
        onSelect={(event) => {
          event.preventDefault()
          show(true)
        }}
      >
        <button
          ref={row}
          type="button"
          aria-haspopup="menu"
          data-testid={testId}
          {...PRESS}
          // The arrow that opens it goes no further: opening takes this row out of the page, and the
          // stage would take an arrow from outside a menu as its own and nudge the selection.
          onKeyDown={(event) => {
            if (event.key !== arrows.toward) return
            event.preventDefault()
            event.stopPropagation()
            show(true)
          }}
          className={MENU_ITEM}
        >
          {label}
          {caret}
        </button>
      </parts.Item>
    )
  return (
    <div
      data-menu-in-place
      role="group"
      aria-label={label}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== arrows.back) return
        event.preventDefault()
        event.stopPropagation()
        goBack()
      }}
      className="flex flex-col"
    >
      <parts.Item
        asChild
        textValue={label}
        onSelect={(event) => {
          event.preventDefault()
          goBack()
        }}
      >
        <button
          ref={backRow}
          type="button"
          data-testid={`${testId}-back`}
          aria-label={format(t.menu.backFrom, { menu: label })}
          {...PRESS}
          className={cn(MENU_ITEM, 'justify-start gap-1.5')}
        >
          <CaretLeftIcon size={12} weight="bold" aria-hidden className="text-subtle rtl:-scale-x-100" />
          {label}
        </button>
      </parts.Item>
      <parts.Separator className={MENU_DIVIDER} />
      <div role="group" aria-label={label} data-testid={`${testId}-menu`} className="flex flex-col">
        {children}
      </div>
    </div>
  )
}
