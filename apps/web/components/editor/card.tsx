'use client'

// The cards a size or a page has in its panel's list, with their buttons and menu.
import { DotsThreeIcon } from '@phosphor-icons/react'
import { Fragment, useState } from 'react'

import { Menu, MenuDivider, MenuItem } from '@/components/ui/menu.tsx'

import { ICON_BUTTON } from './styles.ts'

/**
 * One item of a card's menu; a `danger` one, last, removes, which a toast undoes. While it has
 * nothing to do (`why`) it is greyed and says why.
 */
export interface CardMenuItem {
  label: string
  run: () => void
  why?: string | null
  danger?: boolean
}

/** A size's or a page's card in its panel's list. */
export const CARD_ROW = 'flex items-center gap-2.5 rounded-[10px] border border-line bg-surface p-2'

/** A size's or a page's menu behind ⋯ on its card; a line goes before the item that removes it. */
export function CardMenu({ label, items }: { label: string; items: CardMenuItem[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Menu
      trigger={
        <button type="button" aria-label={label} title={label} className={ICON_BUTTON}>
          <DotsThreeIcon size={16} weight="bold" aria-hidden />
        </button>
      }
      open={open}
      onOpenChange={setOpen}
      label={label}
      place={{ side: 'bottom', align: 'end', sideOffset: 6, collisionPadding: 12 }}
      className="min-w-44"
    >
      {items.map((item) => (
        <Fragment key={item.label}>
          {item.danger && <MenuDivider />}
          <MenuItem label={item.label} why={item.why ?? null} danger={item.danger ?? false} onSelect={item.run} />
        </Fragment>
      ))}
    </Menu>
  )
}
