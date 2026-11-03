'use client'

import { FIELD_LABEL, KNOBS, PANEL_BUTTON, PANEL_HEADING } from '@/components/editor/styles.ts'
import { FOCUS_RING } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { tidy } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { type Messages } from '@/lib/i18n/index.ts'

import { Choice, NumberField, PanelPart, Segments, Switch, SwitchRow } from './fields.tsx'
import { factsOf, type P, type PanelProps, type Props, set, shared, type Target } from './target.ts'

type Layout = {
  direction: 'row' | 'column'
  gap: number
  padding: Record<'top' | 'right' | 'bottom' | 'left', number>
  justify: string
  align: string
  wrap: boolean
  lineGap: number
}

type Place = 'start' | 'center' | 'end'

type Sizing = 'fixed' | 'hug' | 'fill'

const PLACES: Place[] = ['start', 'center', 'end']

/** The room between that the Stack panel offers at a tap. */
const GAPS = [0, 8, 16, 32]

/** How a layer sizes on each axis, as the renderer reads it: left unsaid, text hugs as its box mode says and the rest is fixed. */
function sizingOf(type: string, props: Props): { width: Sizing; height: Sizing } {
  const own = props.sizing as { width: Sizing; height: Sizing } | undefined
  if (own) return own
  if (type === 'text')
    return {
      width: props.boxMode === 'autoWidth' ? 'hug' : 'fixed',
      height: props.boxMode === 'fixed' ? 'fixed' : 'hug',
    }
  return { width: 'fixed', height: 'fixed' }
}

/** The Stack panel. A frame inside another auto layout sets its sizing in the Position panel, so this one leaves it out. */
export function AutoLayoutPanel({ target, design }: PanelProps) {
  const t = useMessages()
  return (
    <AutoLayoutCard target={target} p={t.editor.props} b={t.editor.bar} ownSizing={!factsOf(target, design).inFlow} />
  )
}

/** How the layers size on each axis: a menu each, under the axis's name. */
export function SizingFields({
  target,
  p,
  options,
  labels,
}: {
  target: Target
  p: P
  options: readonly Sizing[]
  labels: Record<Sizing, string>
}) {
  const sizings = target.props.map((pr, i) => sizingOf(target.types[i] ?? '', pr))
  return (
    <div className="grid grid-cols-2 gap-x-3">
      {(['width', 'height'] as const).map((axis) => (
        <div key={axis} className="flex min-w-0 flex-col gap-1">
          <span className={FIELD_LABEL}>{p.axes[axis]}</span>
          <Choice
            name={p.sizingAxis[axis]}
            value={shared(sizings.map((sz) => sz[axis]))}
            options={options}
            labels={labels}
            onSet={(to) =>
              set(target, (now, i) => ({ sizing: { ...sizingOf(target.types[i] ?? '', now), [axis]: to } }))
            }
          />
        </div>
      ))}
    </div>
  )
}

/**
 * The Stack panel: auto layout on or off by the switch in its heading; then its direction and
 * wrapping, the room between, at a tap or by number, and together or spread out. Under Advanced, a
 * 3×3 pad that lines up what is inside along both axes at once, the room around and each side's,
 * and, when `ownSizing`, how the frame sizes.
 */
