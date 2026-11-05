import { CheckIcon } from '@phosphor-icons/react'

import { cn } from '@/lib/cn.ts'

/** A tick that shows whether a part is picked, as a filled or empty box. */
export function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[4px] border-[1.5px]',
        on ? 'border-accent-solid bg-accent-solid text-on-accent' : 'border-line-strong',
      )}
    >
      {on && <CheckIcon size={10} weight="bold" />}
    </span>
  )
}
