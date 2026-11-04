'use client'

// The small menu by the selection: lock, duplicate, delete and ⋯, with Group first for several. It
// sits above the selection, below it when there is no room above, and under the top bar when there
// is room neither side, as when the selection fills the stage. It keeps off the top bar, the edit
// panel, the rail and its flyout, the bottom controls and the show-alone chip, and hides while a
// gesture runs, a top bar pop-up or the right-click menu is open, or the selection is off the stage.
// ⋯ opens the full menu beside it.
import {
  CopyIcon,
  DotsThreeIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  SelectionPlusIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { useEffect, useState } from 'react'

import type { Editor } from '@dazbee/editor'

import { keyOf } from '@/components/editor/arrange-actions.ts'
import { useTarget } from '@/components/editor/edit-panel/target.ts'
import { editState, isPanel, setOpen, useEditState, usePhone } from '@/components/editor/edit-store.ts'
import { useSelection } from '@/components/editor/editor-hooks.ts'
import { BAR_BUTTON, BAR_TOGGLE, MENU } from '@/components/editor/styles.ts'
import { cn } from '@/lib/cn.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf, format } from '@/lib/i18n/index.ts'

import { arrowAlong, useMenuFocus, useRovingTab } from './bar-popover.tsx'
import { LayerActions } from './layer-actions.tsx'

type Place = { left: number; top: number }
type Box = { left: number; top: number; right: number; bottom: number }

/** Pixels between the selection and the menu, clear of the turn handles round its corners. */
const GAP = 28
/** Pixels kept between the menu and anything it keeps off. */
const CLEAR = 8

/**
 * `value` kept between `low` and `high`. When `low` is above `high`, as on a phone narrower than the
 * menu, `low` wins, so the menu keeps to the start edge.
 */
const clampInto = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high))
const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** The pieces of chrome the menu keeps off, in the stage's pixels: what shows of them now. */
function obstacles(stage: HTMLElement): Box[] {
  const origin = stage.getBoundingClientRect()
  const selectors = [
    '[data-testid="top-bar-row"]',
    '[data-testid="top-bar-overflow"]:not(.invisible)',
    '#edit-panel',
    '[data-testid="rail"]',
    '#editor-flyout',
    '[data-dock]',
    '[data-zoom]',
    '[data-testid="focus-chip"]',
    '[data-testid="island-start"]',
    '[data-testid="island-end"]',
    '[data-toasts] > *',
  ]
  return selectors
    .flatMap((selector) => [...document.querySelectorAll(selector)])
    .flatMap((el) => {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0 || getComputedStyle(el).visibility === 'hidden') return []
      return [
        {
          left: box.left - origin.left - CLEAR,
          top: box.top - origin.top - CLEAR,
          right: box.right - origin.left + CLEAR,
          bottom: box.bottom - origin.top + CLEAR,
        },
      ]
    })
}

/**
 * Where the menu goes, or null while it keeps out of the way. Above the selection, else below it,
 * else under the top bar; each place moves sideways off what it would cover, and the first that
 * covers nothing wins.
 */
function usePlace(editor: Editor, menu: HTMLElement | null, rightClick: boolean): Place | null {
  const [place, setPlace] = useState<Place | null>(null)
  const { open, barBottom, sheetTop, flyoutEnd } = useEditState()
  const popup = open !== null && open !== 'more' && !isPanel(open)
  useEffect(() => {
    if (!menu) {
      setPlace(null)
      return
    }
    let frame = 0
    const update = () => {
      const rect = editor.selectionRect()
      const stage = menu.offsetParent as HTMLElement | null
      if (!rect || editor.busy() || !stage || popup || rightClick) return setPlace(null)
      const room = { width: stage.clientWidth, height: stage.clientHeight }
      if (rect.x + rect.width < 0 || rect.x > room.width || rect.y + rect.height < 0 || rect.y > room.height)
        return setPlace(null)
      const width = menu.offsetWidth
      const height = menu.offsetHeight
      const blocked = obstacles(stage)
      const floor = (sheetTop ?? room.height) - CLEAR
      const centre = rect.x + rect.width / 2 - width / 2
      // Under the top bar comes the bar's second row, then the show-alone chip, then this.
      const chip = document.querySelector('[data-testid="focus-chip"]')?.getBoundingClientRect()
      const chipBottom = chip && chip.height > 0 ? chip.bottom - stage.getBoundingClientRect().top + CLEAR : 0
      const under = Math.max(editState().barBottom + CLEAR, chipBottom)
      for (const wanted of [rect.y - height - GAP, rect.y + rect.height + GAP, under]) {
        const top = Math.round(wanted)
        if (top < 0 || top + height > floor) continue
        // Off whatever it would cover, moving sideways the shorter way; still covering, try the next place.
        let left = clampInto(centre, CLEAR, room.width - width - CLEAR)
        for (let tries = 0; tries < 4; tries++) {
          const box = { left, top, right: left + width, bottom: top + height }
          const hit = blocked.find((b) => meets(box, b))
          if (!hit) break
          const toStart = hit.left - width
          const toEnd = hit.right
          left = clampInto(
            Math.abs(toStart - left) <= Math.abs(toEnd - left) && toStart >= CLEAR ? toStart : toEnd,
            CLEAR,
            room.width - width - CLEAR,
          )
        }
        const box = { left, top, right: left + width, bottom: top + height }
        if (blocked.some((b) => meets(box, b))) continue
        const at = { left: Math.round(left), top }
        return setPlace((now) => (now?.left === at.left && now.top === at.top ? now : at))
      }
      setPlace(null)
    }
    // On the next frame, once the menu shows the buttons for the new selection.
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    // A panel, pop-up or flyout that just opened grows into place (its opening animation is
    // shorter than this); look again once it has.
    const settled = setTimeout(update, 260)
    const stop = editor.onDraw(update)
    const stopSelection = editor.onSelection(later)
    const resize = new ResizeObserver(later)
    resize.observe(menu)
    // A gesture or a text range can end with nothing drawn again: look once the pointer or a key is let go.
    window.addEventListener('pointerup', later)
    window.addEventListener('keyup', later)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(settled)
      stop()
      stopSelection()
      resize.disconnect()
      window.removeEventListener('pointerup', later)
      window.removeEventListener('keyup', later)
    }
  }, [editor, menu, popup, rightClick, barBottom, sheetTop, open, flyoutEnd])
  return place
}

