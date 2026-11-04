'use client'
// Scrolling areas draw their bars with OverlayScrollbars: a slim bar over the content that shows while
// the area scrolls or the pointer is over it, and widens under the pointer (the look is .os-theme-dazbee
// in globals.css). An area asked to keep its bar shown shows it whenever it can scroll, as on a phone,
// where no pointer hovers to bring it up. The area stays its own viewport, so its children, scroll
// events and scrollTop are those of a plain scrolling element.
import { OverlayScrollbars, type PartialOptions } from 'overlayscrollbars'
import { type RefObject, useCallback, useEffect } from 'react'

const OPTIONS: PartialOptions = {
  scrollbars: { theme: 'os-theme-dazbee', autoHide: 'leave', autoHideDelay: 800, clickScroll: true },
}
const SHOWN: PartialOptions = { scrollbars: { ...OPTIONS.scrollbars, autoHide: 'never' } }

/**
 * A ref callback that gives the element overlay bars, and takes them away when it unmounts; with
 * `shown`, the bar shows whenever the element can scroll.
 */
export function overlayScroll(element: HTMLElement | null, { shown = false }: { shown?: boolean } = {}) {
  if (!element) return
  const bars = OverlayScrollbars({ target: element, elements: { viewport: element } }, shown ? SHOWN : OPTIONS)
  return () => bars.destroy()
}

/** The same ref callback for an element that has a ref of its own, which it keeps filled. */
export function useOverlayScroll<T extends HTMLElement>(ref: RefObject<T | null>, { shown = false } = {}) {
  return useCallback(
    (element: T | null) => {
      ref.current = element
      const off = overlayScroll(element, { shown })
      return () => {
        off?.()
        ref.current = null
      }
    },
    [ref, shown],
  )
}

/** Gives the page itself overlay bars, without moving the body's children. */
export function PageScroll() {
  useEffect(() => {
    const bars = OverlayScrollbars({ target: document.body, elements: { viewport: document.body } }, OPTIONS)
    return () => bars.destroy()
  }, [])
  return null
}
