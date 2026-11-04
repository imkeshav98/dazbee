'use client'

import { type RefObject, useLayoutEffect, useState } from 'react'

/**
 * Whether a scrolling body has been scrolled down from its top, and whether more of it is below:
 * the panel then draws a line under its title, and fades its last lines out.
 */
export function useScrollEdges(body: RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ down: false, more: false })
  const measure = () => {
    const el = body.current
    if (!el) return
    const next = { down: el.scrollTop > 0, more: el.scrollTop + el.clientHeight < el.scrollHeight - 1 }
    setEdges((now) => (now.down === next.down && now.more === next.more ? now : next))
  }
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    for (const child of el.children) watch.observe(child)
    return () => watch.disconnect()
  })
  return { ...edges, measure }
}