export function SmallMenu({ editor, rightClick }: { editor: Editor; rightClick: boolean }) {
  const t = useMessages()
  const b = t.editor.bar
  const ids = useSelection(editor)
  const selected = useTarget(editor, ids)
  const [menu, setMenu] = useState<HTMLDivElement | null>(null)
  const place = usePlace(editor, menu, rightClick)
  const { open, barBottom } = useEditState()
  const moreFocus = useMenuFocus()
  const rtl = dirOf(useLocale()) === 'rtl'
  const phone = usePhone()
  const focused = useRovingTab(menu)
  if (!selected) return null
  const { target, design } = selected
  const locked = target.ids.every((id) => {
    const lock = design.nodes[id]?.lock
    return Boolean(lock && Object.values(lock).some(Boolean))
  })
  const several = target.ids.length > 1
  const withKey = (label: string, action: Parameters<typeof keyOf>[0]) =>
    format(t.editor.arrange.withKey, { label, key: keyOf(action) })
  return (
    <Popover.Root open={open === 'more'} onOpenChange={(to) => setOpen(to ? 'more' : null)}>
      <Popover.Anchor asChild>
        <div
          ref={setMenu}
          role="toolbar"
          aria-label={b.smallMenu}
          data-testid="small-menu"
          onKeyDown={arrowAlong}
          onFocus={focused}
          style={place ? { left: place.left, top: place.top } : undefined}
          className={cn(
            'absolute z-20 flex items-center gap-0.5 rounded-full surface-frost p-1',
            place ? 'visible' : 'invisible',
          )}
        >
          {several && (
            <button
              type="button"
              data-bar-item
              data-testid="small-group"
              aria-label={t.editor.arrange.group}
              title={withKey(t.editor.arrange.group, 'group')}
              onClick={() => editor.perform('group')}
              className={cn(BAR_BUTTON, 'rounded-full px-1.5')}
            >
              <SelectionPlusIcon size={16} aria-hidden />
            </button>
          )}
          <button
            type="button"
            data-bar-item
            data-testid="small-lock"
            aria-label={locked ? b.unlock : b.lock}
            title={withKey(locked ? b.unlock : b.lock, 'lock')}
            aria-pressed={locked}
            onClick={() => editor.setLocked(target.ids, !locked)}
            className={cn(BAR_TOGGLE, 'rounded-full px-1.5')}
          >
            {locked ? (
              <LockSimpleIcon size={16} weight="fill" aria-hidden />
            ) : (
              <LockSimpleOpenIcon size={16} aria-hidden />
            )}
          </button>
          <button
            type="button"
            data-bar-item
            data-testid="small-duplicate"
            aria-label={t.editor.arrange.duplicate}
            title={withKey(t.editor.arrange.duplicate, 'duplicate')}
            onClick={() => editor.perform('duplicate')}
            className={cn(BAR_BUTTON, 'rounded-full px-1.5')}
          >
            <CopyIcon size={16} aria-hidden />
          </button>
          <button
            type="button"
            data-bar-item
            data-testid="small-delete"
            aria-label={b.delete}
            title={withKey(b.delete, 'delete')}
            onClick={() => editor.perform('delete')}
            className={cn(BAR_BUTTON, 'rounded-full px-1.5')}
          >
            <TrashIcon size={16} aria-hidden />
          </button>
          <Popover.Trigger asChild>
            <button
              ref={moreFocus.button}
              type="button"
              data-bar-item
              aria-label={b.more}
              title={b.more}
              data-testid="bar-more"
              className={cn(BAR_BUTTON, 'rounded-full px-1.5')}
            >
              <DotsThreeIcon size={18} weight="bold" aria-hidden />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              // Beside the small menu, or under it on a phone, kept between the top bar and the bottom controls.
              side={phone ? 'bottom' : rtl ? 'left' : 'right'}
              align={phone ? 'center' : 'start'}
              sideOffset={8}
              // Wholly inside the room between the top bar and the bottom controls, even moving off its button.
              sticky="always"
              collisionPadding={{ top: barBottom + 8, bottom: phone ? 150 : 72, left: 8, right: 8 }}
              {...moreFocus.content}
              aria-label={b.more}
              data-testid="bar-more-menu"
              className={cn(MENU, 'max-h-[var(--radix-popover-content-available-height)] w-80 overflow-y-auto')}
            >
              {moreFocus.back}
              <LayerActions editor={editor} ids={ids} onDone={() => setOpen(null)} />
            </Popover.Content>
          </Popover.Portal>
        </div>
      </Popover.Anchor>
    </Popover.Root>
  )
}
