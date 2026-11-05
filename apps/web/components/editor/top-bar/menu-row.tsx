'use client'

// A row of the editor's menus that runs an action, its key at its end, greyed with the reason in a
// tooltip while it has nothing to do, as every menu's greyed rows are.
import { CaretRightIcon } from '@phosphor-icons/react'

import { GreyedButton } from '@/components/ui/greyed.tsx'
import { MENU_ITEM, MENU_KEY } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'

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
    <GreyedButton
      why={why}
      data-action={action}
      data-testid={testId}
      className={cn(MENU_ITEM, danger && 'text-danger')}
    >
      {label}
      {end}
    </GreyedButton>
  )
}
