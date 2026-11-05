'use client'

// A gradient's stops on a bar in the paint editor, and what the paint swatch also reads from a
// gradient: its stops as CSS, a linear gradient's angle, and a linear gradient at an angle.
import { type KeyboardEvent, useEffect, useRef } from 'react'

import type { Editor } from '@dazbee/editor'
import type { Paint } from '@dazbee/schema'

import { clamp } from '@/components/editor/edit-panel/fields.tsx'
import type { P } from '@/components/editor/edit-panel/target.ts'
import { FOCUS_RING } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { tidy } from '@/lib/editor/size.ts'
import { format } from '@/lib/i18n/index.ts'

import { PICKED_RING, TOUCH_AREA } from './styles.ts'

export type Gradient = Extract<Paint, { type: 'linear' | 'radial' | 'angular' }>
export type Stop = Gradient['stops'][number]

/** A gradient's stops in order, as the renderer needs them. */
const sorted = (stops: Stop[]) => [...stops].sort((a, b) => a.offset - b.offset)
export const stopsCss = (stops: Stop[], unit: 'percent' | 'degrees') =>
  sorted(stops)
    .map((s) => `${s.color} ${tidy(s.offset * (unit === 'percent' ? 100 : 360))}${unit === 'percent' ? '%' : 'deg'}`)
    .join(', ')
/** A linear gradient's direction in degrees, clockwise from pointing right, as drawn in a square. */
export const angleOf = (g: Extract<Paint, { type: 'linear' }>) =>
  Math.round((Math.atan2(g.to.y - g.from.y, g.to.x - g.from.x) * 180) / Math.PI)
/** A linear gradient across the whole unit box at an angle, through its middle. */
export const linearAt = (deg: number) => {
  const r = (deg * Math.PI) / 180
  const d = { x: Math.cos(r) / 2, y: Math.sin(r) / 2 }
  return { from: { x: tidy(0.5 - d.x), y: tidy(0.5 - d.y) }, to: { x: tidy(0.5 + d.x), y: tidy(0.5 + d.y) } }
}

/** The colour a gradient has at an offset, for a stop added there. */
function colourAt(stops: Stop[], at: number): string {
  const list = sorted(stops)
  const after = list.findIndex((s) => s.offset >= at)
  const b = list[after] ?? list.at(-1)
  const a = list[after - 1] ?? b
  if (!a || !b) return '#000000FF'
  const t = b.offset === a.offset ? 0 : (at - a.offset) / (b.offset - a.offset)
  const channel = (i: number) => {
    const x = Number.parseInt(a.color.slice(i, i + 2), 16)
    const y = Number.parseInt(b.color.slice(i, i + 2), 16)
    return Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  }
  return `#${channel(1)}${channel(3)}${channel(5)}${channel(7)}`
}

/**
 * A gradient's stops on a bar: a click on the bar adds one there in the colour the gradient has,
 * a drag moves one (one undo step), the arrow keys move the focused one, Delete removes it. On a
 * phone each stop takes a touch area round it, and a press where two stops' areas overlap picks the
 * nearer stop.
 */
