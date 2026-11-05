'use client'

import type { Editor } from '@dazbee/editor'

import { ALIGN, keyOf } from '@/components/editor/arrange-actions.ts'
import { ICON_BUTTON } from '@/components/editor/styles.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

/** The four moves along the stack: to the front, forward, backward, to the back. */
export const ORDER = ['bringToFront', 'bringForward', 'sendBackward', 'sendToBack'] as const

/** The six ways to line up the selection, as icons: left, centre, right, top, middle, bottom. */
export function AlignRow({ editor }: { editor: Editor }) {
  const t = useMessages()
  return (
    <div dir="ltr" role="group" aria-label={t.editor.arrange.align} className="grid grid-cols-6 gap-0.5">
      {ALIGN.map(({ action, icon: Icon }) => (
        <button
          key={action}
          type="button"
          aria-label={t.editor.arrange[action]}
          title={format(t.editor.arrange.withKey, { label: t.editor.arrange[action], key: keyOf(action) })}
          data-action={action}
          onClick={() => editor.perform(action)}
          className={ICON_BUTTON}
        >
          <Icon size={16} aria-hidden />
        </button>
      ))}
    </div>
  )
}
