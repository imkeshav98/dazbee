'use client'

import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { FocusEvent, ReactNode } from 'react'

/** A tooltip's look, for a caller that measures one before it shows. */
export const TOOLTIP =
  'z-50 rounded-md border border-line bg-raised px-2 py-1 text-xs font-medium text-text shadow-panel data-[state=delayed-open]:animate-[tooltip-in_var(--chrome-fast)_var(--ease-out)]'

/** Keeps Radix from opening the tooltip on focus the browser doesn't show as keyboard focus. */
const keyboardFocusOnly = (e: FocusEvent<HTMLElement>) => {
  if (!e.currentTarget.matches(':focus-visible')) e.preventDefault()
}

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RadixTooltip.Provider delayDuration={350} skipDelayDuration={150}>
    {children}
  </RadixTooltip.Provider>
)

/**
 * A short label beside a control; the control must carry its own accessible name too. It shows on
 * hover and on keyboard focus, not when a menu closed by the pointer hands focus back to the control.
 */
export function Tooltip({
  label,
  side = 'top',
  align = 'center',
  open,
  onOpenChange,
  children,
}: {
  label: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** How it lines up along its control's side. */
  align?: 'start' | 'center' | 'end'
  /** Whether it shows, for a caller that also opens it another way, such as a tap; left out, hover and focus decide. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <RadixTooltip.Root {...(open === undefined ? {} : { open })} {...(onOpenChange ? { onOpenChange } : {})}>
      <RadixTooltip.Trigger asChild onFocus={keyboardFocusOnly}>
        {children}
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={8}
          // Off the window's edges by as much as it keeps from its control.
          collisionPadding={8}
          className={TOOLTIP}
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
