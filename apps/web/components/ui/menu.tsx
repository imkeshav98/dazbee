'use client'

import { useCallback, useRef, useState } from 'react'

import { useOverlayScroll } from '@/components/ui/overlay-scroll.ts'
import { fadedEdges, linedEdges, useScrollEdges } from '@/components/ui/scroll-edges.ts'
import { usePhone } from '@/lib/phone.ts'

/**
 * A menu that scrolls when it is longer than its room, and shows that it does: its overlay bar,
 * kept shown on a phone, and its cut edges faded, or on a phone lined, so a cut row never reads as
 * a greyed one. The ref goes on the scrolling element, and `also` gets the element too.
 */
export function useScrollingMenu(also?: (element: HTMLDivElement | null) => void) {
  const phone = usePhone()
  const area = useRef<HTMLDivElement | null>(null)
  // A portal puts the menu in the page after its owner has rendered: the owner renders again once
  // it is there, so its edges are measured however the menu opened.
  const [, setShown] = useState<HTMLDivElement | null>(null)
  const bars = useOverlayScroll(area, { shown: phone })
  const edges = useScrollEdges(area)
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      also?.(element)
      setShown(element)
      const off = bars(element)
      return () => {
        off()
        also?.(null)
        setShown(null)
      }
    },
    [bars, also],
  )
  return { ref, onScroll: edges.measure, className: phone ? linedEdges(edges) : fadedEdges(edges) }
}
