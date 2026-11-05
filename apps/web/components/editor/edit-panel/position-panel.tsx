'use client'

// The Position panel, the one home of how the selected layers sit: their size, place and turn, then
// their order in the stack, then for one layer lining it up with its frame, and how a layer in an
// auto layout sizes. A lock greys all but the order, each greyed control saying why.
import { ArrowDownIcon, ArrowLineDownIcon, ArrowLineUpIcon, ArrowUpIcon, type Icon } from '@phosphor-icons/react'
import { useState } from 'react'

import { type ShortcutAction } from '@dazbee/editor'

import { ALIGN, keyOf } from '@/components/editor/arrange-actions.ts'
import { KNOB_SWITCH, KNOBS, PANEL_ACTION, PANEL_HEADING, PANEL_PART, SWITCH } from '@/components/editor/styles.ts'
import { GreyedButton } from '@/components/ui/greyed.tsx'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { LIMITS } from '@/lib/editor/limits.ts'
import { sizeTo, tidy } from '@/lib/editor/size.ts'
import { stackEnds } from '@/lib/editor/stack-ends.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format, type Messages } from '@/lib/i18n/index.ts'

import { SizingFields } from './auto-layout-panel.tsx'
import { clamp, NumberField, Switch, SwitchRow } from './fields.tsx'
import { factsOf, num, type P, type PanelProps, type Patch, type Props, set, shared, type Target } from './target.ts'

/** The four moves along the stack, two to a row: a step forward and back, then all the way. */
const MOVES = [
  { action: 'bringForward', icon: ArrowUpIcon, front: true },
  { action: 'sendBackward', icon: ArrowDownIcon, front: false },
  { action: 'bringToFront', icon: ArrowLineUpIcon, front: true },
  { action: 'sendToBack', icon: ArrowLineDownIcon, front: false },
] as const satisfies readonly { action: ShortcutAction; icon: Icon; front: boolean }[]

/** The mark the Position button and the Rotate field show a turn with, the same in every language. */
export const TURN_MARK = '↻'

/**
 * The Position panel: the numbers, then Order, then for one layer Line up with the frame (several
 * have theirs on the bar), then a layer's sizing in its auto layout.
 */
export function PositionPanel({ target, design }: PanelProps) {
  const t = useMessages()
  const b = t.editor.bar
  const p = t.editor.props
  const { inFlow, placed, locked } = factsOf(target, design)
  const lock = locked.length > 0 ? b.lockedRow : null
  const ends = stackEnds(design, target.ids)
  return (
    <>
      <PlaceCard target={target} p={p} why={lock} />
      <section aria-labelledby="order-part-title" className={PANEL_PART} data-testid="order-part">
        <h3 id="order-part-title" className={PANEL_HEADING}>
          {b.order}
        </h3>
        <div className="grid grid-cols-2 gap-1.5 max-sm:gap-[8px]">
          {MOVES.map(({ action, icon, front }) => (
            <PanelAction
              key={action}
              target={target}
              action={action}
              icon={icon}
              why={front ? (ends.front ? b.atFront : null) : ends.back ? b.atBack : null}
            />
          ))}
        </div>
      </section>
      {target.ids.length === 1 && (
        <section aria-labelledby="line-up-part-title" className={PANEL_PART} data-testid="line-up-part">
          <h3 id="line-up-part-title" className={PANEL_HEADING}>
            {b.placing.lineUpFrame}
          </h3>
          <div dir="ltr" className="grid grid-cols-3 gap-1.5 max-sm:gap-[8px]">
            {ALIGN.map(({ action, icon }) => (
              <PanelAction
                key={action}
                target={target}
                action={action}
                icon={icon}
                why={lock ?? (placed ? b.placedByLayout : null)}
              />
            ))}
          </div>
        </section>
      )}
      {inFlow && !lock && <FlowPart target={target} p={p} />}
    </>
  )
}

/** The layers' turn in degrees, wrapping round at 360; groups and booleans turn with what they hold. */
export function RotationField({ target, p, label, why }: { target: Target; p: P; label: string; why: string | null }) {
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
      why={why}
      onSet={(v) => set(target, () => ({ rotation: tidy(((v % 360) + 360) % 360) }))}
      onShift={(by) =>
        set(target, (now) => ({ rotation: tidy(((((num(now, 'rotation') ?? 0) + by) % 360) + 360) % 360) }))
      }
    />
  )
}

/**
 * The Position panel's numbers, with no heading: the box's width and height, then where it sits,
 * then its turn and Lock ratio, two to a row. With Lock ratio on, a width or height set moves the
 * other side with it. Groups and booleans take their box from what they hold, so they have only X
 * and Y. While `why` says the layers are locked, each is greyed, saying so.
 */
function PlaceCard({ target, p, why }: { target: Target; p: P; why: string | null }) {
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
    <div className={PANEL_PART} data-testid="layout-card">
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
              why={why}
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
            why={why}
            onSet={(v) => set(target, () => ({ [f.key]: v }))}
            onShift={(by) => set(target, (now) => ({ [f.key]: tidy(num(now, f.key) + by) }))}
          />
        ))}
        {sized && <RotationField target={target} p={p} label={placing.rotate} why={why} />}
        {sized &&
          (why ? (
            <GreyedButton why={why} role="switch" aria-checked={false} data-testid="lock-ratio" className={KNOB_SWITCH}>
              {placing.lockRatio}
              <span aria-hidden className={SWITCH} />
            </GreyedButton>
          ) : (
            <Switch on={keepRatio} onSet={setKeepRatio} testId="lock-ratio" className={KNOB_SWITCH}>
              {placing.lockRatio}
            </Switch>
          ))}
      </div>
    </div>
  )
}

/**
 * One of Position's buttons that runs an editor action: its icon and name, its shortcut in a
 * tooltip; greyed while `why` says it has nothing to do, saying so instead. 44 px tall on a phone.
 */
function PanelAction({
  target,
  action,
  icon: Shown,
  why,
}: {
  target: Target
  action: ShortcutAction & keyof Messages['editor']['bar']['placing']
  icon: Icon
  why: string | null
}) {
  const t = useMessages()
  const name = t.editor.bar.placing[action]
  const look = cn(PANEL_ACTION, 'max-sm:h-[44px]')
  const face = (
    <>
      <Shown size={15} aria-hidden className="shrink-0" />
      <span>{name}</span>
    </>
  )
  if (why)
    return (
      <GreyedButton why={why} data-action={action} className={look}>
        {face}
      </GreyedButton>
    )
  return (
    <Tooltip label={format(t.editor.arrange.withKey, { label: name, key: keyOf(action) })}>
      <button type="button" data-action={action} onClick={() => target.editor.perform(action)} className={look}>
        {face}
      </button>
    </Tooltip>
  )
}

/**
 * A layer in an auto layout, last in Position: on each axis its own size, fitting its content or
 * filling the room, and kept where it is put, out of the flow.
 */
function FlowPart({ target, p }: { target: Target; p: P }) {
  return (
    <section aria-labelledby="flow-card-title" data-testid="flow-card" className={PANEL_PART}>
      <h3 id="flow-card-title" className={PANEL_HEADING}>
        {p.inAutoLayout}
      </h3>
      <SizingFields target={target} p={p} options={['fixed', 'hug', 'fill']} labels={p.childSizings} />
      <SwitchRow
        name={p.absolute}
        on={shared(target.props.map((pr) => pr.absolute === true))}
        onSet={(absolute) => set(target, () => ({ absolute: absolute ? true : undefined }))}
      />
    </section>
  )
}
