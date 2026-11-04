'use client'

// Where a scrolling area is cut by its edges, so it can show that it scrolls: the edit panel draws a
// line under its title and fades its last lines, and a menu fades the edges it is cut at.
import { type RefObject, useLayoutEffect, useState } from 'react'

/** Whether a scrolling body has been scrolled down from its top, and whether more of it is below. */
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

/** A scrolling area's cut edges faded out: its end while more is below, its start once scrolled down. */
export function fadedEdges({ down, more }: { down: boolean; more: boolean }) {
  if (down && more)
    return '[mask-image:linear-gradient(to_bottom,transparent,black_28px,black_calc(100%-28px),transparent)]'
  if (more) return '[mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]'
  if (down) return '[mask-image:linear-gradient(to_bottom,transparent,black_28px)]'
  return ''
}
