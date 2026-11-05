'use client'

// A row of the editor's menus that runs an action, its key at its end, greyed with the reason in a
// tooltip while it has nothing to do.
import { CaretRightIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { usePhone } from '@/components/editor/edit-store.ts'
import { MENU_ITEM, MENU_ITEM_GREYED, MENU_KEY } from '@/components/editor/styles.ts'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { useLocale } from '@/lib/i18n/client.tsx'
import { dirOf } from '@/lib/i18n/index.ts'

/**
 * A row of the menu that runs an action, its key at the end. While it has nothing to do it is
 * greyed, and says why in a tooltip under the pointer, on keyboard focus and on a tap.
 */
export function Row({
  action,
  label,
  keys,
  why,
  danger = false,
  caret = false,
  onRun,
}: {
  action: string
  label: string
  keys: string
  why: string | null
  danger?: boolean
  /** It stands for a row that opens a menu beside it. */
  caret?: boolean
  onRun?: () => void
}) {
  const [told, setTold] = useState(false)
  // Beside the row at its end, or under it on a phone, where a menu fills the width.
  const phone = usePhone()
  const rtl = dirOf(useLocale()) === 'rtl'
  const end = caret ? (
    <CaretRightIcon size={12} weight="bold" aria-hidden className="text-subtle rtl:-scale-x-100" />
  ) : (
    keys && <kbd className={MENU_KEY}>{keys}</kbd>
  )
  if (!why)
    return (
      <button type="button" data-action={action} onClick={onRun} className={cn(MENU_ITEM, danger && 'text-danger')}>
        {label}
        {end}
      </button>
    )
  return (
    <Tooltip label={why} side={phone ? 'bottom' : rtl ? 'left' : 'right'} open={told} onOpenChange={setTold}>
      <button
        type="button"
        data-action={action}
        aria-disabled="true"
        aria-description={why}
        // A tap shows why, as the pointer resting on it does.
        onClick={(event) => {
          event.preventDefault()
          setTold(true)
        }}
        className={cn(MENU_ITEM, MENU_ITEM_GREYED, danger && 'text-danger')}
      >
        {label}
        {end}
      </button>
    </Tooltip>
  )
}
