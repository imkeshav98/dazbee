// The floating property cards' shared look (#83), as in the final mock: a frosted card with roomy
// padding, its title at the start and a small grey note at the end (what it acts on, or a count).
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

/** Colours a click away when the brand's kit has none; the hex fields take any colour. */
export const SWATCHES = ['#FFFFFF', '#FBF7F2', '#1A1420', '#FF48B0', '#3D6BFF', '#FFD23F', '#3DD68C', '#FF6B3D'] as const

/**
 * The ring round a picked swatch or tile, as in the mock: pink with a gap, a shape and not only a
 * colour, so it reads without colour vision too.
 */
export const PICKED_RING = 'shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]'

/** One floating card: frosted, rounded, as tall as its content. */
export const CARD = 'card-rise shrink-0 overflow-hidden rounded-[16px] surface-frost'

/** A card's content under its title row. */
export const CARD_BODY = 'px-[18px] pb-4'
/** A card's second part, under a hairline: the numbers under a card's look. */
export const CARD_LOWER = 'border-t border-line px-[18px] pt-3 pb-4'

/**
 * A card's title row: the name at the start; at the end a small grey note (the layer or page it
 * acts on), a count, and an optional action.
 */
export function CardHeader({ id, title, note, count, children }: { id: string; title: string; note?: string | undefined; count?: number; children?: ReactNode }) {
  return (
    <div className={cn('flex h-12 items-center gap-2 ps-[18px]', children ? 'pe-2.5' : 'pe-[18px]')}>
      <h3 id={id} className="min-w-0 flex-1 truncate font-display text-[15px] font-bold tracking-tight">{title}</h3>
      {note && <span className="min-w-0 max-w-[60%] truncate text-[11px] font-medium text-muted">{note}</span>}
      {count !== undefined && <span className="shrink-0 font-mono text-[11px] text-muted tabular-nums">{count}</span>}
      {children}
    </div>
  )
}
