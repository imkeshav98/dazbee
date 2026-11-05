'use client'

// The top bar's pop-ups for the selection: how much it shows through, a shape's own settings, the
// corners, a box's clip, a boolean's operation, a mask, and text's alignment, list and case.
import { BlendMode, BooleanOp, ContainerBlendMode, type Design, LineEnd, type Shape } from '@dazbee/schema'

import { COMBINE } from '@/components/editor/arrange-actions.ts'
import { FIELD_LABEL, KNOBS } from '@/components/editor/styles.ts'
import { SEGMENT, SEGMENTS } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { tidy } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { type Messages } from '@/lib/i18n/index.ts'

import { Choice, clamp, NumberField, PanelPart, Segments, SwitchRow } from './fields.tsx'
import {
  factsOf,
  num,
  type P,
  type Patch,
  type Props,
  set,
  type ShapeKind,
  shared,
  type Target,
  textStyle,
} from './target.ts'

/** Corners as a rectangle and a box keep them: one radius, or each corner's own. */
type Corners = { cornerRadius?: number | undefined; corners?: readonly number[] | undefined }

/** The corners as the shape stores them, from the top left clockwise. */
const CORNERS = ['tl', 'tr', 'br', 'bl'] as const

/**
 * The order the fields sit in, two by two as the corners do: top left, top right, bottom left,
 * bottom right. They keep left to right in either direction, as the ad does.
 */
const CORNER_FIELDS = [0, 1, 3, 2] as const

/** A label over a row of the text's Align pop-up. */
const ALIGN_ROW_LABEL = 'px-1 pt-1 text-[11px] font-semibold text-muted first:pt-0'

/** How each case shows on its button: the same letters in every language, as a font sample is. */
const CASE_MARKS = { none: 'Ab', upper: 'AB', lower: 'ab', title: 'Aa' }

/** Each operation's action, which names it and gives its icon. */
const OPERATIONS = {
  union: 'booleanUnion',
  subtract: 'booleanSubtract',
  intersect: 'booleanIntersect',
  exclude: 'booleanExclude',
} as const

/** A rectangle's corners live in its shape; a key set to undefined leaves the shape. */
const shapeCorners = {
  read: (props: Props) => props.shape as Corners,
  write: (now: Props, next: Corners): Patch => ({
    shape: Object.fromEntries(
      Object.entries({ ...(now.shape as Record<string, unknown>), ...next }).filter(([, v]) => v !== undefined),
    ),
  }),
}

/** A box keeps its corners in one prop: a number for all four, or each corner's own. */
const boxCorners = {
  read: (props: Props): Corners => {
    const value = props.cornerRadius as number | readonly number[] | undefined
    return typeof value === 'object' ? { cornerRadius: value[0], corners: value } : { cornerRadius: value ?? 0 }
  },
  write: (now: Props, next: Corners): Patch => {
    const { cornerRadius = 0, corners } = { ...boxCorners.read(now), ...next }
    return { cornerRadius: corners ? [...corners] : cornerRadius }
  },
}

/** What a top bar pop-up holds for the selection: a short card or a row of choices. */
export function PopupContent({ popup, target, design }: { popup: string; target: Target; design: Design }) {
  const t = useMessages()
  const p = t.editor.props
  const facts = factsOf(target, design)
  const body = (() => {
    switch (popup) {
      case 'transparency':
        return <SeeThroughCard target={target} p={p} />
      case 'shape':
        return facts.ownShape && <ShapeCard target={target} p={p} kind={facts.ownShape} />
      case 'corners':
        return facts.boxes ? (
          <BoxCard target={target} p={p} />
        ) : (
          facts.ownShape === 'rect' && <ShapeCard target={target} p={p} kind="rect" />
        )
      case 'box':
        return <BoxCard target={target} p={p} />
      case 'combine':
        return <CombineCard target={target} p={p} a={t.editor.arrange} />
      case 'mask':
        return <MaskCard target={target} p={p} />
      case 'align':
        return <TextAlignBody target={target} p={p} />
      case 'list':
        return <TextListBody target={target} p={p} />
      case 'case':
        return <TextCaseBody target={target} p={p} />
      default:
        return null
    }
  })()
  return body
}

