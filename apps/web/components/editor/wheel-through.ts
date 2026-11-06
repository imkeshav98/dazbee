'use client'

// The wheel over a piece of chrome that floats on the stage, such as the small menu, pans and zooms
// the stage as it does over the canvas, so the chrome never stops the view moving under the pointer.
import { useEffect } from 'react'

/** Sends each wheel turn over `el` to the stage's canvas, in place of the page's own scroll or zoom. */
export function useWheelThrough(el: HTMLElement | null) {
  useEffect(() => {
    if (!el) return
    const through = (event: WheelEvent) => {
      const stage = document.querySelector('[data-testid="stage"]')
      if (!stage) return
      event.preventDefault()
      stage.dispatchEvent(new WheelEvent('wheel', event))
    }
    el.addEventListener('wheel', through, { passive: false })
    return () => el.removeEventListener('wheel', through)
  }, [el])
}
