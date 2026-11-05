// The layers panel tree's keyboard focus: one Tab stop, the row it lands on, the row the arrows move
// from, and the focus kept on a row through a delete, an undo and a scroll that takes its row away.
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { Editor } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import type { Row } from '@/lib/editor/layer-tree.ts'

import { scrollToRow } from './use-row-window.ts'

/**
 * The tree's focus: `current`, the row Tab lands on; `active`, the row the focus was last on;
 * `reveal`, which scrolls to a row and focuses it; and `focused`, which a row calls as it takes the
 * focus.
 */
export function useTreeFocus({
  editor,
  design,
  rows,
  indexOf,
  selected,
  picked,
  isFrame,
  scroller,
  follow,
  pitch,
}: {
  editor: Editor
  design: Design
  rows: Row[]
  indexOf: Map<string, number>
  selected: ReadonlySet<string>
  picked: string | null
  isFrame: (id: string) => boolean
  scroller: RefObject<HTMLDivElement | null>
  follow: (el: HTMLElement) => void
  pitch: number
}) {
  // The row keyboard focus was last on: the one the arrows move from.
  const [active, setActive] = useState<string | null>(null)
  // Whether the focus is in the tree: from a row taking it until a press or focus outside the tree.
  const [inTree, setInTree] = useState(false)
  // The row Tab lands on, the tree's one tab stop: while the focus is in the tree, the row it is on;
  // from outside, the selected row the focus was last on, else the first selected row, else the row
  // the focus was last on, else the first row.
  const listedSelection = [...selected].filter((id) => indexOf.has(id))
  const current =
    active && indexOf.has(active) && (inTree || listedSelection.includes(active))
      ? active
      : (listedSelection[0] ?? (active && indexOf.has(active) ? active : (rows[0]?.id ?? null)))
  // The row to focus once it is rendered, by id.
  const focusing = useRef<string | null>(null)
  // The row the focus is on while it is in the tree, and its place in the list at the last commit.
  const held = useRef<string | null>(null)
  const heldAt = useRef(0)
  // The layer of a row deleted while it had the focus: its row takes the focus again if it comes
  // back, as on undo, until a press or focus outside the tree.
  const gone = useRef<string | null>(null)
  // The picked frame at the last commit, and a frame picked from elsewhere while the focus was on
  // another frame's row, as Ctrl+D there picks its copy: its row takes the focus once listed.
  const pickedAt = useRef(picked)
  const following = useRef<string | null>(null)
  useEffect(() => {
    const away = (event: Event) => {
      if (event.target instanceof Node && scroller.current?.contains(event.target)) return
      held.current = null
      gone.current = null
      setInTree(false)
    }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('focusin', away, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('focusin', away, true)
    }
  }, [])
  /**
   * Scrolls a row into view, then focuses it once it is rendered. `at` is its place in the list, when
   * that is not where the panel last listed it, as after a move.
   */
  const reveal = useCallback(
    (id: string, at = indexOf.get(id)) => {
      const el = scroller.current
      if (!el || at === undefined) return
      scrollToRow(el, at, pitch)
      follow(el)
      setActive(id)
      focusing.current = id
    },
    [indexOf, follow, pitch],
  )
  // Moves the focus off a row that left the list and back when it returns, then focuses the row
  // asked for in the commit that renders it, so it reads the rows that commit put in
  // the page and no effect of an earlier render is left to run after a key. The focus moves only from
  // the panel or from the page itself, never out of a field or control elsewhere; a row no longer in
  // the list is no longer asked for.
  useLayoutEffect(() => {
    // Focuses a row and selects its layer or picks its frame unless it is so, so the focus and the
    // selection agree.
    const take = (id: string) => {
      if (!selected.has(id)) {
        if (isFrame(id)) editor.pickFrame(id)
        else editor.select([id])
      }
      reveal(id)
    }
    const before = document.activeElement
    const dropped = !before || before === document.body || !before.isConnected
    const lost = held.current
    if (lost && !indexOf.has(lost)) {
      // The row the focus was on left the list, as when its layer or frame is deleted or its layer
      // grouped: the focus goes to the selected row, else to the row now in its place or the last row.
      held.current = null
      if (dropped) {
        gone.current = design.nodes[lost] || isFrame(lost) ? null : lost
        const next = listedSelection[0] ?? rows[Math.min(heldAt.current, rows.length - 1)]?.id
        // A frame's row in its place takes the focus unpicked, so a second Delete deletes nothing.
        if (next && isFrame(next)) reveal(next)
        else if (next) take(next)
      }
    } else if (gone.current && indexOf.has(gone.current) && (dropped || scroller.current?.contains(before))) {
      take(gone.current)
      gone.current = null
    }
    if (held.current) heldAt.current = indexOf.get(held.current) ?? heldAt.current
    if (picked !== pickedAt.current) {
      pickedAt.current = picked
      const from = held.current
      following.current = picked !== null && from !== null && from !== picked && isFrame(from) ? picked : null
    }
    if (following.current && indexOf.has(following.current)) {
      reveal(following.current)
      following.current = null
    }

    const id = focusing.current
    if (!id) return
    if (!indexOf.has(id)) {
      focusing.current = null
      return
    }
    const row = scroller.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`)
    if (!row) return
    const from = document.activeElement
    if (from !== row && (!from || from === document.body || !from.isConnected || scroller.current?.contains(from)))
      row.focus({ preventScroll: true })
    focusing.current = null
  })

  const focused = (id: string) => {
    setActive(id)
    setInTree(true)
    held.current = id
    heldAt.current = indexOf.get(id) ?? 0
  }
  return { active, current, reveal, focused }
}
