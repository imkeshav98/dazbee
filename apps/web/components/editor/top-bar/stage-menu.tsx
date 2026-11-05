'use client'

// The right-click menu on the stage: the layer actions for what the right-click picked, or Show
// hidden layers at one on empty canvas, for the frame there or the one nearest it outside every
// frame, when it has some. It opens at the right-click, or on a phone as the sheet at the bottom of
// the screen, as the full menu does.
import * as Popover from '@radix-ui/react-popover'
import { useEffect, useState } from 'react'

import { descendants } from '@dazbee/doc'
import { type Editor, type Frame, type Point, visibleIn } from '@dazbee/editor'

import { setRightClick, useEditState } from '@/components/editor/edit-store.ts'
import { useSelection } from '@/components/editor/editor-hooks.ts'
import { MENU, MENU_ITEM } from '@/components/ui/looks.ts'
import { useScrollingMenu } from '@/components/ui/menu.tsx'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { usePhone } from '@/lib/phone.ts'

import { arrowThrough, SHEET_LOOK, SHEET_PLACE, SheetAnchor, useEscapeBack, } from './bar-popover.tsx'
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
 * The layer actions at a right-click on the stage, for what it picked, or Show hidden layers at one
 * on empty canvas; it closes once the selection changes.
 */
export function StageMenu({
  editor,
  at,
  hidden,
  onClose,
}: {
  editor: Editor
  at: { x: number; y: number }
  /** The hidden layers of the frame right-clicked, or nearest the right-click, where nothing was picked. */
  hidden: HiddenLayers | null
  onClose: () => void
}) {
  const t = useMessages()
  const b = t.editor.bar
  const ids = useSelection(editor)
  const { barBottom } = useEditState()
  const phone = usePhone()
  const scroll = useScrollingMenu()
  const escape = useEscapeBack()
  const [openedFor] = useState(ids)
  useEffect(() => {
    if (ids !== openedFor) onClose()
  }, [ids, openedFor, onClose])
  // The shell hides the tab bar and the dock under it on a phone, as under every sheet.
  useEffect(() => {
    setRightClick(true)
    return () => setRightClick(false)
  }, [])
  return (
    <Popover.Root open onOpenChange={(to) => !to && onClose()}>
      {phone ? (
        <SheetAnchor />
      ) : (
        <Popover.Anchor asChild>
          <span aria-hidden className="pointer-events-none absolute size-0" style={{ left: at.x, top: at.y }} />
        </Popover.Anchor>
      )}
      <Popover.Portal>
        <Popover.Content
          // On a phone the sheet; elsewhere at the right-click, kept between the top bar and the
          // bottom controls, scrolling inside when it has less room.
          {...(phone
            ? SHEET_PLACE
            : {
                side: 'bottom',
                align: 'start',
                sideOffset: 2,
                sticky: 'always',
                collisionPadding: { top: barBottom + 8, bottom: 72, left: 12, right: 12 },
              })}
          // A click elsewhere or Esc closes it; focus given back to a button that just closed does not.
          onFocusOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={escape.onEscapeKeyDown}
          onKeyDown={arrowThrough}
          aria-label={hidden ? b.canvasMenu : b.actions}
          data-testid="stage-menu"
          data-menu
          ref={scroll.ref}
          onScroll={scroll.onScroll}
          className={cn(
            MENU,
            phone
              ? SHEET_LOOK
              : hidden
                ? 'min-w-52'
                : 'max-h-[var(--radix-popover-content-available-height)] w-80 overflow-y-auto',
            scroll.className,
          )}
        >
          {hidden ? (
            <button
              type="button"
              data-action="showHidden"
              onClick={() => {
                editor.setHidden(hidden.ids, false)
                onClose()
              }}
              className={MENU_ITEM}
            >
              {b.showHidden}
            </button>
          ) : (
            escape.rows(<LayerActions editor={editor} ids={ids} onDone={onClose} />)
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
