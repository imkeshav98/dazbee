'use client'

// The top bar's Arrange ⋯ for the selected layers, its last item: how they sit. Order ▸, Line up ▸
// (with the frame, for one layer), the rotation field, and Text direction ▸ for text, each shown only
// where it applies (`arrangeRows`). It opens under the bar, and on a phone as a sheet at the bottom
// of the screen. Every row runs the same editor action as its shortcut.
import { DotsThreeIcon } from '@phosphor-icons/react'

import type { Editor } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { ALIGN, keyOf } from '@/components/editor/arrange-actions.ts'
import { RotationField } from '@/components/editor/edit-panel/position-panel.tsx'
import { factsOf, num, set, shared, type Target } from '@/components/editor/edit-panel/target.ts'
import { setOpen, useEditState } from '@/components/editor/edit-store.ts'
import { ICON_BUTTON, KNOB, MENU_DIVIDER, MENU_ITEM, VALUE_TEXT } from '@/components/editor/styles.ts'
import { FOCUS_RING } from '@/components/ui/looks.ts'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { arrangeRows, stackEnds } from '@/lib/editor/stack-ends.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { BarPopover } from './bar-popover.tsx'
import { SubMenu } from './layer-actions.tsx'
import { MenuRow, useWhyTip } from './menu-row.tsx'

/** The four moves along the stack: to the front, forward, backward, to the back. */
export const ORDER = ['bringToFront', 'bringForward', 'sendBackward', 'sendToBack'] as const

/** The mark the rotation field starts with, the same in every language. */
const TURN_MARK = '↻'

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
  const why = { locked: b.lockedRow, placedByLayout: b.placedByLayout }
  return (
    <BarPopover
      id="arrange"
      open={open}
      onOpen={setOpen}
      label={b.arrange}
      face={<DotsThreeIcon size={18} weight="bold" aria-hidden />}
      menu
      align="end"
      testId="arrange"
      className="w-64"
    >
      {rows.map((row) => {
        switch (row.row) {
          case 'order':
            return (
              <SubMenu key="order" label={b.order} testId="order">
                {ORDER.map((action) => (
                  <MenuRow
                    key={action}
                    action={action}
                    label={t.editor.arrange[action]}
                    keys={keyOf(action)}
                    why={nothingToDo(action)}
                    onRun={() => {
                      editor.perform(action)
                      done()
                    }}
                  />
                ))}
              </SubMenu>
            )
          case 'lineUp':
            return row.off ? (
              <MenuRow key="line-up" label={b.lineUp} why={why[row.off]} testId="more-line-up" caret />
            ) : (
              <SubMenu key="line-up" label={b.lineUp} testId="line-up">
                <AlignRow editor={editor} />
              </SubMenu>
            )
          case 'rotation':
            return (
              // On a phone the turn field is as tall as a row, a touch target a finger can hit.
              <div key="rotation" className="px-1.5 py-1 max-sm:[&_[data-scrub]]:min-h-[44px]">
                {row.off ? (
                  <GreyedTurn target={target} why={why[row.off]} />
                ) : (
                  <RotationField target={target} p={t.editor.props} />
                )}
              </div>
            )
          case 'textDirection':
            return [
              <div key="divider" role="separator" className={MENU_DIVIDER} />,
              row.off ? (
                <MenuRow
                  key="text-direction"
                  label={b.textDirection}
                  why={why[row.off]}
                  testId="more-text-direction"
                  caret
                />
              ) : (
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
                </SubMenu>
              ),
            ]
        }
      })}
    </BarPopover>
  )
}

/**
 * The six ways to line up the selection, as icons: left, centre, right, top, middle, bottom. Each
 * is named by where it lines up to, and its tooltip says so with its shortcut.
 */
export function AlignRow({ editor }: { editor: Editor }) {
  const t = useMessages()
  const named = t.editor.bar.placing
  return (
    // On a phone each button is a finger's size, with room between them.
    <div dir="ltr" role="group" aria-label={t.editor.arrange.align} className="grid grid-cols-6 gap-0.5 max-sm:gap-2">
      {ALIGN.map(({ action, icon: Icon }) => (
        <Tooltip key={action} label={format(t.editor.arrange.withKey, { label: named[action], key: keyOf(action) })}>
          <button
            type="button"
            aria-label={named[action]}
            data-action={action}
            onClick={() => editor.perform(action)}
            className={cn(ICON_BUTTON, 'max-sm:size-[44px]')}
          >
            <Icon size={16} aria-hidden />
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

/**
 * The rotation field greyed out: the layers' turn, which nothing types, scrubs or steps, with a
 * tooltip saying why under the pointer, on keyboard focus and on a tap, as a greyed row has.
 */
function GreyedTurn({ target, why }: { target: Target; why: string }) {
  const p = useMessages().editor.props
  const tip = useWhyTip<HTMLDivElement>(why)
  const turn = shared(target.props.map((pr) => num(pr, 'rotation') ?? 0))
  const shown = turn === 'mixed' ? p.mixed : `${turn}°`
  return (
    <Tooltip {...tip.tooltip}>
      <div
        ref={tip.ref}
        role="spinbutton"
        tabIndex={0}
        aria-label={p.rotationName}
        aria-disabled="true"
        aria-valuenow={turn === 'mixed' ? undefined : turn}
        aria-valuetext={shown}
        aria-description={why}
        data-scrub={p.rotationName}
        onClick={tip.tap}
        className={cn(KNOB, 'cursor-not-allowed opacity-40 hover:border-line', FOCUS_RING)}
      >
        <span aria-hidden>{TURN_MARK}</span>
        <span className={cn(VALUE_TEXT, 'ms-auto')}>{shown}</span>
      </div>
    </Tooltip>
  )
}
