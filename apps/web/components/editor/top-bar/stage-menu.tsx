'use client'

// The right-click menu on the stage: the layer actions for what the right-click picked, or Show
// hidden layers at one on empty canvas, for the frame there or the one nearest it outside every
// frame, when it has some. It opens at the right-click, or on a phone as the sheet at the bottom of
// the screen, as the full menu does.
import { type ReactElement, useEffect, useState } from 'react'

import { descendants } from '@dazbee/doc'
import { type Editor, type Frame, type Point, visibleIn } from '@dazbee/editor'

import { setRightClick, useEditState } from '@/components/editor/edit-store.ts'
import { useSelection } from '@/components/editor/editor-hooks.ts'
import { MenuItem, RightClickMenu } from '@/components/ui/menu.tsx'
import { useMessages } from '@/lib/i18n/client.tsx'

import { LayerActions } from './layer-actions.tsx'

/** The layers hidden in one frame, which a right-click on its empty canvas offers to show. */
export interface HiddenLayers {
  ids: string[]
  frameId: string
}

/**
 * The layers hidden in the frame at a client point, or outside every frame in the one nearest it;
 * null when that frame has none.
 */
export function hiddenAt(editor: Editor, client: Point): HiddenLayers | null {
  const spot = editor.spotAt(client)
  const frame = editor.frames().find((f) => f.id === spot?.frameId) ?? nearestFrame(editor, client)
  if (!frame) return null
  const design = editor.design()
  const ids = descendants(design, frame.id).filter((id) => !visibleIn(design, id))
  return ids.length > 0 ? { ids, frameId: frame.id } : null
}

/** The frame nearest a client point, by the distance from the point to its edges on screen. */
function nearestFrame(editor: Editor, client: Point) {
  let nearest: { frame: Frame; far: number } | null = null
  for (const frame of editor.frames()) {
    const a = editor.screenPoint(0, 0, frame.id)
    const b = editor.screenPoint(frame.width, frame.height, frame.id)
    const dx = Math.max(Math.min(a.x, b.x) - client.x, 0, client.x - Math.max(a.x, b.x))
    const dy = Math.max(Math.min(a.y, b.y) - client.y, 0, client.y - Math.max(a.y, b.y))
    const far = Math.hypot(dx, dy)
    if (!nearest || far < nearest.far) nearest = { frame, far }
  }
  return nearest?.frame ?? null
}

/**
 * The layer actions at a right-click on the stage's canvas (`children`), for what it picked, or Show
 * hidden layers at one on empty canvas, while `hidden` names some; it shows while the stage has a
 * menu open (`menu`), which the canvas's own right-click opens, and closes once the selection
 * changes, a row runs, or Esc or a press elsewhere closes it.
 */
export function StageMenu({
  editor,
  menu,
  onClose,
  children,
}: {
  editor: Editor | null
  /** The menu open at the last right-click, with the hidden layers it offers to show; null while none is. */
  menu: { hidden: HiddenLayers | null } | null
  onClose: () => void
  children: ReactElement
}) {
  const b = useMessages().editor.bar
  const { barBottom } = useEditState()
  const hidden = menu?.hidden ?? null
  return (
    <RightClickMenu
      area={children}
      open={menu !== null}
      onOpenChange={(to) => {
        if (!to) onClose()
      }}
      label={hidden ? b.canvasMenu : b.actions}
      testId="stage-menu"
      sheet
      // Kept between the top bar and the bottom controls, scrolling inside when it has less room.
      place={{ sticky: 'always', collisionPadding: { top: barBottom + 8, bottom: 72, left: 12, right: 12 } }}
      className={hidden ? 'min-w-52' : 'w-80'}
    >
      {editor && menu && <StageMenuRows editor={editor} hidden={hidden} onClose={onClose} />}
    </RightClickMenu>
  )
}

/** The rows of the stage's open right-click menu, closing it once the selection changes. */
function StageMenuRows({
  editor,
  hidden,
  onClose,
}: {
  editor: Editor
  hidden: HiddenLayers | null
  onClose: () => void
}) {
  const b = useMessages().editor.bar
  const ids = useSelection(editor)
  const [openedFor] = useState(ids)
  useEffect(() => {
    if (ids !== openedFor) onClose()
  }, [ids, openedFor, onClose])
  // The shell hides the tab bar and the dock under it on a phone, as under every sheet.
  useEffect(() => {
    setRightClick(true)
    return () => setRightClick(false)
  }, [])
  if (!hidden) return <LayerActions editor={editor} ids={ids} onDone={onClose} />
  return (
    <MenuItem
      action="showHidden"
      label={b.showHidden}
      onSelect={() => {
        editor.setHidden(hidden.ids, false)
        onClose()
      }}
    />
  )
}