/** How much the layers show through, and how they blend with what is under them; last for every selection. */
function SeeThroughCard({ target, p }: { target: Target; p: P }) {
  const containers = target.types.every((type) => type === 'group' || type === 'box')
  const modes = containers ? ContainerBlendMode.options : BlendMode.options
  return (
    <PanelPart id="appearance-card" title={p.seeThrough}>
      <div className={KNOBS}>
        <NumberField
          label={p.opacity}
          unit="%"
          name={p.opacity}
          value={shared(target.props.map((pr) => num(pr, 'opacity') ?? 1))}
          scale={100}
          min={0}
          max={1}
          editor={target.editor}
          onSet={(v) => set(target, () => ({ opacity: tidy(v) }))}
          onShift={(by) => set(target, (now) => ({ opacity: tidy(clamp((num(now, 'opacity') ?? 1) + by, 0, 1)) }))}
        />
        <Choice
          name={p.blend}
          value={shared(target.props.map((pr) => pr.blendMode as string))}
          options={modes as readonly string[]}
          labels={p.blends as Record<string, string>}
          onSet={(mode) => set(target, () => ({ blendMode: mode }))}
        />
      </div>
    </PanelPart>
  )
}

/**
 * A shape's own settings (#151), for layers that are all the same kind: a rectangle's corner radius
 * or each corner's own, a polygon's sides, a star's points and inner radius, a line's ends.
 */
function ShapeCard({ target, p, kind }: { target: Target; p: P; kind: ShapeKind }) {
  const shapes = target.props.map((pr) => pr.shape as Shape)
  const value = (key: string) =>
    shared(shapes.map((s) => (s as Record<string, unknown>)[key])) as number | string | 'mixed' | undefined
  const setShape = (change: (now: Record<string, unknown>) => Record<string, unknown>) =>
    set(target, (now) => ({
      shape: { ...(now.shape as Record<string, unknown>), ...change(now.shape as Record<string, unknown>) },
    }))
  /** A knob, as in the mock: its range is what designs mostly use, and the shape keeps the schema's limits. */
  const knob = (
    key: string,
    name: string,
    {
      min,
      max,
      scale = 1,
      unit,
      whole = true,
    }: { min: number; max: number; scale?: number; unit?: string; whole?: boolean },
  ) => {
    const to = (n: number) => clamp(whole ? Math.round(n) : tidy(n), min, max)
    return (
      <NumberField
        label={name}
        name={name}
        value={value(key) as number | 'mixed' | undefined}
        min={min}
        max={max}
        scale={scale}
        unit={unit}
        editor={target.editor}
        onSet={(n) => setShape(() => ({ [key]: to(n) }))}
        onShift={(by) => setShape((now) => ({ [key]: to(((now[key] as number | undefined) ?? min) + by) }))}
      />
    )
  }
  return (
    <PanelPart id="shape-card" title={p.shapeKinds[kind]} note={target.names.join(', ')}>
      {kind === 'line' ? (
        <div className="grid grid-cols-2 gap-x-3">
          {(['start', 'end'] as const).map((end) => (
            <label key={end} className={cn('flex min-w-0 flex-col gap-1', FIELD_LABEL)}>
              {p.lineEndShort[end]}
              <Choice
                name={p.lineEnd[end]}
                value={value(end) as LineEnd | 'mixed' | undefined}
                options={LineEnd.options}
                labels={p.lineEnds}
                onSet={(v) => setShape(() => ({ [end]: v }))}
              />
            </label>
          ))}
        </div>
      ) : (
        <>
          <div className={cn(KNOBS, 'empty:hidden')}>
            {kind === 'polygon' && knob('sides', p.sides, { min: 3, max: 24 })}
            {kind === 'star' && knob('points', p.points, { min: 3, max: 24 })}
            {kind === 'star' &&
              knob('innerRadius', p.innerRadius, { min: 0.05, max: 0.95, scale: 100, unit: '%', whole: false })}
            {kind !== 'rect' && knob('cornerRadius', p.cornerRadius, { min: 0, max: 200 })}
          </div>
          {kind === 'rect' && <CornerFields target={target} p={p} {...shapeCorners} />}
        </>
      )}
    </PanelPart>
  )
}

