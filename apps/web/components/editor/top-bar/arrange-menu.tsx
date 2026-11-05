'use client'

// The top bar's Arrange ⋯ for the selected layers, its last item: how they sit. Order ▸, Line up ▸
// (with the frame, for one layer), the rotation field, and Text direction ▸ for text, each shown only
// where it applies (`arrangeRows`). It opens under the bar, and on a phone as a sheet at the bottom
// of the screen. Every row runs the same editor action as its shortcut.
import { CaretRightIcon, DotsThreeIcon } from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'

import type { Editor } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { ALIGN, keyOf } from '@/components/editor/arrange-actions.ts'
import { RotationField } from '@/components/editor/edit-panel/position-panel.tsx'
import { factsOf, set, shared, type Target } from '@/components/editor/edit-panel/target.ts'
import { setOpen, useEditState, usePhone } from '@/components/editor/edit-store.ts'
import { ICON_BUTTON, MENU_DIVIDER, MENU_ITEM, MENU_ITEM_GREYED, MENU_KEY } from '@/components/editor/styles.ts'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { arrangeRows, stackEnds } from '@/lib/editor/arrange-menu.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf, format } from '@/lib/i18n/index.ts'

import { BarPopover } from './bar-popover.tsx'
import { SubMenu } from './layer-actions.tsx'

/** The four moves along the stack: to the front, forward, backward, to the back. */
export const ORDER = ['bringToFront', 'bringForward', 'sendBackward', 'sendToBack'] as const

/**
 * The top bar's Arrange ⋯ for the selected layers: its button, and the menu it opens with the rows
 * that apply. `locked` says some of the layers are locked, as the bar has worked out.
 */
export function ArrangeMenu({ target, design, locked }: { target: Target; design: Design; locked: boolean }) {
  const t = useMessages()
  const b = t.editor.bar
  const { open } = useEditState()
  const { editor } = target
  const rows = arrangeRows({ ...factsOf(target, design), several: target.ids.length > 1, locked })
  // A move to the front has nothing to do for layers at the front of their stacks, one to the back
  // for layers at the back.
  const ends = stackEnds(design, target.ids)
  const toFront = (action: (typeof ORDER)[number]) => action === 'bringToFront' || action === 'bringForward'
  const nothingToDo = (action: (typeof ORDER)[number]) =>
    toFront(action) ? (ends.front ? b.atFront : null) : ends.back ? b.atBack : null
  const done = () => setOpen(null)
  const direction = shared(target.props.map((pr) => (pr.direction ?? 'auto') as 'auto' | 'ltr' | 'rtl'))
  return (
    <BarPopover
      id="arrange"
      open={open}
      onOpen={setOpen}
      label={b.arrange}
      face={<DotsThreeIcon size={18} weight="bold" aria-hidden />}
      caret={false}
      align="end"
      testId="arrange"
      className="w-64"
    >
      {rows.map((row) => {
        switch (row.row) {
          case 'order':
            return (
              <SubMenu key="order" label={b.order} testId="order">
                {ORDER.map((action) => {
                  const why = nothingToDo(action)
                  const end = <kbd className={MENU_KEY}>{keyOf(action)}</kbd>
                  return why ? (
                    <GreyedRow key={action} label={t.editor.arrange[action]} why={why} action={action} end={end} />
                  ) : (
                    <button
                      key={action}
                      type="button"
                      data-action={action}
                      onClick={() => {
                        editor.perform(action)
                        done()
                      }}
                      className={MENU_ITEM}
                    >
                      {t.editor.arrange[action]}
                      {end}
                    </button>
                  )
                })}
              </SubMenu>
            )
          case 'lineUp':
            return row.off ? (
              <GreyedRow key="line-up" label={b.lineUp} why={b.placedByLayout} testId="more-line-up" end={<Caret />} />
            ) : (
              <SubMenu key="line-up" label={b.lineUp} testId="line-up">
                <AlignRow editor={editor} />
              </SubMenu>
            )
          case 'rotation':
            return (
              // On a phone the turn field is as tall as a row, a touch target a finger can hit.
              <div key="rotation" className="px-1.5 py-1 max-sm:[&_[data-scrub]]:min-h-[44px]">
                <RotationField target={target} p={t.editor.props} />
              </div>
            )
          case 'textDirection':
            return [
              <div key="divider" role="separator" className={MENU_DIVIDER} />,
              <SubMenu key="text-direction" label={b.textDirection} testId="text-direction">
                {(['auto', 'ltr', 'rtl'] as const).map((to) => (
                  <button
                    key={to}
                    type="button"
                    aria-pressed={direction === to}
                    data-direction={to}
                    onClick={() => {
                      set(target, () => ({ direction: to }))
                      done()
                    }}
                    className={MENU_ITEM}
                  >
                    {b.textDirections[to]}
                  </button>
                ))}
              </SubMenu>,
            ]
        }
      })}
    </BarPopover>
  )
}

/** The six ways to line up the selection, as icons: left, centre, right, top, middle, bottom. */
export function AlignRow({ editor }: { editor: Editor }) {
  const t = useMessages()
  return (
    <div dir="ltr" role="group" aria-label={t.editor.arrange.align} className="grid grid-cols-6 gap-0.5">
      {ALIGN.map(({ action, icon: Icon }) => (
        <button
          key={action}
          type="button"
          aria-label={t.editor.arrange[action]}
          title={format(t.editor.arrange.withKey, { label: t.editor.arrange[action], key: keyOf(action) })}
          data-action={action}
          onClick={() => editor.perform(action)}
          className={ICON_BUTTON}
        >
          <Icon size={16} aria-hidden />
        </button>
      ))}
    </div>
  )
}

/**
 * A row that applies but is refused or has nothing to do now: greyed out, opening and running
 * nothing, with a tooltip saying why under the pointer, on keyboard focus and on a tap. It keeps
 * the focus, so the keyboard still reaches it and hears why. `end` is what the row ends with: its
 * shortcut, or the caret of a row that opens a menu beside it.
 */
function GreyedRow({
  label,
  why,
  end,
  action,
  testId,
}: {
  label: string
  why: string
  end: ReactNode
  action?: string
  testId?: string
}) {
  const [told, setTold] = useState(false)
  // Beside the row at its end, or under it on a phone, where a menu fills the width.
  const phone = usePhone()
  const rtl = dirOf(useLocale()) === 'rtl'
  return (
    <Tooltip label={why} side={phone ? 'bottom' : rtl ? 'left' : 'right'} open={told} onOpenChange={setTold}>
      <button
        type="button"
        aria-disabled="true"
        aria-description={why}
        data-action={action}
        data-testid={testId}
        // A tap or a click shows why, as the pointer resting on it does.
        onClick={(event) => {
          event.preventDefault()
          setTold(true)
        }}
        className={cn(MENU_ITEM, MENU_ITEM_GREYED)}
      >
        {label}
        {end}
      </button>
    </Tooltip>
  )
}

/** The caret at the end of a row that opens a menu beside it. */
function Caret() {
  return <CaretRightIcon size={12} weight="bold" aria-hidden className="text-subtle rtl:-scale-x-100" />
}
