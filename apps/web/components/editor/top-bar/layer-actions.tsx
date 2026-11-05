'use client'

// The selected layers' own actions, one list for the small menu's ⋯ (the full menu) and the
// right-click menu: copy, paste, duplicate and delete; group, box, mask (or release the mask a layer
// is under) and ungroup; lock and hide. Every row runs the same editor action as its shortcut. How
// the layers sit (order, line up, the turn, text direction) is in the top bar's ⋯.
// A right-click on empty canvas offers to show the hidden layers of the frame there, or of the one
// nearest it outside every frame, when it has some.
import { CaretRightIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react'

import { childrenOf, descendants } from '@dazbee/doc'
import { type Editor, type Frame, type Point, type ShortcutAction, visibleIn } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { keyOf } from '@/components/editor/arrange-actions.ts'
import { useTarget } from '@/components/editor/edit-panel/target.ts'
import { useEditState, usePhone } from '@/components/editor/edit-store.ts'
import { useSelection } from '@/components/editor/editor-hooks.ts'
import { MENU, MENU_DIVIDER, MENU_ITEM, MENU_KEY } from '@/components/editor/styles.ts'
import { cn } from '@/lib/cn.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf } from '@/lib/i18n/index.ts'

import { arrowThrough, useMenuFocus, useScrollingMenu } from './bar-popover.tsx'

/** The layers hidden in one frame, which a right-click on its empty canvas offers to show. */
export interface HiddenLayers {
  ids: string[]
  frameId: string
}

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
  const masks = target.props.every((pr) => Boolean(pr.mask))
  const over = masksOver(design, target.ids)
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
      {ids.length > 1 && row('group', t.editor.arrange.group)}
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
          editor.setHidden(target.ids, !hidden)
          onDone()
        }}
        className={MENU_ITEM}
      >
        {hidden ? b.show : b.hide}
        <kbd className={MENU_KEY}>{keyOf('hide')}</kbd>
      </button>
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

/**
 * A row of the menu that opens a short menu beside it, or under it on a phone, where the screen has
 * no room beside the menu; in a sheet at the bottom of a phone's screen, above the sheet. Enter or
 * the arrow towards it opens it, the arrow back or Esc closes it; up, down, Home and End move
 * between its rows, and the row stays lit while it is open.
 */
export function SubMenu({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const phone = usePhone()
  // In a sheet, how far above the row the short menu sits to clear the sheet's top; null outside one.
  const [overSheet, setOverSheet] = useState<number | null>(null)
  const rtl = dirOf(useLocale()) === 'rtl'
  const [toward, back] = rtl ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']
  const focus = useMenuFocus()
  useLayoutEffect(() => {
    const row = focus.button.current
    const sheet = phone && open ? row?.closest('[data-sheet]') : null
    setOverSheet(
      row && sheet ? Math.round(row.getBoundingClientRect().top - sheet.getBoundingClientRect().top) + 8 : null,
    )
  }, [phone, open, focus.button])
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
          side={overSheet !== null ? 'top' : phone ? 'bottom' : rtl ? 'left' : 'right'}
          align="start"
          sideOffset={overSheet ?? (phone ? 4 : 8)}
          collisionPadding={12}
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
          className={cn(MENU, 'min-w-52')}
        >
          {focus.back}
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