/**
 * A box's corners: one radius for all, or with "Each corner its own" a radius for each, starting at
 * the one radius they had. `read` finds the corners in a layer's props and `write` puts them back.
 */
function CornerFields({
  target,
  p,
  read,
  write,
}: {
  target: Target
  p: P
  read: (props: Props) => Corners
  write: (now: Props, next: Corners) => Patch
}) {
  const all = target.props.map(read)
  const each = all.every((c) => c.corners)
  const radius = (n: number) => clamp(Math.round(n), 0, 200)
  const eachCorner = (on: boolean) =>
    set(target, (now) => {
      const { cornerRadius = 0, corners } = read(now)
      return write(
        now,
        on
          ? { corners: corners ?? [cornerRadius, cornerRadius, cornerRadius, cornerRadius] }
          : { cornerRadius: corners?.[0] ?? cornerRadius, corners: undefined },
      )
    })
  const setCorner = (i: number, to: (r: number) => number) =>
    set(target, (now) => {
      const corners = [...(read(now).corners ?? [0, 0, 0, 0])]
      corners[i] = tidy(Math.max(0, to(corners[i] ?? 0)))
      return write(now, { corners })
    })
  return (
    <>
      {!each && (
        <div className={KNOBS}>
          <NumberField
            label={p.cornerRadius}
            name={p.cornerRadius}
            value={shared(all.map((c) => c.cornerRadius ?? 0))}
            min={0}
            max={200}
            editor={target.editor}
            onSet={(n) => set(target, (now) => write(now, { cornerRadius: radius(n) }))}
            onShift={(by) =>
              set(target, (now) => write(now, { cornerRadius: radius((read(now).cornerRadius ?? 0) + by) }))
            }
          />
        </div>
      )}
      <SwitchRow name={p.eachCorner} on={each} onSet={eachCorner} />
      {each && (
        <div dir="ltr" className={KNOBS}>
          {CORNER_FIELDS.map((i) => (
            <NumberField
              key={CORNERS[i]}
              label={p.cornersShort[CORNERS[i]]}
              name={p.corners[CORNERS[i]]}
              value={shared(all.map((c) => c.corners?.[i]))}
              min={0}
              editor={target.editor}
              onSet={(v) => setCorner(i, () => v)}
              onShift={(by) => setCorner(i, (r) => r + by)}
            />
          ))}
        </div>
      )}
    </>
  )
}

/** A box: whether what is inside shows past its edges. */
function BoxCard({ target, p }: { target: Target; p: P }) {
  return (
    <PanelPart id="box-card" title={p.box}>
      <CornerFields target={target} p={p} {...boxCorners} />
      <SwitchRow
        name={p.clip}
        on={shared(target.props.map((pr) => pr.clip !== false))}
        onSet={(clip) => set(target, () => ({ clip }))}
      />
    </PanelPart>
  )
}

/**
 * A boolean's operation, changed in place: its shapes added together, the rest cut from the first,
 * where they overlap, or where they don't.
 */
function CombineCard({ target, p, a }: { target: Target; p: P; a: Messages['editor']['arrange'] }) {
  const value = shared(target.props.map((pr) => pr.op as (typeof BooleanOp.options)[number]))
  return (
    <PanelPart id="combine-card" title={p.combine}>
      <div role="radiogroup" aria-label={p.combine} className={SEGMENTS}>
        {BooleanOp.options.map((op) => {
          const action = OPERATIONS[op]
          const Icon = COMBINE.find((c) => c.action === action)?.icon
          const name = a[action]
          return (
            <button
              key={op}
              type="button"
              role="radio"
              aria-checked={value === op}
              aria-label={name}
              title={name}
              data-value={op}
              onClick={() => set(target, () => ({ op }))}
              className={cn(SEGMENT, 'grid place-items-center')}
            >
              {Icon && <Icon size={16} aria-hidden />}
            </button>
          )
        })}
      </div>
    </PanelPart>
  )
}

