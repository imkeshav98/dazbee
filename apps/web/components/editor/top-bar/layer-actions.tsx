'use client'

// The selected layers' own actions, one list for the small menu's ⋯ (the full menu) and the
// right-click menu: copy, paste, duplicate and delete; order and line up with the size as menus
// beside their rows, and the turn; group, box, mask and ungroup; lock and hide; text direction.
// Every row runs the same editor action as its shortcut.
import { CaretRightIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { type ReactNode, useEffect, useState } from 'react'

import type { Editor, ShortcutAction } from '@dazbee/editor'
import { formatScope } from '@dazbee/schema'

import { ALIGN, keyOf } from '@/components/editor/arrange-actions.ts'
import { useEditState } from '@/components/editor/edit-store.ts'
import { useSelection } from '@/components/editor/editor-hooks.ts'
import { RotationField, set, shared, useTarget } from '@/components/editor/selection-cards.tsx'
import { ICON_BUTTON, MENU, MENU_DIVIDER, MENU_ITEM, MENU_KEY } from '@/components/editor/styles.ts'
import { cn } from '@/lib/cn.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf, format } from '@/lib/i18n/index.ts'

import { useMenuFocus } from './bar-popover.tsx'

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

/** A row of the menu that opens a short menu beside it: Enter or the arrow towards it opens it, the arrow back or Esc closes it. */
function SubMenu({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const rtl = dirOf(useLocale()) === 'rtl'
  const [toward, back] = rtl ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']
  const focus = useMenuFocus()
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={focus.button}
          type="button"
          aria-haspopup="dialog"
          data-testid={`more-${testId}`}
          onKeyDown={(event) => {
            if (event.key !== toward) return
            event.preventDefault()
            setOpen(true)
          }}
          className={MENU_ITEM}
        >
          {label}
          <CaretRightIcon size={12} weight="bold" aria-hidden className="text-subtle rtl:-scale-x-100" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={rtl ? 'left' : 'right'}
          align="start"
          sideOffset={8}
          collisionPadding={12}
          // A click elsewhere, Esc or the arrow back closes it; focus moving as the menu opens does not.
          onFocusOutside={(event) => event.preventDefault()}
          {...focus.content}
          aria-label={label}
          data-testid={`more-${testId}-menu`}
          onKeyDown={(event) => {
            if (event.key !== back) return
            event.preventDefault()
            setOpen(false)
          }}
          className={cn(MENU, 'min-w-52')}
        >
          {focus.back}
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** The four moves along the stack: to the front, forward, backward, to the back. */
export const ORDER = ['bringToFront', 'bringForward', 'sendBackward', 'sendToBack'] as const

/**
 * The layers' own actions in short groups with only what applies. Copy fires the same copy event as
 * the keyboard's, so the clipboard and the copy kept for Paste both change; Paste places the layers
 * last copied in Dazbee.
 */
export function LayerActions({ editor, ids, onDone }: { editor: Editor; ids: string[]; onDone: () => void }) {
  const t = useMessages()
  const p = t.editor.props
  const b = t.editor.bar
  const selected = useTarget(editor, ids)
  if (!selected) return null
  const { target, design } = selected
  const run = (action: ShortcutAction) => {
    editor.perform(action)
    onDone()
  }
  const row = (action: ShortcutAction, label: string, pressed?: boolean) => (
    <button
      key={action}
      type="button"
      data-action={action}
      aria-pressed={pressed}
      onClick={() => run(action)}
      className={MENU_ITEM}
    >
      {label}
      <kbd className={MENU_KEY}>{keyOf(action)}</kbd>
    </button>
  )
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const mod = mac ? '⌘' : 'Ctrl'
  const [copyKey, pasteKey] = [`${mod}+C`, `${mod}+V`]
  const nodes = target.ids.map((id) => design.nodes[id])
  const locked = nodes.every((node) => node?.lock && Object.values(node.lock).some(Boolean))
  const hidden = target.props.every((pr) => pr.visible === false)
  const hiddenEverywhere = target.ids.every((id) =>
    Object.keys(design.formats).every(
      (f) => (design.overrides[formatScope(f)]?.[id]?.visible ?? design.nodes[id]?.props.visible) === false,
    ),
  )
  const masks = target.props.every((pr) => Boolean(pr.mask))
  const sized = target.types.every((type) => type !== 'group' && type !== 'boolean')
  const texts = target.types.every((type) => type === 'text')
  const direction = shared(target.props.map((pr) => (pr.direction ?? 'auto') as 'auto' | 'ltr' | 'rtl'))
  return (
    <>
      <button
        type="button"
        data-action="copy"
        onClick={() => {
          if (!document.execCommand('copy')) editor.copyLayers()
          onDone()
        }}
        className={MENU_ITEM}
      >
        {b.copy}
        <kbd className={MENU_KEY}>{copyKey}</kbd>
      </button>
      <button
        type="button"
        data-action="paste"
        disabled={!editor.canPasteLayers()}
        onClick={() => {
          editor.pasteLayers()
          onDone()
        }}
        className={MENU_ITEM}
      >
        {b.paste}
        <kbd className={MENU_KEY}>{pasteKey}</kbd>
      </button>
      {row('duplicate', t.editor.arrange.duplicate)}
      {row('delete', b.delete)}
      <div className={MENU_DIVIDER} />
      <SubMenu label={b.order} testId="order">
        {ORDER.map((action) => row(action, t.editor.arrange[action]))}
      </SubMenu>
      {ids.length === 1 && (
        <SubMenu label={b.lineUp} testId="line-up">
          <AlignRow editor={editor} />
        </SubMenu>
      )}
      {sized && (
        <div className="px-1.5 py-1">
          <RotationField target={target} p={p} />
        </div>
      )}
      <div className={MENU_DIVIDER} />
      {ids.length > 1 && row('group', t.editor.arrange.group)}
      {row('frameSelection', b.putInBox)}
      {row('mask', t.editor.arrange.mask, masks)}
      {target.types.some((type) => type === 'group') && row('ungroup', t.editor.arrange.ungroup)}
      <div className={MENU_DIVIDER} />
      <button
        type="button"
        onClick={() => {
          editor.setLocked(target.ids, !locked)
          onDone()
        }}
        className={MENU_ITEM}
      >
        {locked ? b.unlock : b.lock}
        <kbd className={MENU_KEY}>{keyOf('lock')}</kbd>
      </button>
      <button
        type="button"
        onClick={() => {
          editor.setHidden(target.ids, !hidden, target.pageId, target.formatId)
          onDone()
        }}
        className={MENU_ITEM}
      >
        {hidden ? b.showHere : b.hideHere}
        <kbd className={MENU_KEY}>{keyOf('hide')}</kbd>
      </button>
      {row('hideEverywhere', hiddenEverywhere ? b.showEverywhere : b.hideEverywhere)}
      {texts && (
        <>
          <div className={MENU_DIVIDER} />
          <SubMenu label={b.textDirection} testId="text-direction">
            {(['auto', 'ltr', 'rtl'] as const).map((to) => (
              <button
                key={to}
                type="button"
                aria-pressed={direction === to}
                data-direction={to}
                onClick={() => {
                  set({ ...target, everyFormat: true }, () => ({ direction: to }))
                  onDone()
                }}
                className={MENU_ITEM}
              >
                {b.textDirections[to]}
              </button>
            ))}
          </SubMenu>
        </>
      )}
    </>
  )
}

/** The layer actions at a right-click on the stage, for what it picked; it closes once the selection changes. */
export function StageMenu({
  editor,
  at,
  onClose,
}: {
  editor: Editor
  at: { x: number; y: number }
  onClose: () => void
}) {
  const t = useMessages()
  const ids = useSelection(editor)
  const { barBottom } = useEditState()
  const [openedFor] = useState(ids)
  useEffect(() => {
    if (ids !== openedFor) onClose()
  }, [ids, openedFor, onClose])
  return (
    <Popover.Root open onOpenChange={(to) => !to && onClose()}>
      <Popover.Anchor asChild>
        <span aria-hidden className="pointer-events-none absolute size-0" style={{ left: at.x, top: at.y }} />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={2}
          sticky="always"
          // Kept between the top bar and the bottom controls, scrolling inside when it has less room.
          collisionPadding={{ top: barBottom + 8, bottom: 72, left: 12, right: 12 }}
          // A click elsewhere or Esc closes it; focus given back to a button that just closed does not.
          onFocusOutside={(event) => event.preventDefault()}
          aria-label={t.editor.bar.actions}
          data-testid="stage-menu"
          className={cn(MENU, 'max-h-[var(--radix-popover-content-available-height)] w-80 overflow-y-auto')}
        >
          <LayerActions editor={editor} ids={ids} onDone={onClose} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
