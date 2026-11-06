// A pop-up that opens sideways from a control in the edit panel, towards the stage's middle, sits a
// gap clear of the panel's edge, wherever the control is in the panel; from a control anywhere else,
// it sits the gap from the control. On a phone, where the panel is a sheet across the screen, it
// opens the gap above the control instead, kept inside the screen.
import { useState } from 'react'

import { useLocale } from '@/lib/i18n/client.tsx'
import { dirOf } from '@/lib/i18n/index.ts'
import { usePhone } from '@/lib/phone.ts'

/** The gap, in CSS pixels, between a pop-up and the panel or control it opens beside. */
const GAP = 12

/**
 * The side a pop-up opens on and its offset from its button, for a Radix popover's `side` and
 * `sideOffset`; `measure` takes the button as the pop-up opens.
 */
export function useBesidePanel() {
  const rtl = dirOf(useLocale()) === 'rtl'
  const phone = usePhone()
  const side = phone ? 'top' : rtl ? 'right' : 'left'
  const [sideOffset, setSideOffset] = useState(GAP)

  const measure = (button: HTMLElement | null) => {
    const panel = button?.closest('#edit-panel')
    if (!button || !panel || side === 'top') return setSideOffset(GAP)
    const at = button.getBoundingClientRect()
    const edge = panel.getBoundingClientRect()
    setSideOffset(GAP + (side === 'left' ? at.left - edge.left : edge.right - at.right))
  }

  return { side, sideOffset, measure } as const
}
