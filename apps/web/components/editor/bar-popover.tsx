'use client'

// One button of the bar by the selection and the popover it opens under it. The bar keeps which
// one is open, so only one is open at a time.
import * as Popover from '@radix-ui/react-popover'
import { CaretDownIcon } from '@phosphor-icons/react'
import { useRef, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { BAR_BUTTON, POPOVER } from './styles.ts'

/**
 * How a menu of the bar gives the focus back as it closes. Esc puts it on the menu's button at once,
 * so a second Esc or a click straight after acts from there and not from the page. Radix gives it
 * back to the button a moment after any close; that is skipped once the focus is somewhere again,
 * such as in a menu opened since, which the focus leaving would close.
 */
export function useMenuFocus() {
  const button = useRef<HTMLButtonElement>(null)
  const content = {
    onEscapeKeyDown: () => button.current?.focus(),
    onCloseAutoFocus: (event: Event) => {
      if (document.activeElement && document.activeElement !== document.body) event.preventDefault()
    },
  }
  return { button, content }
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
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
