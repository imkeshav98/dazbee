'use client'

// The selected layers' own actions, one list for the small menu's ⋯ (the full menu) and the
// right-click menu: Copy ▸ and Paste ▸ (the layers or their style), duplicate, Copy to other frames ▸
// (style, text or the layer, into the linked frames); order and line up with the frame as menus
// beside their rows, and the turn; box, mask (or release the mask a layer is under); text
// direction; and, at the bottom, lock, hide and delete in all frames, acting on the layers and
// their linked copies. Every row runs the same editor action as its shortcut. An item that never
// applies is left out; one with nothing to do is greyed, its tooltip saying why. A right-click on
// empty canvas offers to show the hidden layers of the frame there, or of the one nearest it
// outside every frame, when it has some.
import { CaretRightIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { type ReactNode, useEffect, useState } from 'react'

import { childrenOf, descendants } from '@dazbee/doc'
import { type Editor, type Frame, type Point, type ShortcutAction, visibleIn } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { ALIGN, keyOf } from '@/components/editor/arrange-actions.ts'
import { RotationField } from '@/components/editor/edit-panel/position-panel.tsx'
import { set, shared, useTarget } from '@/components/editor/edit-panel/target.ts'
import { useEditState, usePhone } from '@/components/editor/edit-store.ts'
import { useSelection } from '@/components/editor/editor-hooks.ts'
import {
  ICON_BUTTON,
  MENU,
  MENU_DIVIDER,
  MENU_HEADING,
  MENU_ITEM,
  MENU_ITEM_GREYED,
  MENU_KEY,
} from '@/components/editor/styles.ts'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf, format, type Messages } from '@/lib/i18n/index.ts'

import { useMenuFocus, useScrollingMenu } from './bar-popover.tsx'

/** The layers hidden in one frame, which a right-click on its empty canvas offers to show. */
export interface HiddenLayers {
  ids: string[]
  frameId: string
}

/** Why an item has nothing to do: the reason the linked-copy items give, by its message. */
type Why = keyof Messages['editor']['bar']['linked']['why']

/** The four moves along the stack: to the front, forward, backward, to the back. */
export const ORDER = ['bringToFront', 'bringForward', 'sendBackward', 'sendToBack'] as const

/**
 * The layers hidden in the frame at a client point, or outside every frame in the one nearest it;
 * null when that frame has none.
 */
export function hiddenAt(editor: Editor, client: Point): HiddenLayers | null {
  const spot = editor.spotAt(client)
  const frame = editor.frames().find((f) => f.id === spot?.frameId) ?? nearestFrame(editor, client)
  if (!frame) return null
  const design = editor.design()
  const ids = descendants(design, frame.id).filter((id) => !visibleIn(design, id))
  return ids.length > 0 ? { ids, frameId: frame.id } : null
}

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

