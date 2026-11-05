'use client'

// What the top bar has open: one pop-up, the full menu or one edit panel, never two at once, since
// they share this one value. Opening any of them closes what was open. The shell reads it too: on a
// phone an edit panel, the top bar's Arrange ⋯, the full menu and the right-click menu are sheets,
// and a rail flyout and a sheet close each other. And whether something stands over the edit panel and the bar's second row, which Esc
// closes first; the menu's button a rename field gives the focus back to; and the Share menu's
// listener for an Export asked from a picked frame's ⋯.
import { useLayoutEffect, useState, useSyncExternalStore } from 'react'

import { OVER_PANEL } from '@/components/ui/menu-close.ts'

/** The top bar's items that open the edit panel for the selected layers. */
const LAYER_PANELS = ['font', 'colour', 'spacing', 'effects', 'position', 'edit', 'outline', 'stack'] as const
/**
 * The design's own panels, each with whether it belongs to the picked frame it was opened for, so
 * picking another frame or letting it go closes it: Pages, from by the zoom, stays; the picked
 * frame's Background goes; Add a frame, open while the Frame tool is, stays; and Add size, the same
 * card adding a size to the picked frame, goes. Selecting layers closes each of them.
 */
const DESIGN_PANELS = {
  pages: { ofPickedFrame: false },
  background: { ofPickedFrame: true },
  addFrame: { ofPickedFrame: false },
  addSize: { ofPickedFrame: true },
} as const satisfies Record<string, { ofPickedFrame: boolean }>
type DesignPanelId = keyof typeof DESIGN_PANELS
/**
 * The pop-ups that open as a sheet at the bottom on a phone, as an edit panel does: the top bar's
 * Arrange ⋯ and the full menu.
 */
const SHEET_POPUPS = ['arrange', 'more'] as const
export type LayerPanelId = (typeof LAYER_PANELS)[number]
export type PanelId = LayerPanelId | DesignPanelId
/** Every id that opens the edit panel; every other id is a pop-up or the full menu. */
const PANELS: readonly PanelId[] = [...LAYER_PANELS, ...(Object.keys(DESIGN_PANELS) as DesignPanelId[])]

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
  /** Whether the right-click menu is open, which is a sheet on a phone as the full menu is. */
  rightClick: boolean
}

let state: EditState = { open: null, bar: false, barBottom: 0, sheetTop: null, flyoutEnd: null, rightClick: false }
const listeners = new Set<() => void>()
/** The menu's button a rename was asked from, which the rename field gives the focus back to as it ends from the keyboard. */
let renameOpener: HTMLElement | null = null
/** What the Share menu does with an Export asked from elsewhere: open it with these frames ticked. */
let exportListener: ((frameIds: string[], opener: HTMLElement | null) => void) | null = null

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const isPanel = (id: string | null): id is PanelId => (PANELS as readonly string[]).includes(id ?? '')
export const isLayerPanel = (id: string | null): id is LayerPanelId =>
  (LAYER_PANELS as readonly string[]).includes(id ?? '')
/** Whether what is open is a sheet at the bottom on a phone: every edit panel but Pages, Arrange ⋯ and the full menu. */
export const isSheet = (id: string | null) =>
  (isPanel(id) && id !== 'pages') || (SHEET_POPUPS as readonly string[]).includes(id ?? '')
/**
 * Whether what is open closes when the selection or the picked frame changes: a pop-up, the full
 * menu, a layer's panel, or a panel of the picked frame.
 */
export const closesWithSelection = (id: string | null) =>
  !isPanel(id) || isLayerPanel(id) || DESIGN_PANELS[id].ofPickedFrame

/** Opens a pop-up, the full menu or an edit panel by its id, closing what was open; null closes it. */
export const setOpen = (open: string | null) => update({ open })
export const setBar = (bar: boolean, barBottom = 0) => update({ bar, barBottom: bar ? barBottom : 0 })
export const setSheetTop = (sheetTop: number | null) => update({ sheetTop })
export const setFlyoutEnd = (flyoutEnd: number | null) => update({ flyoutEnd })
export const setRightClick = (rightClick: boolean) => update({ rightClick })
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
 * Opens Export in the Share menu with only these frames ticked, as a picked frame's ⋯ does; Esc
 * gives the focus back to `opener`, the menu's button it was asked from.
 */
export const askExport = (frameIds: string[], opener: HTMLElement | null) => exportListener?.(frameIds, opener)
/** Hears each Export asked from elsewhere, until the function it returns is called; the Share menu listens. */
export function onExportAsked(listener: (frameIds: string[], opener: HTMLElement | null) => void) {
  exportListener = listener
  return () => {
    if (exportListener === listener) exportListener = null
  }
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

/**
 * Under 640 px wide the editor is laid out for a phone: the edit panel is a sheet and the top bar
 * scrolls. Read before the first paint, so a menu that opens on a phone, as the right-click menu
 * does, never shows a frame laid out for a wider screen first.
 */
export function usePhone() {
  const [phone, setPhone] = useState(false)
  useLayoutEffect(() => {
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
