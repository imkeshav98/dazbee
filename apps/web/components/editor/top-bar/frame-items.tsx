'use client'

// The picked frame's top bar items: Background, a swatch as a layer's Fill is, which opens the
// Background panel for the frame's own fills, and ⋯ with the frame's actions: Duplicate, Add size ▸,
// which opens the Add size card, Rename and Delete, the last after a line and in the danger colour,
// as a page's ⋯ on the Pages card.
import { CaretRightIcon, DotsThreeIcon } from '@phosphor-icons/react'
import { useRef } from 'react'

import type { Editor } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { keyOf } from '@/components/editor/arrange-actions.ts'
import { setOpen, setRenameOpener, useEditState } from '@/components/editor/edit-store.ts'
import { MENU_DIVIDER, MENU_ITEM, MENU_KEY } from '@/components/editor/styles.ts'
import { cn } from '@/lib/cn.ts'
import { hexOf } from '@/lib/colour.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

import { BarPopover } from './bar-popover.tsx'
import { type BarItem, Dot, PanelButton } from './top-bar-items.tsx'

/** The swatch for a frame's fills: the fill on top that shows, a gradient's first stop, a rainbow for an image, or empty for none. */
function swatchOf(design: Design, frameId: string): string | 'mixed' | 'none' {
  const top = (design.frames[frameId]?.fills ?? []).findLast((fill) => fill.visible !== false)
  if (!top) return 'none'
  const colour = top.type === 'solid' ? top.color : 'stops' in top ? top.stops[0]?.color : undefined
  return colour === undefined ? 'mixed' : hexOf(colour)
}

/** The items of a picked frame's top bar, in order. */
export function useFrameItems(editor: Editor, frameId: string, design: Design): BarItem[] {
  const t = useMessages()
  const f = t.editor.frames
  const { open } = useEditState()
  // The ⋯ button, which the rename field gives the focus back to after Rename here.
  const more = useRef<HTMLButtonElement | null>(null)
  /** Closes the menu, then does what its row says. */
  const act = (run: () => void) => () => {
    setOpen(null)
    run()
  }
  return [
    {
      key: 'background',
      node: (
        <PanelButton id="background" label={f.backgroundColour} face={<Dot colour={swatchOf(design, frameId)} />} />
      ),
    },
    {
      key: 'frame-more',
      node: (
        <BarPopover
          id="frame-more"
          open={open}
          onOpen={setOpen}
          label={f.more}
          face={<DotsThreeIcon size={18} weight="bold" aria-hidden />}
          caret={false}
          align="end"
          buttonRef={more}
          testId="frame-more"
          opens="addSize"
        >
          <button
            type="button"
            data-action="duplicate"
            onClick={act(() => editor.perform('duplicate'))}
            className={MENU_ITEM}
          >
            {t.editor.arrange.duplicate}
            <kbd className={MENU_KEY}>{keyOf('duplicate')}</kbd>
          </button>
          <button
            type="button"
            data-action="add-size"
            aria-haspopup="dialog"
            onClick={() => setOpen('addSize')}
            className={MENU_ITEM}
          >
            {f.addSize}
            <CaretRightIcon size={12} weight="bold" aria-hidden className="text-subtle rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            data-action="rename"
            onClick={act(() => {
              setRenameOpener(more.current)
              editor.renameFrame(frameId)
            })}
            className={MENU_ITEM}
          >
            {f.rename}
          </button>
          <div role="separator" className={MENU_DIVIDER} />
          <button
            type="button"
            data-action="delete"
            onClick={act(() => editor.perform('delete'))}
            className={cn(MENU_ITEM, 'text-danger')}
          >
            {t.editor.bar.delete}
            <kbd className={MENU_KEY}>{keyOf('delete')}</kbd>
          </button>
        </BarPopover>
      ),
    },
  ]
}
