'use client'

// The Position panel: the moves along the stack and lining up, then under Advanced the box's size,
// place and turn, and how a layer in an auto layout sizes.
import {
  AlignBottomIcon,
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  ArrowDownIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowsOutLineHorizontalIcon,
  ArrowsOutLineVerticalIcon,
  ArrowUpIcon,
  type Icon,
} from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'

import { type ShortcutAction } from '@dazbee/editor'

import { ALIGN, keyOf } from '@/components/editor/arrange-actions.ts'
import { KNOB_SWITCH, KNOBS, PANEL_ACTION, PANEL_HEADING, PANEL_PART } from '@/components/editor/styles.ts'
import type { ORDER } from '@/components/editor/top-bar/top-bar-more.tsx'
import { cn } from '@/lib/cn.ts'
import { LIMITS } from '@/lib/editor/limits.ts'
import { sizeTo, tidy } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { SizingFields } from './auto-layout-panel.tsx'
import { clamp, NumberField, PanelPart, Switch, SwitchRow } from './fields.tsx'
import { factsOf, num, type P, type PanelProps, type Patch, type Props, set, shared, type Target } from './target.ts'

/** The four moves along the stack, two to a row: a step forward and back, then all the way. */
const MOVES: { action: (typeof ORDER)[number]; icon: Icon }[] = [
  { action: 'bringForward', icon: ArrowUpIcon },
  { action: 'sendBackward', icon: ArrowDownIcon },
  { action: 'bringToFront', icon: ArrowLineUpIcon },
  { action: 'sendToBack', icon: ArrowLineDownIcon },
]

/** One layer lines up with its frame by these, two to a row: each up-down one beside its across one. */
const FRAME_ALIGN = [
  { action: 'alignTop', icon: AlignTopIcon },
  { action: 'alignLeft', icon: AlignLeftIcon },
  { action: 'alignMiddle', icon: AlignCenterVerticalIcon },
  { action: 'alignCentre', icon: AlignCenterHorizontalIcon },
  { action: 'alignBottom', icon: AlignBottomIcon },
  { action: 'alignRight', icon: AlignRightIcon },
] as const satisfies readonly { action: ShortcutAction; icon: Icon }[]

/** Three or more layers spread out evenly, across or down. */
const SPREAD = [
  { action: 'distributeHorizontal', icon: ArrowsOutLineHorizontalIcon },
  { action: 'distributeVertical', icon: ArrowsOutLineVerticalIcon },
] as const satisfies readonly { action: ShortcutAction; icon: Icon }[]

/** The Position panel: lining up and the stack's order, then the box's numbers under Advanced. */
export function PositionPanel({ target, design }: PanelProps) {
  const t = useMessages()
  const p = t.editor.props
  const { inFlow } = factsOf(target, design)
  return (
    <>
      <ArrangePart target={target} placed={inFlow && target.props.every((pr) => pr.absolute !== true)} />
      <PlaceCard target={target} p={p} title={t.editor.bar.advanced}>
        {inFlow && <FlowPart target={target} p={p} />}
      </PlaceCard>
    </>
  )
}

/** The layers' turn in degrees, wrapping round at 360; groups and booleans turn with what they hold. */
export function RotationField({ target, p, label = '↻' }: { target: Target; p: P; label?: string }) {
  return (
    <NumberField
      label={label}
      unit="°"
      name={p.rotationName}
      value={shared(target.props.map((pr) => num(pr, 'rotation') ?? 0))}
      // A turn wraps round at 360, so any number typed is one.
      min={Number.NEGATIVE_INFINITY}
      max={Number.POSITIVE_INFINITY}
      editor={target.editor}
      onSet={(v) => set(target, () => ({ rotation: tidy(((v % 360) + 360) % 360) }))}
      onShift={(by) =>
        set(target, (now) => ({ rotation: tidy(((((num(now, 'rotation') ?? 0) + by) % 360) + 360) % 360) }))
      }
    />
  )
}

/**
 * The Position panel's simple choices: the four moves along the stack, then lining up. One layer
 * lines up with its frame, by name, unless an auto layout places it (`placed`); several line up
 * with each other, by icon, and three or more spread out evenly. Each button runs its shortcut's action, and its tooltip names the shortcut.
 */
