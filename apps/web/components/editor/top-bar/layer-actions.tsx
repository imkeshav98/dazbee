'use client'

// The selected layers' own actions, one list for the small menu's ⋯ (the full menu) and the
// right-click menu: Copy ▸ and Paste ▸ (the layers or their style), duplicate, Copy to other frames ▸
// (style, text or the layer, into the linked frames); box, ungroup for a group or a box, mask (or
// release the mask a layer is under); and, at the bottom, lock, hide and delete in all frames, acting
// on the layers and their linked copies. Every row runs the same editor action as its shortcut. An
// item that never applies is left out; one with nothing to do is greyed, its tooltip saying why. How
// the layers sit (order, line up, the turn, text direction) is in the top bar's Arrange ⋯.
import { CaretRightIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { type ReactNode, useLayoutEffect, useState } from 'react'

import { childrenOf } from '@dazbee/doc'
import type { Editor, ShortcutAction } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { keyOf } from '@/components/editor/arrange-actions.ts'
import { useTarget } from '@/components/editor/edit-panel/target.ts'
import { usePhone } from '@/components/editor/edit-store.ts'
import { MENU, MENU_DIVIDER, MENU_HEADING, MENU_ITEM, MENU_KEY } from '@/components/editor/styles.ts'
import { cn } from '@/lib/cn.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf, format, type Messages } from '@/lib/i18n/index.ts'

import { arrowThrough, SHEET_EDGE, useMenuFocus } from './bar-popover.tsx'
import { MenuRow } from './menu-row.tsx'

/** Why an item has nothing to do: the reason the linked-copy items give, by its message. */
type Why = keyof Messages['editor']['bar']['linked']['why']

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
 * The layers' own actions in short groups with only what applies. Copy fires the same copy event as
 * the keyboard's, so the clipboard and the copy kept for Paste both change; Paste places the layers
 * last copied in Dazbee.
 */
export function LayerActions({ editor, ids, onDone }: { editor: Editor; ids: string[]; onDone: () => void }) {
  const t = useMessages()
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
  const masks = target.props.every((pr) => Boolean(pr.mask))
  const over = masksOver(design, target.ids)
  const linked = editor.linkedMenu()
  if (!linked) return null
  const l = b.linked
  /** What an item says while it has nothing to do, or null while it has something to do. */
  const whyOf = (state: Why | 'ready' | 'hidden') => (state === 'ready' || state === 'hidden' ? null : l.why[state])
  /** A row that runs a style or linked-copy action, greyed with the reason while it has nothing to do. */
  const linkedRow = (action: ShortcutAction, label: string, why: string | null, danger = false) => (
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
        {linkedRow('copyStyle', l.copyStyle, whyOf(linked.copyStyle))}
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
        {linkedRow('pasteStyle', l.pasteStyle, whyOf(linked.pasteStyle))}
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
          {linkedRow('styleToLinked', l.style, whyOf(linked.style))}
          {linked.text !== 'hidden' && linkedRow('textToLinked', l.text, whyOf(linked.text))}
          {linkedRow('layerToLinked', l.layer, whyOf(linked.layer))}
        </SubMenu>
      )}
      <div className={MENU_DIVIDER} />
      {row('boxSelection', b.putInBox)}
      {target.types.every((type) => type === 'group' || type === 'box') && row('ungroup', t.editor.arrange.ungroup)}
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
      {linkedRow('lockLinked', linked.lock === 'lock' ? l.lockAll : l.unlockAll, null)}
      {linkedRow('hideLinked', linked.hide === 'hide' ? l.hideAll : l.showAll, null)}
      {linkedRow('deleteLinked', l.deleteAll, whyOf(linked.delete), true)}
    </>
  )
}

/**
 * A row of the menu that opens a short menu beside it; on a phone, where the screen has no room
 * beside the menu, the short menu lies on its row instead, sharing the menu's start edge. Enter or
 * the arrow towards it opens it, the arrow back or Esc closes it; up, down, Home and End move
 * between its rows, and the row stays lit while it is open.
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
  // On a phone, how far the short menu moves to lie on its row at the start edge of the menu the
  // row is in: up by the row's height, and back by the row's inset from that edge.
  const [over, setOver] = useState({ up: 0, back: 0 })
  const rtl = dirOf(useLocale()) === 'rtl'
  const [toward, back] = rtl ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']
  const focus = useMenuFocus()
  useLayoutEffect(() => {
    const row = focus.button.current
    const menu = row?.parentElement
    if (!phone || !open || !row || !menu) return
    const [at, edge] = [row.getBoundingClientRect(), menu.getBoundingClientRect()]
    const to = { up: Math.round(at.height), back: Math.round(rtl ? edge.right - at.right : at.left - edge.left) }
    setOver((now) => (now.up === to.up && now.back === to.back ? now : to))
  }, [phone, open, focus.button, rtl])
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
          // Lit with the hover tint while the menu beside it is open.
          className={cn(MENU_ITEM, 'data-[state=open]:bg-hover data-[state=open]:lit')}
        >
          {label}
          <CaretRightIcon size={12} weight="bold" aria-hidden className="text-subtle rtl:-scale-x-100" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          // Beside the row, or on a phone over it at its menu's start edge, as the mock draws it.
          side={phone ? 'bottom' : rtl ? 'left' : 'right'}
          align="start"
          sideOffset={phone ? -over.up : 8}
          alignOffset={phone ? -over.back : 0}
          collisionPadding={phone ? SHEET_EDGE : 12}
          // A click elsewhere, Esc or the arrow back closes it; focus moving as the menu opens does not.
          onFocusOutside={(event) => event.preventDefault()}
          {...focus.content}
          aria-label={label}
          data-testid={`more-${testId}-menu`}
          onKeyDown={(event) => {
            if (event.key !== back) return arrowThrough(event)
            event.preventDefault()
            setOpen(false)
          }}
          style={wide ? { width: WIDE_MENU } : undefined}
          className={cn(MENU, !wide && 'min-w-52')}
        >
          {focus.back}
          {heading && <p className={MENU_HEADING}>{heading}</p>}
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
