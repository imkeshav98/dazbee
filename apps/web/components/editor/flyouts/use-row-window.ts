import { type RefObject, useCallback, useLayoutEffect, useState } from 'react'

import { LAYER_ROW } from './tree-row.tsx'

/** Rows rendered beyond each edge of the view, so a fast scroll never shows a gap. */
const OVERSCAN = 8

export function useRowWindow(scroller: RefObject<HTMLDivElement | null>) {
  // Kept in rows, not pixels: a scroll that shows no new row renders nothing.
  const [view, setView] = useState({ from: 0, to: Math.ceil(400 / LAYER_ROW) + OVERSCAN })
  const follow = useCallback((el: HTMLElement) => {
    const from = Math.max(0, Math.floor(el.scrollTop / LAYER_ROW) - OVERSCAN)
    const to = Math.ceil((el.scrollTop + el.clientHeight) / LAYER_ROW) + OVERSCAN
    setView((now) => (now.from === from && now.to === to ? now : { from, to }))
  }, [])
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    follow(el)
    const observer = new ResizeObserver(() => follow(el))
    observer.observe(el)
    return () => observer.disconnect()
  }, [follow])
  return { view, follow }
}

/** Scrolls a list of rows the least that shows the row at `at` whole. */
export function scrollToRow(el: HTMLElement, at: number) {
  const top = at * LAYER_ROW
  if (top < el.scrollTop) el.scrollTop = top
  else if (top + LAYER_ROW > el.scrollTop + el.clientHeight) el.scrollTop = top + LAYER_ROW - el.clientHeight
}
