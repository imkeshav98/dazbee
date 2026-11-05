'use client'

// The selected layers' own actions, one list for the small menu's ⋯ (the full menu) and the
// right-click menu: Copy ▸ and Paste ▸ (the layers or their style), duplicate, Copy to other frames ▸
// (style, text or the layer, into the linked frames); box, ungroup for a group or a box, mask (or
// release the mask a layer is under); and, at the bottom, lock, hide and delete in all frames, acting
// on the layers and their linked copies. Every row runs the same editor action as its shortcut. An
// item that never applies is left out; one with nothing to do is greyed, its tooltip saying why, as
// Ungroup is while the group or box is locked or auto layout would move what it holds. How the
// layers sit (order, line up, the turn, text direction) is in the top bar's Arrange ⋯.
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { type KeyboardEvent, type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { childrenOf } from '@dazbee/doc'
import type { Editor, ShortcutAction, UngroupState } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { keyOf } from '@/components/editor/arrange-actions.ts'
import { useTarget } from '@/components/editor/edit-panel/target.ts'
import { usePhone } from '@/components/editor/edit-store.ts'
import { MENU, MENU_DIVIDER, MENU_HEADING, MENU_ITEM, MENU_KEY } from '@/components/editor/styles.ts'
import { cn } from '@/lib/cn.ts'
import { holdHover } from '@/lib/hover-hold.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf, format, type Messages } from '@/lib/i18n/index.ts'

import { arrowThrough, useBackInPlace, useMenuFocus } from './bar-popover.tsx'
import { MenuRow } from './menu-row.tsx'

/** Why an item has nothing to do: the reason the linked-copy items give, by its message. */
type Why = keyof Messages['editor']['bar']['linked']['why']

/** Why Ungroup has nothing to do, or null while it has something to do. */
const ungroupWhy = (state: UngroupState, b: Messages['editor']['bar']) =>
  state === 'locked' ? b.lockedRow : state === 'placedByLayout' ? b.ungroupMoves : null

/** The width of a menu beside a row whose rows have long keys, as the mock draws Copy to other frames ▸. */
export const WIDE_MENU = 258

/**
 * The masks the layers are under, each the nearest mask before it among its siblings; null unless
 * every layer is under one and none is a mask itself.
 */
function masksOver(design: Design, ids: readonly string[]): string[] | null {
  const masks = new Set<string>()
  for (const id of ids) {
    const node = design.nodes[id]
    if (!node || node.props.mask) return null
    const siblings = childrenOf(design, node.parentId)
    const before = siblings.slice(
      0,
      siblings.findIndex(([sibling]) => sibling === id),
    )
    const mask = before.findLast(([, sibling]) => sibling.props.mask)
    if (!mask) return null
    masks.add(mask[0])
  }
  return [...masks]
}

/**
 * The keys of a row's short menu, beside the row or in its menu's place: the arrow `back`, towards
 * the page's start, goes back, and up, down, Home and End move between its rows (`arrowThrough`).
 * The arrow that goes back goes no further: going back takes the focused row out of the page, and
 * the stage would take an arrow from outside a menu as its own and nudge the selection.
 */
const backKeys = (back: string, goBack: () => void) => (event: KeyboardEvent<HTMLElement>) => {
  if (event.key !== back) return arrowThrough(event)
  event.preventDefault()
  event.stopPropagation()
  goBack()
}

/**
 * The layers' own actions in short groups with only what applies. Copy fires the same copy event as
 * the keyboard's, so the clipboard and the copy kept for Paste both change; Paste places the layers
 * last copied in Dazbee.
 */
export function LayerActions({ editor, ids, onDone }: { editor: Editor; ids: string[]; onDone: () => void }) {
  const t = useMessages()
  const b = t.editor.bar
  const selected = useTarget(editor, ids)
  // Asked once as the menu opens: it tries the ungroup on a copy of the design.
  const [ungroup] = useState(() => editor.ungroupState())
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
  const masks = target.props.every((pr) => Boolean(pr.mask))
  const over = masksOver(design, target.ids)
  const linked = editor.linkedMenu()
  if (!linked) return null
  const l = b.linked
  /** What an item says while it has nothing to do, or null while it has something to do. */
  const whyOf = (state: Why | 'ready' | 'hidden') => (state === 'ready' || state === 'hidden' ? null : l.why[state])
  /** A row that runs an action, greyed with the reason while it has nothing to do. */
  const actionRow = (action: ShortcutAction, label: string, why: string | null, danger = false) => (
    <MenuRow
      key={action}
      action={action}
      label={label}
      keys={keyOf(action)}
      why={why}
      danger={danger}
      onRun={() => run(action)}
    />
  )
  return (
    <>
      <SubMenu label={b.copy} testId="copy">
        <MenuRow
          action="copy"
          label={b.copy}
          keys={copyKey}
          why={null}
          onRun={() => {
            if (!document.execCommand('copy')) editor.copyLayers()
            onDone()
          }}
        />
        {actionRow('copyStyle', l.copyStyle, whyOf(linked.copyStyle))}
      </SubMenu>
      <SubMenu label={b.paste} testId="paste">
        <MenuRow
          action="paste"
          label={b.paste}
          keys={pasteKey}
          why={editor.canPasteLayers() ? null : l.why.nothingToPaste}
          onRun={() => {
            editor.pasteLayers()
            onDone()
          }}
        />
        {actionRow('pasteStyle', l.pasteStyle, whyOf(linked.pasteStyle))}
      </SubMenu>
      {row('duplicate', t.editor.arrange.duplicate)}
      <div className={MENU_DIVIDER} />
      {linked.frames === 0 ? (
        <MenuRow action="copyToFrames" label={l.copyToFrames} keys="" why={l.why.noFrames} caret />
      ) : (
        <SubMenu
          label={l.copyToFrames}
          testId="copy-to-frames"
          wide
          heading={linked.reach === 1 ? l.toFrame : format(l.toFrames, { n: linked.reach })}
        >
          {actionRow('styleToLinked', l.style, whyOf(linked.style))}
          {linked.text !== 'hidden' && actionRow('textToLinked', l.text, whyOf(linked.text))}
          {actionRow('layerToLinked', l.layer, whyOf(linked.layer))}
        </SubMenu>
      )}
      <div className={MENU_DIVIDER} />
      {row('boxSelection', b.putInBox)}
      {target.types.every((type) => type === 'group' || type === 'box') &&
        actionRow('ungroup', t.editor.arrange.ungroup, ungroupWhy(ungroup, b))}
      {over ? (
        <MenuRow
          action="releaseMask"
          label={b.releaseMask}
          keys=""
          why={over.some((id) => design.nodes[id]?.lock?.style) ? b.maskLocked : null}
          onRun={() => {
            // The mask becomes a layer of its own again, in one undo step.
            editor.session.run('node.mask', { ids: over, mask: null })
            onDone()
          }}
        />
      ) : (
        row('mask', t.editor.arrange.mask, masks)
      )}
      <div className={MENU_DIVIDER} />
      {actionRow('lockLinked', linked.lock === 'lock' ? l.lockAll : l.unlockAll, null)}
      {actionRow('hideLinked', linked.hide === 'hide' ? l.hideAll : l.showAll, null)}
      {actionRow('deleteLinked', l.deleteAll, whyOf(linked.delete), true)}
    </>
  )
}

/**
 * A row of the menu that opens a short menu beside it; on a phone, where the screen has no room
 * beside the menu, the short menu opens in the menu's place instead, under a back row naming the row
 * (`MenuInPlace`). Enter or the arrow towards it opens it; the arrow back or Esc closes it, or on a
 * phone goes back to the row with the back row too. Up, down, Home and End move between its rows,
 * and the row stays lit while the menu beside it is open.
 */
export function SubMenu({
  label,
  testId,
  heading,
  wide = false,
  children,
}: {
  label: string
  testId: string
  /** A short line over its rows saying what they act on. */
  heading?: string
  /** As wide as the mock draws a menu whose rows have long keys. */
  wide?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const phone = usePhone()
  const rtl = dirOf(useLocale()) === 'rtl'
  const [toward, back] = rtl ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']
  const focus = useMenuFocus()
  /**
   * Opens or closes its menu. On a phone that swaps the rows of its menu in place, and the rows
   * that show up under a pointer at rest take no hover tint until it moves.
   */
  const show = useCallback(
    (to: boolean) => {
      if (phone) holdHover(focus.button.current?.closest<HTMLElement>('[data-menu]') ?? null)
      setOpen(to)
    },
    [phone, focus.button],
  )
  /** Back from the menu in the place of a phone's menu to the row, the focus on the row once it shows. */
  const goBack = useCallback(() => {
    flushSync(() => show(false))
    focus.button.current?.focus()
  }, [show, focus.button])
  const rows = (
    <>
      {heading && <p className={MENU_HEADING}>{heading}</p>}
      {children}
    </>
  )
  return (
    <>
      {/* On a phone the popover never opens: its row opens the menu in the menu's place. */}
      <Popover.Root open={open && !phone} onOpenChange={show}>
        <Popover.Trigger asChild>
          <button
            ref={focus.button}
            type="button"
            aria-haspopup="dialog"
            data-testid={`more-${testId}`}
            onKeyDown={(event) => {
              if (event.key !== toward) return
              event.preventDefault()
              show(true)
            }}
            // Lit with the hover tint while the menu beside it is open.
            className={cn(MENU_ITEM, 'data-[state=open]:bg-hover data-[state=open]:lit')}
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
            onKeyDown={backKeys(back, () => show(false))}
            style={wide ? { width: WIDE_MENU } : undefined}
            className={cn(MENU, !wide && 'min-w-52')}
          >
            {focus.back}
            {rows}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {phone && open && (
        <MenuInPlace label={label} testId={testId} back={back} onBack={goBack}>
          {rows}
        </MenuInPlace>
      )}
    </>
  )
}

/**
 * A row's short menu in the place of the menu the row is in, as a phone shows it: a back row naming
 * the row, then the short menu's rows. Every other piece of the menu hides while it shows (globals.css
 * hides what in a `data-menu` neither is the `data-menu-in-place` nor holds it). It takes the focus
 * at its back row as it opens, so a greyed first row doesn't say why unasked; the back row, the arrow
 * back and Esc go back, Esc through the menu's own (`useBackInPlace`) once a greyed row's tooltip
 * that shows has closed.
 */
function MenuInPlace({
  label,
  testId,
  back,
  onBack,
  children,
}: {
  label: string
  testId: string
  /** The arrow key that goes back: the one towards the page's start. */
  back: string
  onBack: () => void
  children: ReactNode
}) {
  const b = useMessages().editor.bar
  const backRow = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => backRow.current?.focus(), [])
  useBackInPlace(onBack)
  return (
    <div
      data-menu-in-place
      role="group"
      aria-label={label}
      onKeyDown={backKeys(back, onBack)}
      className="flex flex-col"
    >
      <button
        ref={backRow}
        type="button"
        data-testid={`more-${testId}-back`}
        aria-label={format(b.backFrom, { menu: label })}
        onClick={onBack}
        className={cn(MENU_ITEM, 'justify-start gap-1.5')}
      >
        <CaretLeftIcon size={12} weight="bold" aria-hidden className="text-subtle rtl:-scale-x-100" />
        {label}
      </button>
      <div className={MENU_DIVIDER} />
      <div data-testid={`more-${testId}-menu`} className="flex flex-col">
        {children}
      </div>
    </div>
  )
}
