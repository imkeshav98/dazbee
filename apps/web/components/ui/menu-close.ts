'use client'

// How a pop-up opened from its own button closes, as Share's forms and the account menu do: on Esc or
// a press outside it. While it is open it stands over the edit panel, the bar's second row and the
// stage's selection, so Esc closes it before them, and closes the menu opened last before one opened
// earlier; a pop-up opened over it, with the focus in it, closes before it.
import { useEffect, useEffectEvent, useRef } from 'react'

/** The attribute that marks what stands over the edit panel, the bar's second row and the selection. */
const MARK = 'data-over-panel'
/** What stands over the edit panel, the bar's second row and the selection, so Esc closes it first. */
export const OVER_PANEL = `[${MARK}]`

/** Where a pop-up drawn over the page sits, as Radix draws the editor's. */
const POP_UP = '[data-radix-popper-content-wrapper]'

/** The menus open now, the one opened last at the end. */
const shown: object[] = []

/**
 * Closes a menu on Esc or a press outside `box`, which holds its `button` and the menu. Esc is the
 * menu's before anything under it, unless a pop-up with the focus in it, or a list open in the menu,
 * as a select's, takes it to close first; it gives the focus back to the button when it was in the
 * menu, or nowhere. `overPanelMark` goes on `box`, marking it as standing over the panel while
 * the menu is open.
 */
export function useMenuClose(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const onClose = useEffectEvent(close)
  useEffect(() => {
    if (!open) return
    const menu = {}
    shown.push(menu)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || shown.at(-1) !== menu) return
      const at = document.activeElement
      const inMenu = at !== null && box.current?.contains(at) === true
      if (inPopUp(at) || (inMenu && at !== button.current && at.getAttribute('aria-expanded') === 'true')) return
      event.stopImmediatePropagation()
      event.preventDefault()
      if (inMenu || !at || at === document.body) button.current?.focus()
      onClose()
    }
    const onPress = (event: PointerEvent) => !box.current?.contains(event.target as Node) && onClose()
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPress)
    return () => {
      shown.splice(shown.indexOf(menu), 1)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPress)
    }
  }, [open])
  return { box, button, overPanelMark: { [MARK]: open ? '' : undefined } }
}

/** Whether the focus is in a pop-up drawn over the page, which closes first, on its own Esc. */
export function inPopUp(at: Element | null) {
  return at?.closest(POP_UP) != null
}
