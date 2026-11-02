import type { Editor } from '@dazbee/editor'

/** How long the stage must be still before `run`, and the longest it waits while the stage keeps drawing, in ms. */
const SETTLE = 150
const AT_MOST = 1000

/**
 * Runs `run` now-ish and again after the stage draws: once it has been still a moment, so a drag
 * doesn't run it on every move, or after AT_MOST while it keeps drawing. Returns the stop.
 */
export function afterDraws(editor: Editor, run: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let waitingSince: number | null = null
  const fire = () => {
    timer = undefined
    waitingSince = null
    run()
  }
  const later = () => {
    const now = performance.now()
    waitingSince ??= now
    clearTimeout(timer)
    timer = setTimeout(fire, Math.max(0, Math.min(SETTLE, waitingSince + AT_MOST - now)))
  }
  const stop = editor.onDraw(later)
  later()
  return () => {
    clearTimeout(timer)
    stop()
  }
}

/** Whether two sets of picture URLs are the same, so a redraw that changed none renders nothing. */
export const sameUrls = (a: Record<string, string | null>, b: Record<string, string | null>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(b).every(([id, url]) => a[id] === url)
