'use client'

// One button of the bar by the selection and the popover it opens under it. The bar keeps which
// one is open, so only one is open at a time.
import * as Popover from '@radix-ui/react-popover'
import { CaretDownIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { BAR_BUTTON, POPOVER } from './styles.ts'

/**
 * A popover closed because another one of the bar opened leaves the focus in the new one; given back
 * to its button, the focus would be outside the new popover and close it too.
 */
export const keepFocus = (event: Event, open: string | null, id: string) => {
  if (open !== null && open !== id) event.preventDefault()
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
  return (
    <Popover.Root open={open === id} onOpenChange={(to) => onOpen(to ? id : null)}>
      <Popover.Trigger asChild>
        <button type="button" data-bar-item aria-label={face ? label : undefined} title={face ? label : undefined} data-testid={`bar-${testId}`} className={BAR_BUTTON}>
          {icon}
          {face ?? label}
          <CaretDownIcon size={10} weight="bold" aria-hidden className="text-subtle" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="center" sideOffset={8} collisionPadding={12} onCloseAutoFocus={(event) => keepFocus(event, open, id)} aria-label={label} data-testid={`bar-${testId}-menu`} className={cn(POPOVER, 'flex flex-col p-1.5', className ?? 'min-w-56')}>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
