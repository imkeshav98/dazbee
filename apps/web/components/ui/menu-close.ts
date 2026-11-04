'use client'

import { useEffect, useEffectEvent, useRef } from 'react'

export function useMenuClose(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const onClose = useEffectEvent(close)
  // Closes on Escape or a press outside. Esc is the menu's or form's before anything under them,
  // the edit panel and the stage's selection included, unless a list open in the form, as a
  // select's, takes it to close first. It gives the focus back to Share when it was in them, or nowhere.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const at = document.activeElement
      if (at !== button.current && at?.getAttribute('aria-expanded') === 'true') return
      event.stopImmediatePropagation()
      event.preventDefault()
      if (!at || at === document.body || box.current?.contains(at)) button.current?.focus()
      onClose()
    }
    const onPress = (event: PointerEvent) => !box.current?.contains(event.target as Node) && onClose()
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPress)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPress)
    }
  }, [open])
  return { box, button }
}
