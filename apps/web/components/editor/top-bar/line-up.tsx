'use client'

import type { Editor } from '@dazbee/editor'

import { ALIGN, keyOf } from '@/components/editor/arrange-actions.ts'
import { ICON_BUTTON } from '@/components/editor/styles.ts'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

/**
 * The six ways to line up the selection, as icons: left, centre, right, top, middle, bottom. Each
 * is named by where it lines up to, and its tooltip says so with its shortcut.
 */
export function AlignRow({ editor }: { editor: Editor }) {
  const t = useMessages()
  const named = t.editor.bar.placing
  return (
    // On a phone each button is a finger's size, with room between them.
    <div dir="ltr" role="group" aria-label={t.editor.arrange.align} className="grid grid-cols-6 gap-0.5 max-sm:gap-2">
      {ALIGN.map(({ action, icon: Icon }) => (
        <Tooltip key={action} label={format(t.editor.arrange.withKey, { label: named[action], key: keyOf(action) })}>
          <button
            type="button"
            aria-label={named[action]}
            data-action={action}
            onClick={() => editor.perform(action)}
            className={cn(ICON_BUTTON, 'max-sm:size-[44px]')}
          >
            <Icon size={16} aria-hidden />
          </button>
        </Tooltip>
      ))}
    </div>
  )
}
