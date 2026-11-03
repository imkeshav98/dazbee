'use client'

// One button of the bar by the selection and the popover it opens under it. The bar keeps which
// one is open, so only one is open at a time.
import * as Popover from '@radix-ui/react-popover'
import { CaretDownIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { cn } from '../../lib/cn.ts'
import { BAR_BUTTON, POPOVER } from './styles.ts'

const nowhere = () => document.activeElement === null || document.activeElement === document.body

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
      const first = into.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea, select, [href], [tabindex]:not([tabindex="-1"])')
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

export function BarPopover({ id, open, onOpen, label, face, icon, children, testId, className }: {
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
}) {
  const focus = useMenuFocus()
  return (
    <Popover.Root open={open === id} onOpenChange={(to) => onOpen(to ? id : null)}>
      <Popover.Trigger asChild>
        <button ref={focus.button} type="button" data-bar-item aria-label={face ? label : undefined} title={face ? label : undefined} data-testid={`bar-${testId}`} className={BAR_BUTTON}>
          {icon}
          {face ?? label}
          <CaretDownIcon size={10} weight="bold" aria-hidden className="text-subtle" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="center" sideOffset={8} collisionPadding={12} {...focus.content} aria-label={label} data-testid={`bar-${testId}-menu`} className={cn(POPOVER, 'flex flex-col p-1.5', className ?? 'min-w-56')}>
          {focus.back}
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** A toolbar's buttons that can be used and show, in order: a closed second row's are left out. */
export const itemsOf = (bar: HTMLElement) => [...bar.querySelectorAll<HTMLElement>('[data-bar-item]:not(:disabled)')].filter((item) => item.checkVisibility({ visibilityProperty: true }))

/** Moves focus along a toolbar's buttons with the arrow keys, Home and End. */
export function arrowAlong(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
  const items = itemsOf(event.currentTarget)
  const at = items.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  event.preventDefault()
  const forward = (event.key === 'ArrowRight') !== (getComputedStyle(event.currentTarget).direction === 'rtl')
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (forward ? 1 : -1) + items.length) % items.length
  items[next]?.focus()
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
