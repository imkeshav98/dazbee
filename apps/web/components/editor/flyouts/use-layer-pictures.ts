'use client'

import { useEffect, useState } from 'react'

import type { Editor } from '@dazbee/editor'

import { afterDraws, sameUrls } from '@/components/editor/after-draws.ts'

/** How long the list must be still before pictures are drawn, and a slice's budget where the browser can't say, in ms. */
const PICTURES_AFTER_SCROLL = 300
const PICTURES_SLICE = 6

/**
 * Each listed layer's picture in the frame the panel shows, drawn once the stage has settled and
 * the list has been still a moment (so a drag or a scroll draws none) and again once fonts and
 * images arrive, a few at a time in the browser's idle time so no frame waits on them.
 * `scrolledAt` is when the list last scrolled.
 */
export function useLayerPictures(
  editor: Editor,
  frameKey: string,
  ids: readonly string[],
  scrolledAt: { current: number },
): Record<string, string | null> {
  const [pictures, setPictures] = useState<{ frameKey: string; urls: Record<string, string | null> }>({
    frameKey,
    urls: {},
  })
  const wanted = ids.join(' ')
  useEffect(() => {
    let cancel = () => {}
    const stop = afterDraws(editor, () => {
      cancel()
      const list = wanted.split(' ').filter(Boolean)
      const next: Record<string, string | null> = {}
      let i = 0
      const slice = (left: () => number) => {
        const still = performance.now() - scrolledAt.current
        if (still < PICTURES_AFTER_SCROLL) {
          const id = setTimeout(() => (cancel = whenIdle(slice)), PICTURES_AFTER_SCROLL - still)
          cancel = () => clearTimeout(id)
          return
        }
        while (i < list.length && left() > 1) {
          const id = list[i++] ?? ''
          next[id] = editor.layerThumbnail(id, 44, false, frameKey)
        }
        if (i < list.length) cancel = whenIdle(slice)
        else
          setPictures((now) => (now.frameKey === frameKey && sameUrls(now.urls, next) ? now : { frameKey, urls: next }))
      }
      cancel = whenIdle(slice)
    })
    return () => {
      cancel()
      stop()
    }
  }, [editor, frameKey, wanted, scrolledAt])
  // Another frame's pictures are not this one's.
  return pictures.frameKey === frameKey ? pictures.urls : {}
}

/** Runs `work` when the browser is idle, with how many ms it may take; returns the cancel. */
function whenIdle(work: (left: () => number) => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback((deadline) => work(() => deadline.timeRemaining()), { timeout: 1000 })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(() => {
    const end = performance.now() + PICTURES_SLICE
    work(() => end - performance.now())
  }, 0)
  return () => clearTimeout(id)
}