/** The frame nearest a client point, by the distance from the point to its edges on screen. */
function nearestFrame(editor: Editor, client: Point) {
  let nearest: { frame: Frame; far: number } | null = null
  for (const frame of editor.frames()) {
    const a = editor.screenPoint(0, 0, frame.id)
    const b = editor.screenPoint(frame.width, frame.height, frame.id)
    const dx = Math.max(Math.min(a.x, b.x) - client.x, 0, client.x - Math.max(a.x, b.x))
    const dy = Math.max(Math.min(a.y, b.y) - client.y, 0, client.y - Math.max(a.y, b.y))
    const far = Math.hypot(dx, dy)
    if (!nearest || far < nearest.far) nearest = { frame, far }
  }
  return nearest?.frame ?? null
}

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
  const masks = target.props.every((pr) => Boolean(pr.mask))
  const over = masksOver(design, target.ids)
  const sized = target.types.every((type) => type !== 'group' && type !== 'boolean')
  const texts = target.types.every((type) => type === 'text')
  const direction = shared(target.props.map((pr) => (pr.direction ?? 'auto') as 'auto' | 'ltr' | 'rtl'))
  const linked = editor.linkedMenu()
  if (!linked) return null
  const l = b.linked
  /** What an item says while it has nothing to do, or null while it has something to do. */
  const whyOf = (state: Why | 'ready' | 'hidden') => (state === 'ready' || state === 'hidden' ? null : l.why[state])
  /** A row that runs a style or linked-copy action, greyed with the reason while it has nothing to do. */
  const linkedRow = (action: ShortcutAction, label: string, why: string | null, danger = false) => (
    <Row
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
        <Row
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
        <Row
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
      {linked.frames === 0 ? (
        <Row action="copyToFrames" label={l.copyToFrames} keys="" why={l.why.noFrames} caret />
      ) : (
        <SubMenu
          label={l.copyToFrames}
          testId="copy-to-frames"
          heading={linked.reach === 1 ? l.toFrame : format(l.toFrames, { n: linked.reach })}
        >
          {linkedRow('styleToLinked', l.style, whyOf(linked.style))}
          {linked.text !== 'hidden' && linkedRow('textToLinked', l.text, whyOf(linked.text))}
          {linkedRow('layerToLinked', l.layer, whyOf(linked.layer))}
        </SubMenu>
      )}
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
        // On a phone the turn field is as tall as a row, a touch target a finger can hit.
        <div className="px-1.5 py-1 max-sm:[&_[data-scrub]]:min-h-[44px]">
          <RotationField target={target} p={p} />
        </div>
      )}
      <div className={MENU_DIVIDER} />
      {row('boxSelection', b.putInBox)}
      {over ? (
        <button
          type="button"
          data-action="releaseMask"
          disabled={over.some((id) => design.nodes[id]?.lock?.style)}
          onClick={() => {
            // The mask becomes a layer of its own again, in one undo step.
            editor.session.run('node.mask', { ids: over, mask: null })
            onDone()
          }}
          className={MENU_ITEM}
        >
          {b.releaseMask}
        </button>
      ) : (
        row('mask', t.editor.arrange.mask, masks)
      )}
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
                  set(target, () => ({ direction: to }))
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
      <div className={MENU_DIVIDER} />
      {linkedRow('lockLinked', linked.lock === 'lock' ? l.lockAll : l.unlockAll, null)}
      {linkedRow('hideLinked', linked.hide === 'hide' ? l.hideAll : l.showAll, null)}
      {linkedRow('deleteLinked', l.deleteAll, whyOf(linked.delete), true)}
    </>
  )
}

/**
 * The layer actions at a right-click on the stage, for what it picked, or Show hidden layers at one
 * on empty canvas; it closes once the selection changes.
 */
export function StageMenu({
  editor,
  at,
  hidden,
  onClose,
}: {
  editor: Editor
  at: { x: number; y: number }
  /** The hidden layers of the frame right-clicked, or nearest the right-click, where nothing was picked. */
  hidden: HiddenLayers | null
  onClose: () => void
}) {
  const t = useMessages()
  const b = t.editor.bar
  const ids = useSelection(editor)
  const { barBottom } = useEditState()
  const scroll = useScrollingMenu()
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
          aria-label={hidden ? b.canvasMenu : b.actions}
          data-testid="stage-menu"
          ref={scroll.ref}
          onScroll={scroll.onScroll}
          className={cn(
            MENU,
            hidden ? 'min-w-52' : 'max-h-[var(--radix-popover-content-available-height)] w-80 overflow-y-auto',
            scroll.className,
          )}
        >
          {hidden ? (
            <button
              type="button"
              data-action="showHidden"
              onClick={() => {
                editor.setHidden(hidden.ids, false)
                onClose()
              }}
              className={MENU_ITEM}
            >
              {b.showHidden}
            </button>
          ) : (
            <LayerActions editor={editor} ids={ids} onDone={onClose} />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
 * A row of the menu that opens a short menu beside it, or under it on a phone, where the screen has
 * no room beside the menu: Enter or the arrow towards it opens it, the arrow back or Esc closes it.
 */
function SubMenu({
  label,
  testId,
  heading,
  children,
}: {
  label: string
  testId: string
  /** A short line over its rows saying what they act on. */
  heading?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const phone = usePhone()
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
          side={phone ? 'bottom' : rtl ? 'left' : 'right'}
          align="start"
          sideOffset={phone ? 4 : 8}
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
          {heading && <p className={MENU_HEADING}>{heading}</p>}
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * A row of the menu that runs an action, its key at the end. While it has nothing to do it is
 * greyed, and says why in a tooltip under the pointer, on keyboard focus and on a tap.
 */
function Row({
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