function AutoLayoutCard({
  target,
  p,
  b,
  ownSizing,
}: {
  target: Target
  p: P
  b: Messages['editor']['bar']
  ownSizing: boolean
}) {
  const layouts = target.props.map((pr) => pr.layout as Layout | undefined)
  const on = shared(layouts.map(Boolean))
  const toggle = (
    <Switch
      on={on}
      label={p.autoLayout}
      onSet={() => target.editor.perform('autoLayout')}
      className={cn('group flex cursor-pointer rounded-full', FOCUS_RING)}
    />
  )
  if (on !== true) return <PanelPart id="auto-layout-card" title={p.autoLayout} action={toggle} strong />
  const value = (key: keyof Layout) => shared(layouts.map((l) => l?.[key]))
  const setLayout = (change: (l: Layout) => Partial<Layout>) =>
    set(target, (now) => {
      const l = now.layout as Layout
      return { layout: { ...l, ...change(l) } }
    })
  const direction = value('direction') as Layout['direction'] | 'mixed'
  const justify = value('justify') as string
  const align = value('align') as string
  const gap = value('gap') as number | 'mixed'
  const around = shared(
    layouts.flatMap((l) => (l ? [l.padding.top, l.padding.right, l.padding.bottom, l.padding.left] : [])),
  )
  return (
    <>
      <PanelPart id="auto-layout-card" title={p.autoLayout} action={toggle} strong>
        <span className={PANEL_HEADING}>{p.direction}</span>
        <Segments
          name={p.direction}
          value={direction}
          options={['row', 'column'] as const}
          labels={p.directions}
          onSet={(to) => setLayout(() => ({ direction: to }))}
        />
        <SwitchRow
          name={p.wrap}
          on={value('wrap') === 'mixed' ? 'mixed' : value('wrap') === true}
          onSet={(wrap) => setLayout(() => ({ wrap }))}
        />
        <span className={PANEL_HEADING}>{p.gap}</span>
        <div role="group" aria-label={p.gap} className="grid grid-cols-4 gap-1.5">
          {GAPS.map((to) => (
            <button
              key={to}
              type="button"
              aria-pressed={gap === to}
              data-gap={to}
              onClick={() => setLayout(() => ({ gap: to }))}
              className={cn(
                PANEL_BUTTON,
                'justify-center font-mono tabular-nums aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text',
              )}
            >
              {to}
            </button>
          ))}
        </div>
        <NumberField
          label={p.between}
          name={p.gap}
          value={gap}
          fillRange={[0, 64]}
          editor={target.editor}
          onSet={(to) => setLayout(() => ({ gap: to }))}
          onShift={(by) => setLayout((l) => ({ gap: tidy(l.gap + by) }))}
        />
        <Segments
          name={p.spreadOut}
          value={justify === 'mixed' ? 'mixed' : justify === 'space-between' ? 'between' : 'packed'}
          options={['packed', 'between'] as const}
          labels={p.spreads}
          onSet={(to) =>
            setLayout((l) => ({
              justify: to === 'between' ? 'space-between' : l.justify === 'space-between' ? 'start' : l.justify,
            }))
          }
        />
      </PanelPart>
      <PanelPart id="auto-layout-advanced" title={b.advanced} strong>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-text">{p.lineUp}</span>
          {/* Across the pad is along a row's line (or down a column's), so each cell sets both axes. */}
          <div
            role="group"
            aria-label={p.lineUp}
            dir="ltr"
            className="grid size-[84px] shrink-0 grid-cols-3 gap-[3px] rounded-[10px] bg-hover p-[5px]"
          >
            {PLACES.map((y) =>
              PLACES.map((x) => {
                const [along, across] = direction === 'column' ? [y, x] : [x, y]
                const pressed = align === across && (justify === along || justify === 'space-between')
                return (
                  <button
                    key={`${y}-${x}`}
                    type="button"
                    aria-label={p.padCells[`${y}-${x}`]}
                    aria-pressed={pressed}
                    data-justify={along}
                    data-align={across}
                    onClick={() =>
                      setLayout((l) => {
                        const own = l.direction === 'column' ? { justify: y, align: x } : { justify: x, align: y }
                        return {
                          justify: l.justify === 'space-between' ? 'space-between' : own.justify,
                          align: own.align,
                        }
                      })
                    }
                    className={cn(
                      'grid cursor-pointer place-items-center rounded-[5px] hover:bg-surface after:size-1 after:rounded-full after:bg-subtle aria-pressed:after:h-1.5 aria-pressed:after:w-4 aria-pressed:after:rounded-[2px] aria-pressed:after:bg-accent',
                      FOCUS_RING,
                    )}
                  />
                )
              }),
            )}
          </div>
        </div>
        <NumberField
          label={p.paddingAll}
          name={p.paddingAll}
          value={around}
          editor={target.editor}
          onSet={(v) => setLayout(() => ({ padding: { top: v, right: v, bottom: v, left: v } }))}
          onShift={(by) =>
            setLayout((l) => ({
              padding: {
                top: tidy(l.padding.top + by),
                right: tidy(l.padding.right + by),
                bottom: tidy(l.padding.bottom + by),
                left: tidy(l.padding.left + by),
              },
            }))
          }
        />
        <div className={KNOBS}>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <NumberField
              key={side}
              label={p.paddingSides[side]}
              name={p.padding[side]}
              value={shared(layouts.map((l) => l?.padding[side] ?? 0))}
              editor={target.editor}
              onSet={(v) => setLayout((l) => ({ padding: { ...l.padding, [side]: v } }))}
              onShift={(by) => setLayout((l) => ({ padding: { ...l.padding, [side]: tidy(l.padding[side] + by) } }))}
            />
          ))}
        </div>
        {ownSizing && <SizingFields target={target} p={p} options={['hug', 'fill', 'fixed']} labels={p.sizings} />}
      </PanelPart>
    </>
  )
}
