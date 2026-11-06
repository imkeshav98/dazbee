'use client'

// The small menu by the selection: lock, duplicate, delete and hide, which act on the selected
// layers in their own frame and never on their linked copies, and ⋯ for the full menu. Delete is
// greyed, saying why, on a layer locked against deleting. The menu sits above the selection, below
// it when the place above is covered, as by a frame's label, and under the top bar when there is
// room neither side, as when the selection fills the stage; only then does it move sideways, never
// off the selection (small-menu-place). It keeps off the top bar, the edit panel, the rail and its
// flyout, the bottom controls and the frames' labels, and hides while a gesture runs, a top bar
// pop-up or the right-click menu is open, or the selection is off the stage. ⋯ opens the full menu
// beside it, clear of the rail and its flyout, or on a phone as the sheet at the bottom of the
// screen, while the small menu hides.
import {
  CopyIcon,
  DotsThreeIcon,
  EyeIcon,
  EyeSlashIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useState } from 'react'

import type { Editor } from '@dazbee/editor'

import { keyOf } from '@/components/editor/arrange-actions.ts'
import { useTarget } from '@/components/editor/edit-panel/target.ts'
import { editState, isPanel, setOpen, useEditState } from '@/components/editor/edit-store.ts'
import { useSelection } from '@/components/editor/editor-hooks.ts'
import { BAR_BUTTON, BAR_TOGGLE } from '@/components/editor/styles.ts'
import { MENU_ITEM_GREYED } from '@/components/ui/looks.ts'
import { Menu, type MenuPlace, WIDE_MENU } from '@/components/ui/menu.tsx'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { type Box, CLEAR, smallMenuPlace } from '@/lib/editor/small-menu-place.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'
import { dirOf, format } from '@/lib/i18n/index.ts'
import { usePhone } from '@/lib/phone.ts'

import { arrowAlong, useRovingTab } from './bar-popover.tsx'
import { LayerActions } from './layer-actions.tsx'

type Place = { left: number; top: number }
/**
 * Where the full menu opens: beside the small menu on its end or start side, or under it; how far
 * from the window's start edge it keeps, past the rail and its open flyout; and where it lies from ⋯.
 */
type FullMenuPlace = {
  side: 'end' | 'start' | 'under'
  startInset: number
  /** How far the small menu reaches past ⋯ on the side the menu opens, in pixels. */
  beside: number
  /** How far along that side the menu's start lies from ⋯'s, in pixels. */
  along: number
}

/** Pixels between the small menu and the full menu. */
const MENU_GAP = 8
/**
 * A round button of the pill, its focus ring drawn inside it so the ring stays inside the pill;
 * important, as the app's own focus ring sits outside every control.
 */
const PILL_BUTTON = 'rounded-full px-1.5 focus-visible:outline-offset-[-2px]!'