export function GradientBar({
  paint,
  picked,
  onPick,
  editor,
  p,
  onSet,
}: {
  paint: Gradient
  picked: number
  onPick: (i: number) => void
  editor: Editor
  p: P
  onSet: (to: (now: Gradient) => Gradient) => void
}) {
  const bar = useRef<HTMLDivElement>(null)
  // The stop held, how far across from its middle it was pressed, and the stops there were then.
  const drag = useRef<{ i: number; grab: number; count: number; end: () => void } | null>(null)
  const at = (clientX: number) => {
    const box = bar.current?.getBoundingClientRect()
    return box ? tidy(clamp((clientX - box.left) / box.width, 0, 1)) : 0
  }
  const stopAt = (i: number) => bar.current?.querySelector<HTMLElement>(`[data-stop="${i}"]`) ?? undefined
  const middleOf = (i: number) => {
    const box = stopAt(i)?.getBoundingClientRect()
    return box ? box.left + box.width / 2 : Number.POSITIVE_INFINITY
  }
  /**
   * The stop a press on stop `i` picks: `i` when the press is on its drawing, else, in the touch area
   * round it, the stop whose middle is nearest across, as where two stops' areas overlap.
   */
  const pickedBy = (i: number, x: number, y: number) => {
    const face = stopAt(i)?.getBoundingClientRect()
    if (!face || (x >= face.left && x <= face.right && y >= face.top && y <= face.bottom)) return i
    let nearest = i
    for (const [j] of paint.stops.entries())
      if (Math.abs(middleOf(j) - x) < Math.abs(middleOf(nearest) - x)) nearest = j
    return nearest
  }
  const move = (i: number, offset: number) =>
    onSet((now) => ({
      ...now,
      stops: now.stops.map((s, j) => (j === i ? { ...s, offset: tidy(clamp(offset, 0, 1)) } : s)),
    }))
  /** Puts the stops in order again, the stop at `i` still picked. */
  const settle = (i: number) => {
    let picked = i
    onSet((now) => {
      const next = sorted(now.stops)
      picked = next.indexOf(now.stops[i] as Stop)
      return next.every((s, j) => s === now.stops[j]) ? now : { ...now, stops: next }
    })
    onPick(picked)
  }
  const endDrag = () => {
    const at = drag.current
    if (!at) return
    settle(at.i)
    at.end()
    drag.current = null
  }
  /** Ends a drag's undo step where it is, the stops left as they are. */
  const dropDrag = () => {
    drag.current?.end()
    drag.current = null
  }
  // A drag ends when a stop comes or goes while it is held, since the stop it holds may have moved
  // to another place in the list, and when the bar closes.
  useEffect(() => {
    if (drag.current && drag.current.count !== paint.stops.length) dropDrag()
  })
  useEffect(() => dropDrag, [])
  const remove = (i: number) => {
    if (paint.stops.length <= 2) return
    dropDrag()
    onSet((now) => ({ ...now, stops: now.stops.filter((_, j) => j !== i) }))
    onPick(Math.max(0, i - 1))
  }
  return (
    // The gradient runs left to right in the design whatever the language, as the stage does. On a
    // phone the bar's row is a touch area tall, with room at its sides for half of one past each end.
    <div dir="ltr" className="px-2 max-sm:flex max-sm:h-[44px] max-sm:flex-col max-sm:justify-center max-sm:px-[21px]">
      <div
        ref={bar}
        role="group"
        aria-label={p.stops}
        data-testid="gradient-bar"
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return
          const offset = at(e.clientX)
          onSet((now) => ({ ...now, stops: sorted([...now.stops, { offset, color: colourAt(now.stops, offset) }]) }))
          onPick(sorted([...paint.stops, { offset, color: '' }]).findIndex((s) => s.color === ''))
        }}
        className="checker relative h-6 cursor-copy rounded-row border border-line-strong"
      >
        <span
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: `linear-gradient(90deg, ${stopsCss(sorted(paint.stops), 'percent')})` }}
        />
        {paint.stops.map((stop, i) => (
          <button
            key={i}
            type="button"
            aria-label={format(p.stop, { n: i + 1, at: Math.round(stop.offset * 100) })}
            aria-pressed={picked === i}
            data-stop={i}
            onPointerDown={(e) => {
              e.stopPropagation()
              const held = pickedBy(i, e.clientX, e.clientY)
              if (held !== i) {
                // The nearer stop takes the focus the press would give this one, so Delete removes it.
                e.preventDefault()
                stopAt(held)?.focus()
              }
              onPick(held)
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = {
                i: held,
                grab: e.clientX - middleOf(held),
                count: paint.stops.length,
                end: editor.beginGesture(),
              }
            }}
            onPointerMove={(e) => {
              const held = drag.current
              if (held && e.currentTarget.hasPointerCapture(e.pointerId)) move(held.i, at(e.clientX - held.grab))
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onKeyDown={(e: KeyboardEvent) => {
              const step = e.shiftKey ? 0.1 : 0.01
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                // A nudge and putting the stops in order again are one undo step.
                const end = editor.beginGesture()
                move(i, stop.offset + (e.key === 'ArrowRight' ? step : -step))
                settle(i)
                end()
              } else if (e.key === 'Delete' || e.key === 'Backspace') remove(i)
              else return
              e.preventDefault()
              e.stopPropagation()
            }}
            style={{ left: `${stop.offset * 100}%`, backgroundColor: stop.color }}
            className={cn(
              'absolute top-1/2 size-4 -translate-1/2 cursor-grab touch-pan-y rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35)] active:cursor-grabbing',
              FOCUS_RING,
              picked === i && PICKED_RING,
            )}
          >
            <span aria-hidden className={TOUCH_AREA} />
          </button>
        ))}
      </div>
    </div>
  )
}
