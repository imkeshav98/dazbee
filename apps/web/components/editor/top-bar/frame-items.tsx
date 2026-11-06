'use client'

// The picked frame's top bar items: Background, its swatch and its name, which opens the
// Background panel for the frame's own fills, and ⋯ with the frame's actions: Duplicate, Add size ▸,
// which opens the Add size card, Rename, Export, which opens the Share menu's Export with this frame
// ticked alone, and Delete, the last after a line and in the danger colour, as a page's ⋯ on the
// Pages card.
import { DotsThreeIcon } from '@phosphor-icons/react'
import { useRef } from 'react'

import type { Editor } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { keyOf } from '@/components/editor/arrange-actions.ts'
import { askExport, editState, setOpen, setRenameOpener, useEditState } from '@/components/editor/edit-store.ts'
import { BAR_BUTTON } from '@/components/editor/styles.ts'
import { Menu, MenuDivider, MenuItem } from '@/components/ui/menu.tsx'
import { hexOf } from '@/lib/colour.ts'
import { swatchOf } from '@/lib/editor/frame-swatch.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

import { useUnderBar } from './bar-popover.tsx'
import { type BarItem, Dot, PanelButton } from './top-bar-items.tsx'

/** A swatch without its transparency, as a layer's Fill shows its colour on its button. */
const opaque = (swatch: string) => (swatch === 'mixed' || swatch === 'none' ? swatch : hexOf(swatch))

/** The items of a picked frame's top bar, in order. */
export function useFrameItems(editor: Editor, frameId: string, design: Design): BarItem[] {
  const t = useMessages()
  const f = t.editor.frames
  const { open } = useEditState()
  // The ⋯ button, which the rename field and Export give the focus back to after Rename or Export here.
  const more = useRef<HTMLButtonElement | null>(null)
  const below = useUnderBar(more, open === 'frame-more')
  return [
    {
      key: 'background',
      node: (
        <PanelButton id="background" label={f.background} icon={<Dot colour={opaque(swatchOf(design, frameId))} />} />
      ),
    },
    {
      key: 'frame-more',
      node: (
        <Menu
          trigger={
            <button
              ref={more}
              type="button"
              data-bar-item
              aria-label={f.more}
              title={f.more}
              data-testid="bar-frame-more"
              data-opens="addSize"
              className={BAR_BUTTON}
            >
              <DotsThreeIcon size={18} weight="bold" aria-hidden />
            </button>
          }
          open={open === 'frame-more'}
          onOpenChange={(to) => {
            // A row that opened something else, as Add size opens its card, keeps it open.
            if (to) setOpen('frame-more')
            else if (editState().open === 'frame-more') setOpen(null)
          }}
          label={f.more}
          testId="bar-frame-more-menu"
          place={{ side: 'bottom', align: 'end', sideOffset: below, collisionPadding: 12 }}
          className="min-w-56"
        >
          <MenuItem
            action="duplicate"
            label={t.editor.arrange.duplicate}
            keys={keyOf('duplicate')}
            onSelect={() => editor.perform('duplicate')}
          />
          <MenuItem action="add-size" label={f.addSize} caret onSelect={() => setOpen('addSize')} />
          <MenuItem
            action="rename"
            label={f.rename}
            onSelect={() => {
              setRenameOpener(more.current)
              editor.renameFrame(frameId)
            }}
          />
          <MenuItem action="export" label={f.export} onSelect={() => askExport([frameId], more.current)} />
          <MenuDivider />
          <MenuItem
            action="delete"
            label={t.editor.bar.delete}
            keys={keyOf('delete')}
            danger
            onSelect={() => editor.perform('delete')}
          />
        </Menu>
      ),
    },
  ]
}