/** A mask: by its shape (where it is opaque) or by its brightness. */
function MaskCard({ target, p }: { target: Target; p: P }) {
  return (
    <PanelPart id="mask-card" title={p.mask}>
      <div className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>{p.maskBy}</span>
        <Segments
          name={p.maskBy}
          value={shared(target.props.map((pr) => pr.mask as 'alpha' | 'luminance'))}
          options={['alpha', 'luminance'] as const}
          labels={p.maskTypes}
          onSet={(mask) => target.editor.session.run('node.mask', { ids: target.ids, mask })}
        />
      </div>
    </PanelPart>
  )
}

/**
 * The text's Align pop-up: three labelled rows, how its lines line up, which way they read, and
 * where they sit up and down in the box.
 */
function TextAlignBody({ target, p }: { target: Target; p: P }) {
  const bar = useMessages().editor.bar
  const rows = bar.alignRows
  const value = <T extends string>(key: string, unset: T) => shared(target.props.map((pr) => (pr[key] ?? unset) as T))
  return (
    // On a phone every choice is a finger's height.
    <div className="flex w-72 flex-col gap-1.5 p-1 max-sm:[&_[role=radio]]:h-[44px]">
      <span id="text-align-label" className={ALIGN_ROW_LABEL}>
        {rows.align}
      </span>
      <Segments
        labelledBy="text-align-label"
        testId="text-align"
        value={value<'start' | 'center' | 'end' | 'justify'>('align', 'start')}
        options={['start', 'center', 'end', 'justify'] as const}
        labels={p.textAligns}
        onSet={(align) => set(target, () => ({ align }))}
      />
      <span id="text-direction-label" className={ALIGN_ROW_LABEL}>
        {rows.direction}
      </span>
      <Segments
        labelledBy="text-direction-label"
        testId="text-direction"
        value={value<'auto' | 'ltr' | 'rtl'>('direction', 'auto')}
        options={['auto', 'ltr', 'rtl'] as const}
        labels={bar.textDirections}
        onSet={(direction) => set(target, () => ({ direction }))}
      />
      <span id="text-vertical-label" className={ALIGN_ROW_LABEL}>
        {rows.vertical}
      </span>
      <Segments
        labelledBy="text-vertical-label"
        testId="text-vertical"
        value={value<'top' | 'middle' | 'bottom'>('verticalAlign', 'top')}
        options={['top', 'middle', 'bottom'] as const}
        labels={p.verticalAligns}
        onSet={(verticalAlign) => set(target, () => ({ verticalAlign }))}
      />
    </div>
  )
}

/** The text's list, as the top bar's List pop-up shows it: none, bullets or numbers. */
function TextListBody({ target, p }: { target: Target; p: P }) {
  return (
    <div className="flex w-64 flex-col p-1">
      <Segments
        name={p.list}
        value={shared(target.props.map((pr) => (pr.list ?? 'none') as 'none' | 'bullet' | 'number'))}
        options={['none', 'bullet', 'number'] as const}
        labels={p.lists}
        onSet={(list) => set(target, () => ({ list: list === 'none' ? undefined : list }))}
      />
    </div>
  )
}

/** The text's case, as the top bar's aA pop-up shows it. */
function TextCaseBody({ target, p }: { target: Target; p: P }) {
  const { style, setStyle } = textStyle(target)
  return (
    <div className="flex w-56 flex-col p-1">
      <Segments
        name={p.textCase}
        value={(style('textCase') ?? 'none') as 'none' | 'upper' | 'lower' | 'title' | 'mixed'}
        options={['none', 'upper', 'lower', 'title'] as const}
        labels={p.textCases}
        marks={CASE_MARKS}
        onSet={(v) => setStyle('textCase', v)}
      />
    </div>
  )
}
