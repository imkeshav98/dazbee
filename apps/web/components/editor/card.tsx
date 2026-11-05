'use client'

// The cards a size or a page has in its panel's list, with their buttons and menu.
import { DotsThreeIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { Fragment, useState } from 'react'

import { useMenuFocus } from '@/components/editor/top-bar/bar-popover.tsx'
import { cn } from '@/lib/cn.ts'

import { ICON_BUTTON, MENU, MENU_DIVIDER, MENU_ITEM } from './styles.ts'

/** One item of a card's menu; a `danger` one, last, removes, which a toast undoes. */
export interface CardMenuItem {
  label: string
  run: () => void
  disabled?: boolean
  danger?: boolean
}

/** A size's or a page's card in its panel's list. */
export const CARD_ROW = 'flex items-center gap-2.5 rounded-[10px] border border-line bg-surface p-2'

/** A size's or a page's menu behind ⋯ on its card; a line goes before the item that removes it. */
export function CardMenu({ label, items }: { label: string; items: CardMenuItem[] }) {
  const [open, setMenuOpen] = useState(false)
  const focus = useMenuFocus()
  return (
    <Popover.Root open={open} onOpenChange={setMenuOpen}>
      <Popover.Trigger asChild>
        <button ref={focus.button} type="button" aria-label={label} title={label} className={ICON_BUTTON}>
          <DotsThreeIcon size={16} weight="bold" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          {...focus.content}
          aria-label={label}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(MENU, 'min-w-44')}
        >
          {focus.back}
          {items.map((item) => (
            <Fragment key={item.label}>
              {item.danger && <div className={MENU_DIVIDER} />}
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setMenuOpen(false)
                  item.run()
                }}
                className={cn(MENU_ITEM, item.danger && 'text-danger')}
              >
                {item.label}
              </button>
            </Fragment>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
