'use client'

// The text's one Text style ▾ button: Bold, Italic, Underline and Strikethrough in its pop-up. It
// keeps one width whatever is on, shows B and I over an underline, tinted while any style is on, and
// is named by the styles that are.
import { TextBIcon, TextItalicIcon, TextStrikethroughIcon, TextUnderlineIcon } from '@phosphor-icons/react'

import { setOpen, useEditState } from '@/components/editor/edit-store.ts'
import { BAR_TOGGLE } from '@/components/editor/styles.ts'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { BarPopover } from './bar-popover.tsx'

/** One of the four text styles: whether it is on for the selection, whether it can be set, and setting it. */
export interface TextStyleToggle {
  id: 'bold' | 'italic' | 'underline' | 'strikethrough'
  on: boolean | 'mixed'
  disabled?: boolean
  onToggle: () => void
}

/** Each style's icon, drawn bold as the bar's icons are. */
const ICONS = {
  bold: TextBIcon,
  italic: TextItalicIcon,
  underline: TextUnderlineIcon,
  strikethrough: TextStrikethroughIcon,
}

/** The Text style ▾ button and its pop-up of the four toggles, in order. */
export function TextStyleButton({ toggles }: { toggles: TextStyleToggle[] }) {
  const t = useMessages()
  const b = t.editor.bar
  const { open } = useEditState()
  const on = toggles.filter((toggle) => toggle.on !== false).map((toggle) => b[toggle.id])
  const label = on.length > 0 ? format(b.textStyleOn, { styles: on.join(b.listJoin) }) : b.textStyle
  return (
    <BarPopover
      id="text-style"
      open={open}
      onOpen={setOpen}
      label={label}
      face={<TextStylesIcon />}
      on={on.length > 0}
      testId="text-style"
      className="w-auto"
    >
      <div role="group" aria-label={b.textStyle} className="flex gap-1 max-sm:gap-[8px]">
        {toggles.map(({ id, on: pressed, disabled = false, onToggle }) => {
          const Icon = ICONS[id]
          return (
            <button
              key={id}
              type="button"
              aria-label={b[id]}
              title={b[id]}
              aria-pressed={pressed}
              disabled={disabled}
              onClick={onToggle}
              data-testid={`bar-${id}`}
              className={cn(BAR_TOGGLE, 'max-sm:size-[44px]')}
            >
              <Icon size={16} weight="bold" aria-hidden />
            </button>
          )
        })}
      </div>
    </BarPopover>
  )
}

/** B and I side by side over an underline, in Phosphor's bold weight. */
function TextStylesIcon() {
  return (
    <svg viewBox="0 0 256 256" width={18} height={18} fill="currentColor" aria-hidden>
      <g transform="translate(-30 -18) scale(0.86)">
        <TextBIcon size={256} weight="bold" />
      </g>
      <g transform="translate(104 -18) scale(0.86)">
        <TextItalicIcon size={256} weight="bold" />
      </g>
      <rect x={24} y={214} width={208} height={24} rx={12} />
    </svg>
  )
}
