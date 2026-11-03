'use client'

// What the top bar has open: one pop-up, the full menu or one edit panel, never two at once, since
// they share this one value. Opening any of them closes what was open. The shell reads it too: on a
// phone an edit panel is a sheet, and a rail flyout and a sheet close each other.
import { useEffect, useState, useSyncExternalStore } from 'react'

/** The top bar's items that open the edit panel; every other id is a pop-up or the full menu. */
export const PANELS = ['font', 'colour', 'spacing', 'effects', 'position', 'edit', 'outline', 'stack'] as const
export type PanelId = (typeof PANELS)[number]

export const isPanel = (id: string | null): id is PanelId => (PANELS as readonly string[]).includes(id ?? '')

interface EditState {
  /** The open pop-up, full menu or edit panel, by its top bar id. */
  open: string | null
  /** Whether the top bar shows: something is selected. */
  bar: boolean
  /** The top bar's bottom edge, in the stage's pixels, while it shows. */
  barBottom: number
  /** The edit panel's top edge in the stage's pixels while it is a sheet on a phone; null otherwise. */
  sheetTop: number | null
  /** How far the open rail flyout reaches from the stage's start edge on tablet and desktop, in pixels; null with none open. */
  flyoutEnd: number | null
}

let state: EditState = { open: null, bar: false, barBottom: 0, sheetTop: null, flyoutEnd: null }
const listeners = new Set<() => void>()

function update(change: Partial<EditState>) {
  const next = { ...state, ...change }
  if (Object.keys(change).every((key) => Object.is(next[key as keyof EditState], state[key as keyof EditState]))) return
  state = next
  for (const listener of listeners) listener()
}

/** Opens a pop-up, the full menu or an edit panel by its id, closing what was open; null closes it. */
export const setOpen = (open: string | null) => update({ open })
export const setBar = (bar: boolean, barBottom = 0) => update({ bar, barBottom: bar ? barBottom : 0 })
export const setSheetTop = (sheetTop: number | null) => update({ sheetTop })
export const setFlyoutEnd = (flyoutEnd: number | null) => update({ flyoutEnd })
export const editState = () => state

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** What the top bar has open and where it sits, re-rendering the caller when that changes. */
export function useEditState() {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

/** Under 640 px wide the editor is laid out for a phone: the edit panel is a sheet and the top bar scrolls. */
export function usePhone() {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)')
    const update = () => setPhone(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return phone
}
