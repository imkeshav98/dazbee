'use client'

// The picked frame's top bar items: Background, which opens the Colour panel for the frame's own
// fills, and ⋯ with the frame's actions: Duplicate, Rename and Delete.
import { DotsThreeIcon } from '@phosphor-icons/react'

import type { Editor } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { keyOf } from '@/components/editor/arrange-actions.ts'
import { setOpen, useEditState } from '@/components/editor/edit-store.ts'
import { MENU_ITEM, MENU_KEY } from '@/components/editor/styles.ts'
import { hexOf } from '@/lib/colour.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

import { BarPopover } from './bar-popover.tsx'
import { type BarItem, Dot, PanelButton } from './top-bar-items.tsx'

/** The items of a picked frame's top bar, in order. */
export function useFrameItems(editor: Editor, frameId: string, design: Design): BarItem[] {
  const t = useMessages()
  const f = t.editor.frames
  const { open } = useEditState()
  // The swatch shows the fill on top that shows: a colour, a gradient's first stop, or a rainbow for an image.
  const top = (design.frames[frameId]?.fills ?? []).findLast((fill) => fill.visible !== false)
  const colour = top?.type === 'solid' ? top.color : top && 'stops' in top ? top.stops[0]?.color : undefined
  /** Closes the menu, then does what its row says. */
  const act = (run: () => void) => () => {
    setOpen(null)
    run()
  }
  return [
    {
      key: 'background',
      node: (
        <PanelButton
          id="background"
          label={f.backgroundColour}
          face={
            <>
              <Dot colour={colour === undefined ? 'mixed' : hexOf(colour)} />
              {f.background}
            </>
          }
        />
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
          testId="frame-more"
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
            data-action="rename"
            onClick={act(() => editor.renameFrame(frameId))}
            className={MENU_ITEM}
          >
            {f.rename}
          </button>
          <button
            type="button"
            data-action="delete"
            onClick={act(() => editor.perform('delete'))}
            className={MENU_ITEM}
          >
            {t.editor.bar.delete}
            <kbd className={MENU_KEY}>{keyOf('delete')}</kbd>
          </button>
        </BarPopover>
      ),
    },
  ]
}
