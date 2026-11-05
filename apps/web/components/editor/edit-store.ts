'use client'

// What the top bar has open: one pop-up, the full menu or one edit panel, never two at once, since
// they share this one value. Opening any of them closes what was open. The shell reads it too: on a
// phone an edit panel, and the top bar's ⋯, is a sheet, and a rail flyout and a sheet close each other. And whether
// something stands over the edit panel and the bar's second row, which Esc closes first; and the
// menu's button a rename field gives the focus back to.
import { useEffect, useState, useSyncExternalStore } from 'react'

import { OVER_PANEL } from '@/components/ui/menu-close.ts'

/** The top bar's items that open the edit panel for the selected layers. */
const LAYER_PANELS = ['font', 'colour', 'spacing', 'effects', 'position', 'edit', 'outline', 'stack'] as const
/** The design's own panels: Pages, from by the zoom, and the picked frame's Background. */
const DESIGN_PANELS = ['pages', 'background'] as const
/** Every id that opens the edit panel; every other id is a pop-up or the full menu. */
const PANELS = [...LAYER_PANELS, ...DESIGN_PANELS] as const
/** The top bar's pop-ups that open as a sheet at the bottom on a phone, as an edit panel does: the layers' ⋯. */
const SHEET_POPUPS = ['layer-more'] as const
export type LayerPanelId = (typeof LAYER_PANELS)[number]
export type PanelId = (typeof PANELS)[number]

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
/** The menu's button a rename was asked from, which the rename field gives the focus back to as it ends from the keyboard. */
let renameOpener: HTMLElement | null = null

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const isPanel = (id: string | null): id is PanelId => (PANELS as readonly string[]).includes(id ?? '')
export const isLayerPanel = (id: string | null): id is LayerPanelId =>
  (LAYER_PANELS as readonly string[]).includes(id ?? '')
/** Whether what is open is a sheet at the bottom on a phone: every edit panel but Pages, and the layers' ⋯. */
export const isSheet = (id: string | null) =>
  (isPanel(id) && id !== 'pages') || (SHEET_POPUPS as readonly string[]).includes(id ?? '')

/** Opens a pop-up, the full menu or an edit panel by its id, closing what was open; null closes it. */
export const setOpen = (open: string | null) => update({ open })
export const setBar = (bar: boolean, barBottom = 0) => update({ bar, barBottom: bar ? barBottom : 0 })
export const setSheetTop = (sheetTop: number | null) => update({ sheetTop })
export const setFlyoutEnd = (flyoutEnd: number | null) => update({ flyoutEnd })
export const editState = () => state
/** Notes the menu's button a rename is asked from, just before asking, for the field to give the focus back to. */
export const setRenameOpener = (opener: HTMLElement | null) => {
  renameOpener = opener
}
/** The menu's button the rename asked for now came from, or null for one asked from the canvas; read once. */
export function takeRenameOpener() {
  const opener = renameOpener
  renameOpener = null
  return opener
}
/**
 * Whether something stands over the edit panel and the bar's second row, so Esc closes it first: a
 * modal dialog, such as Keyboard shortcuts, or a menu that closes as `useMenuClose` says, as the
 * Share menu with its cards and the account menu do.
 */
export const overPanel = () => document.querySelector(`dialog:modal, ${OVER_PANEL}`) !== null

/** What the top bar has open and where it sits, re-rendering the caller when that changes. */
export function useEditState() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
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

function update(change: Partial<EditState>) {
  const next = { ...state, ...change }
  if (Object.keys(change).every((key) => Object.is(next[key as keyof EditState], state[key as keyof EditState]))) return
  state = next
  for (const listener of listeners) listener()
}