function ArrangePart({ target, placed }: { target: Target; placed: boolean }) {
  const t = useMessages()
  const a = t.editor.arrange
  const placing = t.editor.bar.placing
  const run = (action: ShortcutAction) => target.editor.perform(action)
  const tip = (label: string, action: ShortcutAction) => format(a.withKey, { label, key: keyOf(action) })
  const several = target.ids.length > 1
  // Spreading needs a layer between the two at the ends.
  const spreads = target.ids.length >= 3
  return (
    <section aria-labelledby="arrange-part-title" className={PANEL_PART} data-testid="arrange-part">
      <h3 id="arrange-part-title" className={PANEL_HEADING}>
        {placing.arrange}
      </h3>
      <div className="grid grid-cols-2 gap-1.5">
        {MOVES.map(({ action, icon: Icon }) => (
          <button
            key={action}
            type="button"
            data-action={action}
            title={tip(a[action], action)}
            onClick={() => run(action)}
            className={PANEL_ACTION}
          >
            <Icon size={14} aria-hidden className="shrink-0" />
            <span>{placing[action]}</span>
          </button>
        ))}
      </div>
      {several ? (
        <>
          <h3 className={PANEL_HEADING}>{placing.lineUpSelection}</h3>
          <div dir="ltr" className="grid grid-cols-3 gap-1.5">
            {ALIGN.map(({ action, icon: Icon }) => (
              <button
                key={action}
                type="button"
                data-action={action}
                aria-label={a[action]}
                title={tip(a[action], action)}
                onClick={() => run(action)}
                className={cn(PANEL_ACTION, 'justify-center')}
              >
                <Icon size={16} aria-hidden />
              </button>
            ))}
          </div>
          <div className="grid gap-1.5">
            {SPREAD.map(({ action, icon: Icon }) => (
              <button
                key={action}
                type="button"
                data-action={action}
                disabled={!spreads}
                title={spreads ? tip(a[action], action) : placing.needsThree}
                onClick={() => run(action)}
                className={PANEL_ACTION}
              >
                <Icon size={14} aria-hidden className="shrink-0" />
                <span>{placing[action]}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        !placed && (
          <>
            <h3 className={PANEL_HEADING}>{placing.lineUpFrame}</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {FRAME_ALIGN.map(({ action, icon: Icon }) => (
                <button
                  key={action}
                  type="button"
                  data-action={action}
                  title={tip(a[action], action)}
                  onClick={() => run(action)}
                  className={PANEL_ACTION}
                >
                  <Icon size={15} aria-hidden className="shrink-0" />
                  <span>{placing[action]}</span>
                </button>
              ))}
            </div>
          </>
        )
      )}
    </section>
  )
}

/**
 * The Position panel's numbers, under Advanced: the box's width and height, then where it sits, then
 * its turn, two to a row. With Lock ratio on, a width or height set moves the other side with it.
 * Groups and booleans take their box from what they hold, so they have only X and Y. A layer in an
 * auto layout has its sizing in `children`, under them.
 */
function PlaceCard({ target, p, title, children }: { target: Target; p: P; title: string; children?: ReactNode }) {
  const placing = useMessages().editor.bar.placing
  const [keepRatio, setKeepRatio] = useState(false)
  const sized = target.types.every((type) => type !== 'group' && type !== 'boolean')
  const resize = (now: Props, axis: 'width' | 'height', to: number): Patch => {
    // The side Lock ratio moves stops where a typed side would.
    const size = Object.fromEntries(
      Object.entries(sizeTo({ width: num(now, 'width'), height: num(now, 'height') }, axis, to, keepRatio)).map(
        ([key, v]) => [key, Math.min(v, LIMITS.any)],
      ),
    )
    // Text given a height of its own gets a fixed box: an auto one would grow back to its words.
    return 'boxMode' in now && now.boxMode !== 'fixed' && (axis === 'height' || size.height !== num(now, 'height'))
      ? { ...size, boxMode: 'fixed' }
      : size
  }
  const sides = [
    { key: 'width', label: p.width, name: p.widthName },
    { key: 'height', label: p.height, name: p.heightName },
  ] as const
  const spots = [
    { key: 'x', label: p.x, name: p.xName },
    { key: 'y', label: p.y, name: p.yName },
  ] as const
  return (
    <PanelPart id="layout-card" title={title} strong>
      <div className={KNOBS}>
        {sized &&
          sides.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              name={f.name}
              value={shared(target.props.map((pr) => num(pr, f.key)))}
              min={0}
              editor={target.editor}
              onSet={(v) => set(target, (now) => resize(now, f.key, v))}
              onShift={(by) => set(target, (now) => resize(now, f.key, tidy(clamp(num(now, f.key) + by, 0))))}
            />
          ))}
        {spots.map((f) => (
          <NumberField
            key={f.key}
            label={f.label}
            name={f.name}
            value={shared(target.props.map((pr) => num(pr, f.key)))}
            editor={target.editor}
            onSet={(v) => set(target, () => ({ [f.key]: v }))}
            onShift={(by) => set(target, (now) => ({ [f.key]: tidy(num(now, f.key) + by) }))}
          />
        ))}
        {sized && <RotationField target={target} p={p} label={placing.rotate} />}
        {sized && (
          <Switch on={keepRatio} onSet={setKeepRatio} className={KNOB_SWITCH}>
            {placing.lockRatio}
          </Switch>
        )}
      </div>
      {children}
    </PanelPart>
  )
}

/**
 * A layer in an auto layout, in the Position panel's Advanced: on each axis its own size, fitting
 * its content or filling the room, and kept where it is put, out of the flow.
 */
function FlowPart({ target, p }: { target: Target; p: P }) {
  return (
    <div role="group" aria-labelledby="flow-card-title" data-testid="flow-card" className="flex flex-col gap-2.5">
      <h4 id="flow-card-title" className={cn(PANEL_HEADING, 'pt-1.5')}>
        {p.inAutoLayout}
      </h4>
      <SizingFields target={target} p={p} options={['fixed', 'hug', 'fill']} labels={p.childSizings} />
      <SwitchRow
        name={p.absolute}
        on={shared(target.props.map((pr) => pr.absolute === true))}
        onSet={(absolute) => set(target, () => ({ absolute: absolute ? true : undefined }))}
      />
    </div>
  )
}