/** The element's box in the window, or null while it doesn't show. */
function shownBox(el: Element | null): DOMRect | null {
  const box = el?.getBoundingClientRect()
  if (!el || !box || box.width === 0 || box.height === 0 || getComputedStyle(el).visibility === 'hidden') return null
  return box
}

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
    '[data-testid="island-start"]',
    '[data-testid="island-end"]',
    '[data-toasts] > *',
    '.stage-overlay .frame-label',
  ]
  return selectors
    .flatMap((selector) => [...document.querySelectorAll(selector)])
    .flatMap((el) => {
      const box = shownBox(el)
      if (!box) return []
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
      // Under the top bar comes the bar's second row, then this.
      const under = editState().barBottom + CLEAR
      const at = smallMenuPlace({ rect, width, height, room, blocked, floor, under })
      setPlace((now) => (now === at || (now && at && now.left === at.left && now.top === at.top) ? now : at))
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

/**
 * Where the full menu opens on tablet and desktop: beside the small menu on its end side when there
 * is room for it and the widest menu beside its rows, else on its start side, kept off the rail and
 * its open flyout; under it, centred, when neither side has room. Under it, the menu keeps off the
 * flyout only when the room past the flyout holds it, and off the rail always. It hangs from ⋯
 * (`more`), so each place is measured from ⋯ to the small menu's edges. Measured once the full menu
 * shows, and again as the small menu, the flyout or the window changes; a phone shows it as a sheet.
 */
function useFullMenuPlace(
  menu: HTMLElement | null,
  more: HTMLElement | null,
  shown: boolean,
  place: Place | null,
  phone: boolean,
  rtl: boolean,
): MenuPlace {
  const [at, setAt] = useState<FullMenuPlace>({ side: 'end', startInset: CLEAR, beside: 0, along: 0 })
  const { flyoutEnd, barBottom } = useEditState()
  // Bumped while the full menu is shown but not yet in the page: its portal puts it there a render later.
  const [looked, setLooked] = useState(0)
  useLayoutEffect(() => {
    if (!menu || !more || !shown || phone) return
    const content = document.querySelector<HTMLElement>('[data-testid="bar-more-menu"]')
    if (!content) {
      const frame = requestAnimationFrame(() => setLooked((n) => n + 1))
      return () => cancelAnimationFrame(frame)
    }
    const update = () => {
      const width = document.documentElement.clientWidth
      const reach = (selector: string) => {
        const box = shownBox(document.querySelector(selector))
        return box ? Math.round(rtl ? width - box.left : box.right) + CLEAR : CLEAR
      }
      const rail = reach('[data-testid="rail"]')
      const past = Math.max(rail, reach('#editor-flyout'))
      const anchor = menu.getBoundingClientRect()
      const dots = more.getBoundingClientRect()
      const need = content.offsetWidth + MENU_GAP
      // Beside it on its end side only with room for the widest menu beside its rows too, which opens that way.
      const endRoom = (rtl ? anchor.left - CLEAR : width - CLEAR - anchor.right) - WIDE_MENU - MENU_GAP
      const startRoom = rtl ? width - past - anchor.right : anchor.left - past
      const side = endRoom >= need ? 'end' : startRoom >= need ? 'start' : 'under'
      const startInset = side !== 'under' || width - CLEAR - past >= content.offsetWidth ? past : rail
      // From ⋯ to the small menu's edge the menu opens past, and along it to where the menu lines up.
      const [left, right] = [dots.left - anchor.left, anchor.right - dots.right]
      const beside = side === 'under' ? anchor.bottom - dots.bottom : (side === 'end') !== rtl ? right : left
      const along =
        side === 'under'
          ? Math.round(anchor.left - dots.left + (anchor.width - content.offsetWidth) / 2)
          : anchor.top - dots.top
      setAt((now) =>
        now.side === side && now.startInset === startInset && now.beside === beside && now.along === along
          ? now
          : { side, startInset, beside, along },
      )
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [menu, more, shown, place, phone, rtl, flyoutEnd, looked])
  const under = at.side === 'under'
  // Wholly inside the room between the top bar, the bottom controls and the rail with its flyout,
  // even moving off ⋯.
  return {
    side: under ? 'bottom' : rtl !== (at.side === 'start') ? 'left' : 'right',
    align: 'start',
    sideOffset: MENU_GAP + at.beside,
    alignOffset: at.along,
    sticky: 'always',
    collisionPadding: {
      top: barBottom + 8,
      bottom: 72,
      left: rtl ? CLEAR : at.startInset,
      right: rtl ? at.startInset : CLEAR,
    },
  }
}

export function SmallMenu({ editor, rightClick }: { editor: Editor; rightClick: boolean }) {
  const t = useMessages()
  const b = t.editor.bar
  const ids = useSelection(editor)
  const selected = useTarget(editor, ids)
  const [menu, setMenu] = useState<HTMLDivElement | null>(null)
  const place = usePlace(editor, menu, rightClick)
  const { open } = useEditState()
  const [more, setMore] = useState<HTMLButtonElement | null>(null)
  const rtl = dirOf(useLocale()) === 'rtl'
  const phone = usePhone()
  const focused = useRovingTab(menu)
  const fullMenu = useFullMenuPlace(menu, more, open === 'more', place, phone, rtl)
  const [toldWhy, setToldWhy] = useState(false)
  if (!selected) return null
  const { target, design } = selected
  // Delete does nothing to a layer locked against deleting, or holding one: it is greyed, saying so.
  const undeletable = editor.linkedMenu()?.delete !== 'ready' ? b.linked.why.selectionLocked : null
  const locked = target.ids.every((id) => {
    const lock = design.nodes[id]?.lock
    return Boolean(lock && Object.values(lock).some(Boolean))
  })
  const hidden = target.props.every((props) => props.visible === false)
  const withKey = (label: string, action: Parameters<typeof keyOf>[0]) =>
    format(t.editor.arrange.withKey, { label, key: keyOf(action) })
  // On a phone the full menu is a sheet, and the small menu hides while it shows, as the mock draws it.
  const sheet = phone && open === 'more'
  return (
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
        place && !sheet ? 'visible' : 'invisible',
      )}
    >
      <button
        type="button"
        data-bar-item
        data-testid="small-lock"
        aria-label={locked ? b.unlock : b.lock}
        title={withKey(locked ? b.unlock : b.lock, 'lock')}
        aria-pressed={locked}
        onClick={() => editor.setLocked(target.ids, !locked)}
        className={cn(BAR_TOGGLE, PILL_BUTTON)}
      >
        {locked ? <LockSimpleIcon size={16} weight="fill" aria-hidden /> : <LockSimpleOpenIcon size={16} aria-hidden />}
      </button>
      <button
        type="button"
        data-bar-item
        data-testid="small-duplicate"
        aria-label={t.editor.arrange.duplicate}
        title={withKey(t.editor.arrange.duplicate, 'duplicate')}
        onClick={() => editor.perform('duplicate')}
        className={cn(BAR_BUTTON, PILL_BUTTON)}
      >
        <CopyIcon size={16} aria-hidden />
      </button>
      {undeletable ? (
        <Tooltip label={undeletable} open={toldWhy} onOpenChange={setToldWhy}>
          <button
            type="button"
            data-bar-item
            data-testid="small-delete"
            aria-label={b.delete}
            aria-disabled="true"
            aria-description={undeletable}
            // A tap shows why, as the pointer resting on it does.
            onClick={(event) => {
              event.preventDefault()
              setToldWhy(true)
            }}
            className={cn(BAR_BUTTON, PILL_BUTTON, MENU_ITEM_GREYED)}
          >
            <TrashIcon size={16} aria-hidden />
          </button>
        </Tooltip>
      ) : (
        <button
          type="button"
          data-bar-item
          data-testid="small-delete"
          aria-label={b.delete}
          title={withKey(b.delete, 'delete')}
          onClick={() => editor.perform('delete')}
          className={cn(BAR_BUTTON, PILL_BUTTON)}
        >
          <TrashIcon size={16} aria-hidden />
        </button>
      )}
      <button
        type="button"
        data-bar-item
        data-testid="small-hide"
        aria-label={hidden ? b.show : b.hide}
        title={withKey(hidden ? b.show : b.hide, 'hide')}
        aria-pressed={hidden}
        onClick={() => editor.setHidden(target.ids, !hidden)}
        className={cn(BAR_TOGGLE, PILL_BUTTON)}
      >
        {hidden ? <EyeSlashIcon size={16} weight="fill" aria-hidden /> : <EyeIcon size={16} aria-hidden />}
      </button>
      <Menu
        trigger={
          <button
            ref={setMore}
            type="button"
            data-bar-item
            aria-label={b.more}
            title={b.more}
            data-testid="bar-more"
            className={cn(BAR_BUTTON, PILL_BUTTON)}
          >
            <DotsThreeIcon size={18} weight="bold" aria-hidden />
          </button>
        }
        open={open === 'more'}
        onOpenChange={(to) => {
          // A row that opened something else keeps it open.
          if (to) setOpen('more')
          else if (editState().open === 'more') setOpen(null)
        }}
        label={b.more}
        testId="bar-more-menu"
        sheet
        place={fullMenu}
        className="w-80"
      >
        <LayerActions editor={editor} ids={ids} onDone={() => setOpen(null)} />
      </Menu>
    </div>
  )
}
