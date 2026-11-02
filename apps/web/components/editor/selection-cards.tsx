'use client'

// The selection's property cards, every one open: the header card with the box, then the numbers
// of each kind (the shape, the photo's fit and adjustments, the text's spacing and box, auto layout),
// and See-through last; and the bodies of the bar's popovers (the text's size, colour and align, the
// fills, the strokes, the photo's filters, the effects). A value the selected layers don't share
// shows as mixed; setting it gives them all the same one, and scrubbing or the arrow keys move each
// from its own. With more than one format the changes go to every format or to this one only. Each
// change is one undo step, and a drag on a number, however long, is one too.
import * as Popover from '@radix-ui/react-popover'
import { ArrowsHorizontalIcon, ArrowsVerticalIcon, CaretDownIcon, ImageSquareIcon, RectangleIcon } from '@phosphor-icons/react'
import { withImage, type Editor } from '@dazbee/editor'
import { BlendMode, boundFillIndex, brandRef, ContainerBlendMode, ImageFilter, LineEnd, type Design, type Effect, type ImageAdjust, type Paint, type Shape } from '@dazbee/schema'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { format, type Messages } from '../../lib/i18n/index.ts'
import { Select } from '../ui/select.tsx'
import { CARD, CARD_LOWER, CardHeader, PICKED_RING, SWATCHES } from './card.tsx'
import { CHIP, CHIP_ACCENT, DASHED_BUTTON, FIELD, FIELD_LABEL, FOCUS_RING, KNOBS, KNOBS_FOUR, LINK_BUTTON, POPOVER, SEGMENT, SEGMENTS, SWATCH, SWITCH, SWITCH_ROW, TILE, TILE_FACE, TILE_FACE_WIDE } from './styles.ts'
import { ImagePickerButton } from './image-tool.tsx'
import { useBrandKit } from './use-brand-kit.ts'
import { useLiveDesign } from './use-live-design.ts'
import { setEveryFormat, useEveryFormat } from './scope-store.ts'
import { Choice, clamp, ColorField, NumberField, tidy } from './fields.tsx'
import { AddButton, PaintRow, RemoveButton, Stack } from './paint-stack.tsx'

type Props = Readonly<Record<string, unknown>>
type Patch = Record<string, unknown>
type P = Messages['editor']['props']

const NEW_FILL: Paint = { type: 'solid', color: '#D9D9D9FF' }
/** A fill + adds over others: a see-through wash, so what was there still shows through it. */
const FILL_ON_TOP: Paint = { type: 'solid', color: '#00000033' }
const NEW_STROKE = { paint: { type: 'solid', color: '#1A1420FF' } as Paint, width: 2, align: 'center' as const }

/** What the cards act on: the layers, the frame they are shown in, and where changes go. */
export interface Target {
  editor: Editor
  ids: string[]
  pageId: string
  formatId: string
  everyFormat: boolean
  /** Each layer's values in the frame: its own, with its format's overrides on top. */
  props: Props[]
  types: string[]
  /** The layers' names, for a card's note. */
  names: string[]
}

export const set = (target: Target, to: (now: Props, i: number) => Patch | null) => {
  const index = new Map(target.ids.map((id, i) => [id, i]))
  return target.editor.setProps(target.ids, (id, now) => to(now, index.get(id) ?? 0), target.everyFormat, target.pageId, target.formatId)
}

/** The one value every layer has, or 'mixed'. */
export function shared<T>(values: T[]): T | 'mixed' {
  const [first] = values
  const same = values.every((v) => JSON.stringify(v) === JSON.stringify(first))
  return same ? first as T : 'mixed'
}

/** A card of the selection's settings, open, as every card is: its title, an action at the end, its controls. */
function Card({ id, title, note, action, children }: { id: string; title: string; note?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className={CARD} data-testid={id}>
      <CardHeader id={`${id}-title`} title={title} note={note}>{action}</CardHeader>
      <div className="flex flex-col gap-2.5 px-[18px] pb-4 empty:hidden">{children}</div>
    </section>
  )
}

const num = (props: Props, key: string) => props[key] as number

/**
 * The first card for every selection: the layer's name (or how many layers), the sizes a change goes
 * to, and its box on one line, the turn under it.
 */
function HeaderCard({ target, p, scope, children }: { target: Target; p: P; scope: ReactNode; children?: ReactNode }) {
  const fields = [
    { key: 'x', label: p.x, name: p.xName },
    { key: 'y', label: p.y, name: p.yName },
    { key: 'width', label: p.width, name: p.widthName, min: 0 },
    { key: 'height', label: p.height, name: p.heightName, min: 0 },
  ] as const
  // A group's box follows what it holds; its size and turn come from them.
  const sized = target.types.every((type) => type !== 'group' && type !== 'boolean')
  const title = target.ids.length > 1 ? format(p.layers, { n: target.ids.length }) : target.names[0] || p.layer
  return (
    <Card id="layout-card" title={title} action={scope}>
      <div className={sized ? KNOBS_FOUR : KNOBS}>
        {fields.map((f) => (
          (f.key === 'width' || f.key === 'height') && !sized
            ? null
            : (
              <NumberField
                key={f.key}
                label={f.label}
                name={f.name}
                value={shared(target.props.map((pr) => num(pr, f.key)))}
                min={'min' in f ? f.min : undefined}
                editor={target.editor}
                onSet={(v) => set(target, () => ({ [f.key]: v }))}
                onShift={(by) => set(target, (now) => ({ [f.key]: tidy(clamp(num(now, f.key) + by, 'min' in f ? f.min : undefined)) }))}
              />
            )
        ))}
      </div>
      {children}
    </Card>
  )
}

/** The layers' turn in degrees, wrapping round at 360; groups and booleans turn with what they hold. */
export function RotationField({ target, p }: { target: Target; p: P }) {
  return (
    <NumberField
      label="↻"
      unit="°"
      name={p.rotationName}
      value={shared(target.props.map((pr) => num(pr, 'rotation') ?? 0))}
      editor={target.editor}
      onSet={(v) => set(target, () => ({ rotation: tidy(((v % 360) + 360) % 360) }))}
      onShift={(by) => set(target, (now) => ({ rotation: tidy((((num(now, 'rotation') ?? 0) + by) % 360 + 360) % 360) }))}
    />
  )
}

/** How much the layers show through, and how they blend with what is under them; last for every selection. */
function SeeThroughCard({ target, p }: { target: Target; p: P }) {
  const containers = target.types.every((type) => type === 'group' || type === 'frame')
  const modes = containers ? ContainerBlendMode.options : BlendMode.options
  return (
    <Card id="appearance-card" title={p.seeThrough}>
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
    </Card>
  )
}

type ShapeKind = 'rect' | 'polygon' | 'star' | 'line'
/** The corners as the shape stores them, from the top left clockwise. */
const CORNERS = ['tl', 'tr', 'br', 'bl'] as const
/**
 * The order the fields sit in, two by two as the corners do: top left, top right, bottom left,
 * bottom right. They keep left to right in either direction, as the ad does.
 */
const CORNER_FIELDS = [0, 1, 3, 2] as const

/** Corners as a rectangle and a frame keep them: one radius, or each corner's own. */
type Corners = { cornerRadius?: number | undefined; corners?: readonly number[] | undefined }

/**
 * A box's corners: one radius for all, or with "Each corner its own" a radius for each, starting at
 * the one radius they had. `read` finds the corners in a layer's props and `write` puts them back.
 */
function CornerFields({ target, p, read, write }: { target: Target; p: P; read: (props: Props) => Corners; write: (now: Props, next: Corners) => Patch }) {
  const all = target.props.map(read)
  const each = all.every((c) => c.corners)
  const radius = (n: number) => clamp(Math.round(n), 0, 200)
  const eachCorner = (on: boolean) => set(target, (now) => {
    const { cornerRadius = 0, corners } = read(now)
    return write(now, on ? { corners: corners ?? [cornerRadius, cornerRadius, cornerRadius, cornerRadius] } : { cornerRadius: corners?.[0] ?? cornerRadius, corners: undefined })
  })
  const setCorner = (i: number, to: (r: number) => number) => set(target, (now) => {
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
            onShift={(by) => set(target, (now) => write(now, { cornerRadius: radius((read(now).cornerRadius ?? 0) + by) }))}
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

/** A rectangle's corners live in its shape; a key set to undefined leaves the shape. */
const shapeCorners = {
  read: (props: Props) => props.shape as Corners,
  write: (now: Props, next: Corners): Patch => ({
    shape: Object.fromEntries(Object.entries({ ...(now.shape as Record<string, unknown>), ...next }).filter(([, v]) => v !== undefined)),
  }),
}
/** A frame keeps its corners in one prop: a number for all four, or each corner's own. */
const frameCorners = {
  read: (props: Props): Corners => {
    const value = props.cornerRadius as number | readonly number[] | undefined
    return typeof value === 'object' ? { cornerRadius: value[0], corners: value } : { cornerRadius: value ?? 0 }
  },
  write: (now: Props, next: Corners): Patch => {
    const { cornerRadius = 0, corners } = { ...frameCorners.read(now), ...next }
    return { cornerRadius: corners ? [...corners] : cornerRadius }
  },
}

/**
 * A shape's own settings (#151), for layers that are all the same kind: a rectangle's corner radius
 * or each corner's own, a polygon's sides, a star's points and inner radius, a line's ends.
 */
function ShapeCard({ target, p, kind }: { target: Target; p: P; kind: ShapeKind }) {
  const shapes = target.props.map((pr) => pr.shape as Shape)
  const value = (key: string) => shared(shapes.map((s) => (s as Record<string, unknown>)[key])) as number | string | 'mixed' | undefined
  const setShape = (change: (now: Record<string, unknown>) => Record<string, unknown>) =>
    set(target, (now) => ({ shape: { ...(now.shape as Record<string, unknown>), ...change(now.shape as Record<string, unknown>) } }))
  /** A knob, as in the mock: its range is what designs mostly use, and the shape keeps the schema's limits. */
  const knob = (key: string, name: string, { min, max, scale = 1, unit, whole = true }: { min: number; max: number; scale?: number; unit?: string; whole?: boolean }) => {
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
    <Card id="shape-card" title={p.shapeKinds[kind]} note={target.names.join(', ')}>
      {kind === 'line'
        ? (
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
        )
        : (
          <>
            <div className={cn(KNOBS, 'empty:hidden')}>
              {kind === 'polygon' && knob('sides', p.sides, { min: 3, max: 24 })}
              {kind === 'star' && knob('points', p.points, { min: 3, max: 24 })}
              {kind === 'star' && knob('innerRadius', p.innerRadius, { min: 0.05, max: 0.95, scale: 100, unit: '%', whole: false })}
              {kind !== 'rect' && knob('cornerRadius', p.cornerRadius, { min: 0, max: 200 })}
            </div>
            {kind === 'rect' && <CornerFields target={target} p={p} {...shapeCorners} />}
          </>
        )}
    </Card>
  )
}

/** A list of paints, strokes or effects that every selected layer has the same of, or a way to make it so. */
/** A list of fills or strokes: the rows the selected layers share, and adding one on top. */
function useList<T>(target: Target, field: string, fresh: T, onTop: T, topFirst: boolean) {
  const list = shared(target.props.map((pr) => (pr[field] ?? []) as T[]))
  const write = (to: (now: T[]) => T[]) => set(target, (now) => ({ [field]: to((now[field] ?? []) as T[]) }))
  const add = () => write((now) => (list === 'mixed' && !topFirst ? [fresh] : [...now, now.length === 0 ? fresh : onTop]))
  return { list, write, add }
}

function ListBody<T>({ title, p, target, field, fresh, onTop = fresh, topFirst = false, header = true, testId, render }: {
  /** What + adds over a list that has items already; `fresh` starts an empty one. */
  onTop?: T
  /** The last item, drawn on top, shows first, and rows can be reordered. */
  topFirst?: boolean
  /** Its name with +; without it, + is in the card's header. */
  header?: boolean
  title: string
  p: P
  target: Target
  field: string
  fresh: T
  testId: string
  /** `n` is the row's place as shown, from 1; `change` takes the item as the document holds it when the change is made, not as last drawn. */
  render: (item: T, n: number, change: (to: (now: T) => T) => void) => ReactNode
}) {
  const { list, write, add } = useList(target, field, fresh, onTop, topFirst)
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {header && (
        <div className={cn('flex items-center justify-between', FIELD_LABEL)}>
          {title}
          <AddButton label={format(p.add, { name: title.toLowerCase() })} onClick={add} />
        </div>
      )}
      {list === 'mixed'
        ? (
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            {p.mixedList}
            <button type="button" onClick={() => write(() => [fresh])} className="cursor-pointer font-medium text-accent-text hover:underline">{p.useOne}</button>
          </div>
        )
        : <Stack items={list} field={field} topFirst={topFirst} removeLabel={(n) => format(p.remove, { name: title.toLowerCase(), n })} onWrite={write} render={render} />}
    </div>
  )
}

/**
 * The fills: the brand's colours (not for lines or photos), then the fill list with each fill's
 * editor. In the bar's Colour popover, and in a photo's Colour card.
 */
export function FillBody({ target, brandId, p, swatches = true, header = true }: { target: Target; brandId: string; p: P; swatches?: boolean; header?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {swatches && <FillLook target={target} brandId={brandId} p={p} />}
      <ListBody<Paint>
        title={p.fill}
        p={p}
        target={target}
        field="fills"
        fresh={NEW_FILL}
        onTop={FILL_ON_TOP}
        topFirst
        header={header}
        testId="fill-list"
        render={(paint, n, change) => <PaintRow paint={paint} name={format(p.colour, { n })} brandId={brandId} editor={target.editor} p={p} onSet={change} />}
      />
    </div>
  )
}

/**
 * The strokes, each with its paint, width, place, dashes, ends and corners. In the bar's Outline
 * popover, and in a photo's Outline card.
 */
export function OutlineBody({ target, brandId, p, title = p.stroke }: { target: Target; brandId: string; p: P; title?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <ListBody<Stroke>
        title={title}
        p={p}
        target={target}
        field="strokes"
        fresh={NEW_STROKE}
        topFirst
        testId="stroke-list"
        render={(stroke, n, change) => <StrokeRow stroke={stroke} place={n} brandId={brandId} p={p} editor={target.editor} onSet={change} />}
      />
    </div>
  )
}

type Stroke = {
  paint: Paint
  width: number
  align: 'inside' | 'center' | 'outside'
  dashes?: number[]
  dashOffset?: number
  cap?: 'butt' | 'round' | 'square'
  join?: 'miter' | 'round' | 'bevel'
}

/** Dash and gap lengths as typed, "8 4", or null when they aren't a pattern; nothing typed is solid. */
function parseDashes(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  const lengths = parts.map((part) => Number.parseFloat(part))
  if (lengths.some((n) => !Number.isFinite(n) || n < 0)) return null
  if (lengths.length > 0 && !lengths.some((n) => n > 0)) return null
  return lengths.map(tidy)
}

/** A stroke's dash pattern, typed as lengths: dash, gap, dash and so on. */
function DashField({ name, value, onSet }: { name: string; value: number[]; onSet: (dashes: number[]) => void }) {
  const t = useMessages()
  const shown = value.join(' ')
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (text: string) => {
    setDraft(null)
    const dashes = parseDashes(text)
    if (dashes && dashes.join(' ') !== shown) onSet(dashes)
  }
  return (
    <input
      name="dashes"
      aria-label={name}
      title={t.editor.props.dashesHint}
      value={draft ?? shown}
      placeholder={t.editor.props.solid}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => draft !== null && commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit(event.currentTarget.value)
        else if (event.key === 'Escape') {
          setDraft(null)
          event.currentTarget.blur()
        }
        event.stopPropagation()
      }}
      className={FIELD}
    />
  )
}

/** One stroke: its colour, width and position, then its dashes and the look of its ends and corners (#152). */
function StrokeRow({ stroke, place, brandId, p, editor, onSet }: { stroke: Stroke; place: number; brandId: string; p: P; editor: Editor; onSet: (to: (now: Stroke) => Stroke) => void }) {
  const n = { n: place }
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <PaintRow paint={stroke.paint} name={format(p.strokeColour, n)} brandId={brandId} editor={editor} p={p} onSet={(to) => onSet((now) => ({ ...now, paint: to(now.paint) }))} />
      <div className={KNOBS}>
        <NumberField label="W" name={format(p.strokeWidth, n)} value={stroke.width} min={0.5} step={0.5} editor={editor} onSet={(width) => onSet((now) => ({ ...now, width }))} onShift={(by) => onSet((now) => ({ ...now, width: tidy(clamp(now.width + by, 0.5)) }))} />
        <Choice name={format(p.strokeAlign, n)} value={stroke.align} options={['inside', 'center', 'outside'] as const} labels={p.aligns} onSet={(align) => onSet((now) => ({ ...now, align }))} />
        <DashField name={format(p.strokeDashes, n)} value={stroke.dashes ?? []} onSet={(dashes) => onSet((now) => ({ ...now, dashes }))} />
        <NumberField
          label="⇥"
          name={format(p.strokeDashOffset, n)}
          value={stroke.dashOffset ?? 0}
          editor={editor}
          onSet={(dashOffset) => onSet((now) => ({ ...now, dashOffset }))}
          onShift={(by) => onSet((now) => ({ ...now, dashOffset: tidy((now.dashOffset ?? 0) + by) }))}
        />
        <Choice name={format(p.strokeCap, n)} value={stroke.cap ?? 'butt'} options={['butt', 'round', 'square'] as const} labels={p.caps} onSet={(cap) => onSet((now) => ({ ...now, cap }))} />
        <Choice name={format(p.strokeJoin, n)} value={stroke.join ?? 'miter'} options={['miter', 'round', 'bevel'] as const} labels={p.joins} onSet={(join) => onSet((now) => ({ ...now, join }))} />
      </div>
    </div>
  )
}

const EFFECT_FIELDS = { dropShadow: ['x', 'y', 'blur', 'spread'], innerShadow: ['x', 'y', 'blur', 'spread'], glow: ['blur', 'spread'], layerBlur: ['radius'], backgroundBlur: ['radius'] } as const
const NEW_EFFECT: Record<Effect['type'], Effect> = {
  dropShadow: { type: 'dropShadow', x: 0, y: 8, blur: 24, spread: 0, color: '#00000040' },
  innerShadow: { type: 'innerShadow', x: 0, y: 4, blur: 12, spread: 0, color: '#00000040' },
  glow: { type: 'glow', blur: 24, spread: 0, color: '#FF48B080' },
  layerBlur: { type: 'layerBlur', radius: 8 },
  backgroundBlur: { type: 'backgroundBlur', radius: 16 },
}

/** One effect's numbers and colour, with its remove button. */
function EffectRow({ effect, i, target, p, write }: { effect: Effect; i: number; target: Target; p: P; write: (to: (now: Effect[]) => Effect[]) => void }) {
  const change = (to: (now: Effect) => Effect) => write((now) => now.map((x, j) => (j === i ? to(x) : x)))
  const effectName = p.effect[effect.type]
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-2.5" data-item={`effects-${i}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text">{effectName}</span>
        <RemoveButton label={format(p.remove, { name: effectName.toLowerCase(), n: i + 1 })} onClick={() => write((now) => now.filter((_, j) => j !== i))} />
      </div>
      <div className={KNOBS}>
        {EFFECT_FIELDS[effect.type].map((field) => {
          const value = (effect as unknown as Record<string, number>)[field] ?? 0
          const min = field === 'x' || field === 'y' || (field === 'spread' && effect.type === 'dropShadow') ? undefined : 0
          return (
            <NumberField
              key={field}
              label={p.effectField[field].charAt(0)}
              name={format(p.effectFieldName, { effect: effectName, n: i + 1, field: p.effectField[field] })}
              value={value}
              min={min}
              editor={target.editor}
              onSet={(v) => change((now) => ({ ...now, [field]: v }) as Effect)}
              onShift={(by) => change((now) => ({ ...now, [field]: tidy(clamp(((now as unknown as Record<string, number>)[field] ?? 0) + by, min)) }) as Effect)}
            />
          )
        })}
      </div>
      {'color' in effect && <ColorField name={effectName} value={effect.color} onSet={(to) => change((now) => ({ ...now, color: to('color' in now ? now.color : undefined) }) as Effect)} />}
    </div>
  )
}

export type Style = Record<string, unknown> & { fontFamily: string; fontWeight: number; fontSize: number; color: string; letterSpacing?: number; lineHeight?: number; textCase?: string }

/** The text's style as one setter per key, and a nudge for its numbers. */
function textStyle(target: Target) {
  const styles = target.props.map((pr) => pr.style as Style)
  return {
    style: (key: string) => shared(styles.map((s) => s[key])),
    setStyle: (key: string, value: unknown) => set(target, (now) => ({ style: { ...(now.style as Style), [key]: value } })),
    shiftStyle: (key: string, by: number, min?: number, from = 0) =>
      set(target, (now) => {
        const s = now.style as Style
        return { style: { ...s, [key]: tidy(clamp(((s[key] as number | undefined) ?? from) + by, min)) } }
      }),
  }
}

/** A row that turns something on or off: its name, then a switch. */
function SwitchRow({ name, on, onSet }: { name: string; on: boolean | 'mixed'; onSet: (on: boolean) => void }) {
  return (
    <Switch on={on} onSet={onSet} className={SWITCH_ROW}>
      {name}
    </Switch>
  )
}

/** A switch on its own, named by `label`, or with its name beside it as `children`. */
function Switch({ on, onSet, label, className, children }: { on: boolean | 'mixed'; onSet: (on: boolean) => void; label?: string; className: string; children?: ReactNode }) {
  return (
    // A switch has no mixed state: while the layers differ it is a checkbox that says so.
    <button type="button" role={on === 'mixed' ? 'checkbox' : 'switch'} aria-checked={on} aria-label={label} onClick={() => onSet(on !== true)} className={className}>
      {children}
      <span aria-hidden className={SWITCH} />
    </button>
  )
}

/** The text's spacing: between its lines (Auto when cleared), its letters and its paragraphs. */
function SpacingCard({ target, p }: { target: Target; p: P }) {
  const { style, setStyle, shiftStyle } = textStyle(target)
  return (
    <Card id="spacing-card" title={p.spacing}>
      <div className={KNOBS}>
        <NumberField
          label={p.spacingShort.lines}
          name={p.lineHeight}
          value={style('lineHeight') as number | 'mixed' | undefined}
          step={0.05}
          min={0.5}
          placeholder={p.lineHeightAuto}
          editor={target.editor}
          onSet={(v) => setStyle('lineHeight', v)}
          onShift={(by) => shiftStyle('lineHeight', by, 0.5, 1.2)}
          onClear={() => setStyle('lineHeight', undefined)}
        />
        <NumberField label={p.spacingShort.letters} name={p.letterSpacing} value={(style('letterSpacing') ?? 0) as number | 'mixed'} step={0.1} editor={target.editor} onSet={(v) => setStyle('letterSpacing', v)} onShift={(by) => shiftStyle('letterSpacing', by)} />
        <NumberField
          label={p.spacingShort.paragraphs}
          name={p.paragraphSpacing}
          value={(shared(target.props.map((pr) => pr.paragraphSpacing)) ?? 0) as number | 'mixed'}
          min={0}
          editor={target.editor}
          onSet={(v) => set(target, () => ({ paragraphSpacing: v }))}
          onShift={(by) => set(target, (now) => ({ paragraphSpacing: tidy(clamp(((now.paragraphSpacing as number | undefined) ?? 0) + by, 0)) }))}
        />
      </div>
    </Card>
  )
}

/** The bar's size popover for text: the size, any size from 1 up. */
export function TextSizeField({ target, p }: { target: Target; p: P }) {
  const { style, setStyle, shiftStyle } = textStyle(target)
  return <NumberField label={p.fontSize} name={p.fontSize} value={style('fontSize') as number | 'mixed'} min={1} editor={target.editor} onSet={(v) => setStyle('fontSize', v)} onShift={(by) => shiftStyle('fontSize', by, 1)} />
}

/** The bar's colour popover for text: the brand's colours, then any colour by its hex. */
export function TextColourBody({ target, brandId, p }: { target: Target; brandId: string; p: P }) {
  const { style } = textStyle(target)
  const color = style('color') as string | 'mixed'
  return (
    <div className="flex w-60 flex-col gap-3 p-1">
      <Swatches target={target} brandId={brandId} p={p} current={color} paint={(hex) => set(target, (now) => ({ style: { ...(now.style as Style), color: `${hex}${((now.style as Style).color ?? '').slice(7, 9) || 'FF'}` } }))} />
      <ColorField name={p.textColour} value={color} onSet={(to) => set(target, (now) => ({ style: { ...(now.style as Style), color: to((now.style as Style).color) } }))} />
    </div>
  )
}

/** A row of choices of which one is on; `marks` shows a short mark in place of a choice's name. */
function Segments<T extends string>({ name, value, options, labels, marks, onSet }: { name: string; value: T | 'mixed'; options: readonly T[]; labels: Record<T, string>; marks?: Record<T, string>; onSet: (to: T) => void }) {
  return (
    <div role="radiogroup" aria-label={name} className={SEGMENTS}>
      {options.map((option) => (
        <button key={option} type="button" role="radio" aria-checked={value === option} aria-label={marks ? labels[option] : undefined} title={marks ? labels[option] : undefined} data-value={option} onClick={() => onSet(option)} className={SEGMENT}>
          {marks?.[option] ?? labels[option]}
        </button>
      ))}
    </div>
  )
}

/** How each case shows on its button: the same letters in every language, as a font sample is. */
const CASE_MARKS = { none: 'Ab', upper: 'AB', lower: 'ab', title: 'Aa' }

/** The bar's align popover for text: alignment, up and down in the box, case, lists, underline and strikethrough. */
export function TextAlignBody({ target, p }: { target: Target; p: P }) {
  const t = useMessages()
  const { style, setStyle } = textStyle(target)
  const flag = (key: string) => {
    const on = style(key)
    return on === 'mixed' ? 'mixed' : on === true
  }
  return (
    <div className="flex w-80 flex-col gap-2.5 p-1">
      <Segments name={p.textAlign} value={shared(target.props.map((pr) => (pr.align ?? 'start') as 'start' | 'center' | 'end' | 'justify'))} options={['start', 'center', 'end', 'justify'] as const} labels={p.textAligns} onSet={(align) => set(target, () => ({ align }))} />
      <Segments name={t.editor.bar.upDown} value={shared(target.props.map((pr) => (pr.verticalAlign ?? 'top') as 'top' | 'middle' | 'bottom'))} options={['top', 'middle', 'bottom'] as const} labels={p.verticalAligns} onSet={(verticalAlign) => set(target, () => ({ verticalAlign }))} />
      <Segments name={p.textCase} value={(style('textCase') ?? 'none') as 'none' | 'upper' | 'lower' | 'title' | 'mixed'} options={['none', 'upper', 'lower', 'title'] as const} labels={p.textCases} marks={CASE_MARKS} onSet={(v) => setStyle('textCase', v)} />
      <Segments name={p.list} value={shared(target.props.map((pr) => (pr.list ?? 'none') as 'none' | 'bullet' | 'number'))} options={['none', 'bullet', 'number'] as const} labels={p.lists} onSet={(list) => set(target, () => ({ list: list === 'none' ? undefined : list }))} />
      <Toggles
        items={[
          { name: p.underline, label: 'U', on: flag('underline'), onSet: (on) => setStyle('underline', on) },
          { name: p.strikethrough, label: 'S', on: flag('strikethrough'), onSet: (on) => setStyle('strikethrough', on) },
        ]}
      />
    </div>
  )
}

type Toggle = { name: string; label: string; on: boolean | 'mixed'; onSet: (on: boolean) => void }

/** Buttons that each turn something on or off, such as underline; pressed while it is on. */
function Toggles({ items }: { items: Toggle[] }) {
  return (
    <div className="flex gap-1">
      {items.map((item) => (
        <button
          key={item.name}
          type="button"
          aria-label={item.name}
          title={item.name}
          aria-pressed={item.on === 'mixed' ? 'mixed' : item.on}
          onClick={() => item.onSet(item.on !== true)}
          className="h-7 min-w-8 cursor-pointer rounded-row border border-line px-2 text-[12px] text-muted hover:bg-hover aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

/** How each box mode's tile draws it: growing along a line, growing down, or held. */
const BOX_ICONS = {
  autoWidth: <ArrowsHorizontalIcon size={18} aria-hidden />,
  autoHeight: <ArrowsVerticalIcon size={18} aria-hidden />,
  fixed: <RectangleIcon size={18} aria-hidden />,
}

/** The text's box: how it sizes, shrinking to fit between a smallest and a largest size, and the lines shown at most. */
function TextBoxCard({ target, p }: { target: Target; p: P }) {
  const value = (key: string) => shared(target.props.map((pr) => pr[key])) as unknown
  const shrink = value('shrinkToFit') as { min: number; max: number } | undefined | 'mixed'
  const mode = (value('boxMode') ?? 'autoHeight') as BoxMode | 'mixed'
  return (
    <Card id="text-box-card" title={p.textBox}>
      <div role="radiogroup" aria-label={p.boxMode} className="grid grid-cols-3 gap-[7px]">
        {(['autoWidth', 'autoHeight', 'fixed'] as const).map((to) => (
          <button key={to} type="button" role="radio" aria-checked={mode === to} data-value={to} onClick={() => set(target, () => ({ boxMode: to }))} className={TILE}>
            <span className={TILE_FACE_WIDE}>{BOX_ICONS[to]}</span>
            {p.boxModes[to]}
          </button>
        ))}
      </div>
      <SwitchRow
        name={p.shrinkToFit}
        on={shrink === 'mixed' ? 'mixed' : shrink !== undefined}
        onSet={(on) => set(target, (now) => {
          const size = (now.style as Style).fontSize
          return { shrinkToFit: on ? { min: tidy(Math.max(1, size / 2)), max: size } : undefined }
        })}
      />
      <div className={KNOBS}>
        {shrink !== undefined && shrink !== 'mixed' && (['min', 'max'] as const).map((end) => (
          <NumberField
            key={end}
            label={p.shrinkShort[end]}
            name={p.shrinkSize[end]}
            value={shrink[end]}
            min={1}
            editor={target.editor}
            onSet={(v) => set(target, (now) => {
              const was = now.shrinkToFit as { min: number; max: number } | undefined
              if (!was) return null
              const next = { ...was, [end]: v }
              return { shrinkToFit: end === 'min' ? { min: Math.min(next.min, next.max), max: next.max } : { min: next.min, max: Math.max(next.min, next.max) } }
            })}
            onShift={(by) => set(target, (now) => {
              const was = now.shrinkToFit as { min: number; max: number } | undefined
              if (!was) return null
              const v = tidy(Math.max(1, was[end] + by))
              return { shrinkToFit: end === 'min' ? { min: Math.min(v, was.max), max: was.max } : { min: was.min, max: Math.max(v, was.min) } }
            })}
          />
        ))}
        <NumberField
          label={p.maxLines}
          name={p.maxLines}
          value={value('maxLines') as number | 'mixed' | undefined}
          min={0}
          placeholder={p.none}
          editor={target.editor}
          // 0 lifts the limit.
          onSet={(v) => set(target, () => ({ maxLines: Math.round(v) >= 1 ? Math.round(v) : undefined }))}
          onShift={(by) => set(target, (now) => {
            const next = Math.round(((now.maxLines as number | undefined) ?? 0) + by)
            return { maxLines: next >= 1 ? next : undefined }
          })}
        />
      </div>
    </Card>
  )
}

type BoxMode = 'autoWidth' | 'autoHeight' | 'fixed'

type ImageFill = Extract<Paint, { type: 'image' }>
const ADJUSTMENTS = ['exposure', 'contrast', 'saturation', 'temperature', 'tint'] as const
/** Each filter's tile: the image's picture with a CSS look near the one the renderer draws. */
const FILTER_LOOK: Record<ImageFilter, string> = {
  none: 'none',
  mono: 'grayscale(1)',
  sepia: 'sepia(0.85)',
  vivid: 'saturate(1.7) contrast(1.1)',
  fade: 'contrast(0.75) brightness(1.12) saturate(0.75)',
  warm: 'sepia(0.3) saturate(1.35) hue-rotate(-12deg)',
  cool: 'saturate(0.9) hue-rotate(18deg) brightness(1.04)',
}

/** The topmost image fill, the one showing, when every selected layer has the same fills; null otherwise. */
export function imageFillOf(target: Target): { index: number; paint: ImageFill } | null {
  const fills = shared(target.props.map((pr) => (pr.fills ?? []) as Paint[]))
  const index = fills === 'mixed' ? -1 : fills.findLastIndex((f) => f.type === 'image')
  return fills !== 'mixed' && index >= 0 ? { index, paint: fills[index] as ImageFill } : null
}

/** Changes the image fill at `index` of every selected layer. */
const setImage = (target: Target, index: number, change: (now: ImageFill) => Partial<ImageFill>) => set(target, (now) => {
  const fills = (now.fills ?? []) as Paint[]
  const at = fills[index]
  if (at?.type !== 'image') return null
  return { fills: fills.map((f, i) => (i === index ? { ...at, ...change(at) } : f)) }
})

/** The bar's Look popover for a photo: each filter as the photo with it. */
export function PhotoLookBody({ target, p, brandId, index, paint }: { target: Target; p: P; brandId: string; index: number; paint: ImageFill }) {
  const picture = `/brands/${encodeURIComponent(brandId)}/assets/${encodeURIComponent(paint.assetId)}/thumbnail`
  const filter = paint.filter ?? 'none'
  return (
    <div role="radiogroup" aria-label={p.filter} className="grid w-72 grid-cols-4 gap-1.5 p-1.5">
      {ImageFilter.options.map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={filter === name}
          onClick={() => setImage(target, index, () => ({ filter: name === 'none' ? undefined : name }))}
          className="group flex min-w-0 cursor-pointer flex-col items-center gap-1 text-[10px] font-semibold text-muted aria-checked:text-text"
        >
          <span className="block aspect-square w-full overflow-hidden rounded-[8px] border border-line group-aria-checked:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]">
            <img src={picture} alt="" draggable={false} loading="lazy" style={{ filter: FILTER_LOOK[name] }} className="size-full object-cover" />
          </span>
          <span className="w-full truncate text-center">{p.filters[name]}</span>
        </button>
      ))}
    </div>
  )
}

/** How the photo fits its layer, as a row under the header card's box: fill it, crop it, fit inside it, or tile it. */
function FitRow({ target, p, index, paint }: { target: Target; p: P; index: number; paint: ImageFill }) {
  return <Segments name={p.fit} value={paint.fit} options={['fill', 'crop', 'fit', 'tile'] as const} labels={p.fits} onSet={(fit) => setImage(target, index, () => ({ fit }))} />
}

/** The photo's adjustments: its light, contrast, saturation, warmth and tint, and how much of the image shows. */
function AdjustCard({ target, p, index, paint }: { target: Target; p: P; index: number; paint: ImageFill }) {
  const setPaint = (change: (now: ImageFill) => Partial<ImageFill>) => setImage(target, index, change)
  const setAdjust = (key: keyof ImageAdjust, to: (n: number) => number) => setPaint((now) => {
    const adjust = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, ...now.adjust }
    return { adjust: { ...adjust, [key]: Math.round(clamp(to(adjust[key]), -100, 100)) } }
  })
  return (
    <Card id="adjust-card" title={p.adjustTitle}>
      <div className={KNOBS}>
        {ADJUSTMENTS.map((key) => (
          <NumberField
            key={key}
            label={p.adjust[key]}
            name={p.adjust[key]}
            value={paint.adjust?.[key] ?? 0}
            min={-100}
            max={100}
            editor={target.editor}
            onSet={(v) => setAdjust(key, () => v)}
            onShift={(by) => setAdjust(key, (n) => n + by)}
          />
        ))}
        <NumberField
          label={p.image}
          unit="%"
          name={p.imageOpacity}
          value={paint.opacity}
          scale={100}
          min={0}
          max={1}
          editor={target.editor}
          onSet={(v) => setPaint(() => ({ opacity: tidy(v) }))}
          onShift={(by) => setPaint((now) => ({ opacity: tidy(clamp(now.opacity + by, 0, 1)) }))}
        />
      </div>
    </Card>
  )
}

/** Several photos with the same picture: Replace and the filters, which one photo has on its bar. */
function PhotosCard({ target, p, brandId, index, paint }: { target: Target; p: P; brandId: string; index: number; paint: ImageFill }) {
  return (
    <Card
      id="photos-card"
      title={p.image}
      action={(
        <ImagePickerButton brandId={brandId} title={p.replaceImageTitle} testId="replace-image" className={cn(CHIP, FOCUS_RING, 'shrink-0')} onPick={(asset) => set(target, (now) => ({ fills: withImage((now.fills ?? []) as Paint[], asset.id) }))}>
          <span aria-hidden>{p.replaceImage}</span>
        </ImagePickerButton>
      )}
    >
      <PhotoLookBody target={target} p={p} brandId={brandId} index={index} paint={paint} />
    </Card>
  )
}

/**
 * The fills, + in the header, then the strokes under an Outline heading with their own +: for a
 * photo, whose bar holds the photo's own actions, and for several layers.
 */
function ColourCard({ target, brandId, p, b, swatches }: { target: Target; brandId: string; p: P; b: Messages['editor']['bar']; swatches: boolean }) {
  const { add } = useList<Paint>(target, 'fills', NEW_FILL, FILL_ON_TOP, true)
  const stroked = target.types.every((type) => type === 'graphic' || type === 'boolean')
  return (
    <Card id="fill-card" title={b.fill} action={<AddButton label={format(p.add, { name: p.fill.toLowerCase() })} onClick={add} />}>
      <FillBody target={target} brandId={brandId} p={p} swatches={swatches} header={false} />
      {stroked && <OutlineBody target={target} brandId={brandId} p={p} title={b.outline} />}
    </Card>
  )
}

type Layout = { direction: 'row' | 'column'; gap: number; padding: Record<'top' | 'right' | 'bottom' | 'left', number>; justify: string; align: string; wrap: boolean; lineGap: number }
type Place = 'start' | 'center' | 'end'
const PLACES: Place[] = ['start', 'center', 'end']

/** A frame: whether what is inside shows past its edges. */
function FrameCard({ target, p }: { target: Target; p: P }) {
  return (
    <Card id="frame-card" title={p.frame}>
      <CornerFields target={target} p={p} {...frameCorners} />
      <SwitchRow name={p.clip} on={shared(target.props.map((pr) => pr.clip !== false))} onSet={(clip) => set(target, () => ({ clip }))} />
    </Card>
  )
}

/**
 * A frame's auto layout, turned on and off from its title: row or column, wrapping, a 3×3 pad that
 * lines up what is inside along both axes at once, the room between and around, spreading out,
 * each side's padding, and, when `ownSizing`, how the frame sizes.
 */
function AutoLayoutCard({ target, p, ownSizing }: { target: Target; p: P; ownSizing: boolean }) {
  const layouts = target.props.map((pr) => pr.layout as Layout | undefined)
  const on = shared(layouts.map(Boolean))
  const toggle = <Switch on={on} label={p.autoLayout} onSet={() => target.editor.perform('autoLayout')} className={cn('group flex cursor-pointer rounded-full', FOCUS_RING)} />
  if (on !== true) return <Card id="auto-layout-card" title={p.autoLayout} action={toggle} />
  const value = (key: keyof Layout) => shared(layouts.map((l) => l?.[key]))
  const setLayout = (change: (l: Layout) => Partial<Layout>) => set(target, (now) => {
    const l = now.layout as Layout
    return { layout: { ...l, ...change(l) } }
  })
  const direction = value('direction') as Layout['direction'] | 'mixed'
  const justify = value('justify') as string
  const align = value('align') as string
  const around = shared(layouts.flatMap((l) => (l ? [l.padding.top, l.padding.right, l.padding.bottom, l.padding.left] : [])))
  return (
    <Card id="auto-layout-card" title={p.autoLayout} action={toggle}>
      <Segments name={p.direction} value={direction} options={['row', 'column'] as const} labels={p.directions} onSet={(to) => setLayout(() => ({ direction: to }))} />
      <SwitchRow name={p.wrap} on={value('wrap') === 'mixed' ? 'mixed' : value('wrap') === true} onSet={(wrap) => setLayout(() => ({ wrap }))} />
      <div className="flex gap-3">
        {/* Across the pad is along a row's line (or down a column's), so each cell sets both axes. */}
        <div role="group" aria-label={p.lineUp} dir="ltr" className="grid size-[84px] shrink-0 grid-cols-3 gap-[3px] rounded-[10px] bg-hover p-[5px]">
          {PLACES.map((y) => PLACES.map((x) => {
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
                onClick={() => setLayout((l) => {
                  const own = l.direction === 'column' ? { justify: y, align: x } : { justify: x, align: y }
                  return { justify: l.justify === 'space-between' ? 'space-between' : own.justify, align: own.align }
                })}
                className={cn('grid cursor-pointer place-items-center rounded-[5px] hover:bg-surface after:size-1 after:rounded-full after:bg-subtle aria-pressed:after:h-1.5 aria-pressed:after:w-4 aria-pressed:after:rounded-[2px] aria-pressed:after:bg-accent', FOCUS_RING)}
              />
            )
          }))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <NumberField label={p.between} name={p.gap} value={value('gap') as number | 'mixed'} editor={target.editor} onSet={(gap) => setLayout(() => ({ gap }))} onShift={(by) => setLayout((l) => ({ gap: tidy(l.gap + by) }))} />
          <NumberField
            label={p.around}
            name={p.paddingAll}
            value={around}
            editor={target.editor}
            onSet={(v) => setLayout(() => ({ padding: { top: v, right: v, bottom: v, left: v } }))}
            onShift={(by) => setLayout((l) => ({ padding: { top: tidy(l.padding.top + by), right: tidy(l.padding.right + by), bottom: tidy(l.padding.bottom + by), left: tidy(l.padding.left + by) } }))}
          />
          <Choice name={p.spreadOut} value={justify === 'mixed' ? 'mixed' : justify === 'space-between' ? 'between' : 'packed'} options={['packed', 'between'] as const} labels={p.spreads} onSet={(to) => setLayout((l) => ({ justify: to === 'between' ? 'space-between' : l.justify === 'space-between' ? 'start' : l.justify }))} />
        </div>
      </div>
      <div className={KNOBS_FOUR}>
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <NumberField
            key={side}
            label={p.paddingShort[side]}
            name={p.padding[side]}
            value={shared(layouts.map((l) => l?.padding[side] ?? 0))}
            editor={target.editor}
            onSet={(v) => setLayout((l) => ({ padding: { ...l.padding, [side]: v } }))}
            onShift={(by) => setLayout((l) => ({ padding: { ...l.padding, [side]: tidy(l.padding[side] + by) } }))}
          />
        ))}
      </div>
      {ownSizing && <SizingFields target={target} p={p} options={['hug', 'fill', 'fixed']} labels={p.sizings} />}
    </Card>
  )
}

type Sizing = 'fixed' | 'hug' | 'fill'

/** How a layer sizes on each axis, as the renderer reads it: left unsaid, text hugs as its box mode says and the rest is fixed. */
function sizingOf(type: string, props: Props): { width: Sizing; height: Sizing } {
  const own = props.sizing as { width: Sizing; height: Sizing } | undefined
  if (own) return own
  if (type === 'text') return { width: props.boxMode === 'autoWidth' ? 'hug' : 'fixed', height: props.boxMode === 'fixed' ? 'fixed' : 'hug' }
  return { width: 'fixed', height: 'fixed' }
}

/** How the layers size on each axis: a menu each, under the axis's name. */
function SizingFields({ target, p, options, labels }: { target: Target; p: P; options: readonly Sizing[]; labels: Record<Sizing, string> }) {
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
            onSet={(to) => set(target, (now, i) => ({ sizing: { ...sizingOf(target.types[i] ?? '', now), [axis]: to } }))}
          />
        </div>
      ))}
    </div>
  )
}

/** A layer in an auto layout: on each axis its own size, fitting its content or filling the room, and kept where it is put, out of the flow. */
function FlowCard({ target, p }: { target: Target; p: P }) {
  return (
    <Card id="flow-card" title={p.inAutoLayout}>
      <SizingFields target={target} p={p} options={['fixed', 'hug', 'fill']} labels={p.childSizings} />
      <SwitchRow name={p.absolute} on={shared(target.props.map((pr) => pr.absolute === true))} onSet={(absolute) => set(target, () => ({ absolute: absolute ? true : undefined }))} />
    </Card>
  )
}

type OwnGroup = keyof P['ownGroups']
/** Which card's words name a property a format can have of its own. */
const OWN_GROUP: Record<string, OwnGroup> = {
  x: 'layout', y: 'layout', width: 'layout', height: 'layout', rotation: 'layout', sizing: 'layout', absolute: 'layout',
  opacity: 'appearance', blendMode: 'appearance', visible: 'appearance',
  fills: 'fill', strokes: 'stroke', effects: 'effects', shape: 'shape', cornerRadius: 'shape',
  text: 'text', runs: 'text', style: 'text', align: 'text', verticalAlign: 'text', direction: 'text', boxMode: 'text', list: 'text', paragraphSpacing: 'text', maxLines: 'text', shrinkToFit: 'text',
  layout: 'autoLayout',
}

/**
 * What the format shown has of its own for the selected layers (#157), grouped as the cards are;
 * each group, or all of them, goes back to following the other formats in one undo step.
 */
function OwnChanges({ design, ids, formatId, editor, p }: { design: Design; ids: string[]; formatId: string; editor: Editor; p: P }) {
  const scope = `format:${formatId}` as const
  const byNode = design.overrides[scope] ?? {}
  const paths = [...new Set(ids.flatMap((id) => Object.keys(byNode[id] ?? {})))]
  if (paths.length === 0) return null
  const groups = new Map<OwnGroup, string[]>()
  for (const path of paths) {
    const group = OWN_GROUP[path] ?? 'other'
    groups.set(group, [...groups.get(group) ?? [], path])
  }
  const reset = (only?: string[]) => editor.resetOwn(ids, scope, only)
  const name = design.formats[formatId]?.name ?? ''
  return (
    <div data-testid="own-changes" className="flex flex-col gap-1">
      <p className="px-1 text-[11px] font-semibold text-subtle">{format(p.ownChanges, { format: name })}</p>
      <ul className="flex flex-col">
        {[...groups].map(([group, groupPaths]) => (
          <li key={group} className="flex h-8 items-center justify-between gap-2 px-1 text-[13px]">
            <span className="min-w-0 truncate">{p.ownGroups[group]}</span>
            <button
              type="button"
              onClick={() => reset(groupPaths)}
              aria-label={format(p.resetOwn, { name: p.ownGroups[group] })}
              className={LINK_BUTTON}
            >
              {p.reset}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => reset()} className={cn(CHIP, 'mt-1 h-8 w-full justify-center')}>{p.resetAll}</button>
    </div>
  )
}

/** A swatch of the look cards: round, ringed while it is the colour. */
function Swatch({ color, label, on, onPick }: { color: string; label: string; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={onPick}
      style={{ backgroundColor: color }}
      className={cn(SWATCH, 'size-[22px]', on && PICKED_RING)}
    />
  )
}

/**
 * The colours a look card offers: the brand's own, which the layers then follow (change the colour
 * in the kit and they change too), or, with no kit colours, a fixed set painted as it is.
 */
function Swatches({ target, brandId, p, current, paint }: { target: Target; brandId: string; p: P; current: string | 'mixed' | undefined; paint: (hex: string) => void }) {
  const kit = useBrandKit(brandId)
  const now = current && current !== 'mixed' ? current.slice(0, 7).toUpperCase() : null
  const colors = kit?.colors ?? []
  // The colour it has now leads the row when the row does not hold it, as in the mock.
  const offered = colors.length > 0 ? colors.map((c) => c.value.slice(0, 7).toUpperCase()) : [...SWATCHES]
  return (
    <div role="group" aria-label={colors.length > 0 ? p.brandColours : p.colours} className="flex flex-wrap items-center gap-1.5">
      {now && !offered.includes(now) && <Swatch color={now} label={format(p.currentColour, { hex: now })} on onPick={() => undefined} />}
      {colors.length > 0
        ? colors.map((c) => (
          <Swatch key={c.token} color={c.value.slice(0, 7)} label={c.name} on={now === c.value.slice(0, 7).toUpperCase()} onPick={() => target.editor.bindSelection('color', brandRef(c.token))} />
        ))
        : SWATCHES.map((hex) => <Swatch key={hex} color={hex} label={hex} on={now === hex} onPick={() => paint(hex)} />)}
    </div>
  )
}

/** A shape's or frame's look: its fill from the brand, painted over its first solid fill. */
function FillLook({ target, brandId, p }: { target: Target; brandId: string; p: P }) {
  // The fill a brand colour binds: the topmost one that shows.
  const bound = (fills: Paint[]) => fills[boundFillIndex(fills)] as Extract<Paint, { type: 'solid' }> | undefined
  const current = shared(target.props.map((pr) => bound((pr.fills ?? []) as Paint[])?.color))
  const paint = (hex: string) => set(target, (now) => {
    const fills = (now.fills ?? []) as Paint[]
    const i = boundFillIndex(fills)
    const color = `${hex}FF`
    return { fills: i < 0 ? [...fills, { type: 'solid', color }] : fills.map((f, j) => (j === i && f.type === 'solid' ? { ...f, color } : f)) }
  })
  // A picture goes into layers that have none; one that has a picture changes it with Replace on the bar.
  const pictureless = target.props.every((pr) => !((pr.fills ?? []) as Paint[]).some((f) => f.type === 'image'))
  return (
    <div className="flex flex-col gap-3">
      <Swatches target={target} brandId={brandId} p={p} current={current} paint={paint} />
      {pictureless && <ImagePickerButton
        brandId={brandId}
        title={p.addImageTitle}
        testId="add-image"
        className={DASHED_BUTTON}
        onPick={(asset) => set(target, (now) => ({ fills: withImage((now.fills ?? []) as Paint[], asset.id) }))}
      >
        <ImageSquareIcon size={14} aria-hidden />
        <span aria-hidden>{p.addImage}</span>
      </ImagePickerButton>}
    </div>
  )
}

/** The letters each effect tile shows its effect on; the same in every language, as a font sample is. */
const TILE_SAMPLE = 'Aa'

type Tile = 'none' | 'shadow' | 'glow' | 'outline' | 'blur'
const TILE_EFFECT: Partial<Record<Tile, Effect['type']>> = { shadow: 'dropShadow', glow: 'glow', blur: 'layerBlur' }
/** How each tile draws its Aa, close to what the effect does. */
const TILE_LOOK: Record<Tile, string> = {
  none: '',
  shadow: '[text-shadow:3px_3px_0_rgb(0_0_0/0.55)]',
  glow: '[text-shadow:0_0_7px_var(--accent),0_0_14px_var(--accent)]',
  outline: 'text-transparent [-webkit-text-stroke:1px_var(--text)]',
  blur: 'blur-[1.5px]',
}
/** How each tile draws the selected layer's picture, close to what its effect does; Outline is a picture of its own. */
const THUMB_LOOK: Record<Tile, string> = {
  none: '',
  shadow: '[filter:drop-shadow(3px_3px_0_rgb(0_0_0/0.55))]',
  glow: '[filter:drop-shadow(0_0_4px_var(--accent))_drop-shadow(0_0_8px_var(--accent))]',
  outline: '',
  blur: 'blur-[1.5px]',
}
/** How long the layer has to stay as it is before its tiles draw it again; a drag redraws them once, after it ends. */
const THUMB_SETTLE_MS = 150

type Thumbnails = { id: string; plain: string | null; outlined: string | null }

/**
 * One layer's pictures for the effect tiles, drawn by the editor's renderer: as soon as the layer is
 * selected, and again a moment after the stage last drew (an edit, or a font or image arriving),
 * so a drag draws them once, at its end. For text, also its outlined "Aa". Null while there are
 * none (several layers, nothing drawn).
 */
function useLayerThumbnails(editor: Editor, id: string | null, text: boolean): Thumbnails | null {
  const [shown, setShown] = useState<Thumbnails | null>(null)
  useEffect(() => {
    if (!id) return
    const draw = () => {
      const next = { id, plain: editor.layerThumbnail(id), outlined: text ? editor.layerThumbnail(id, 96, true) : null }
      setShown((now) => (now?.id === next.id && now.plain === next.plain && now.outlined === next.outlined ? now : next))
    }
    draw()
    let timer: ReturnType<typeof setTimeout> | undefined
    const later = () => {
      clearTimeout(timer)
      timer = setTimeout(() => (editor.gesturing() ? later() : draw()), THUMB_SETTLE_MS)
    }
    const stop = editor.onDraw(later)
    return () => {
      stop()
      clearTimeout(timer)
    }
  }, [editor, id, text])
  return shown?.id === id ? shown : null
}

/**
 * The effects as tiles, as in the mock: none, a shadow, a glow, and an outline for text or a blur for
 * the rest. A tile turns its effect on or off; under the tiles are the outline's width and colour
 * for outlined text, every effect's numbers, and a menu that adds the ones without a tile.
 */
export function EffectsBody({ target, p }: { target: Target; p: P }) {
  // One layer previews each effect on itself: its picture, or for text "Aa" in its look.
  const one = target.ids.length === 1 ? target.ids[0] ?? null : null
  const thumbnails = useLayerThumbnails(target.editor, one, target.types[0] === 'text')
  const lists = target.props.map((pr) => (pr.effects ?? []) as Effect[])
  const list = shared(lists)
  const write = (to: (now: Effect[]) => Effect[]) => set(target, (now) => ({ effects: to((now.effects ?? []) as Effect[]) }))
  const text = target.types.every((type) => type === 'text')
  const tiles: Tile[] = ['none', 'shadow', 'glow', text ? 'outline' : 'blur']
  const outlined = (pr: Props) => ((pr.style as Style | undefined)?.outline as { width: number } | undefined)?.width ?? 0
  const on = (tile: Tile): boolean => {
    if (tile === 'outline') return target.props.every((pr) => outlined(pr) > 0)
    if (tile === 'none') return lists.every((l) => l.length === 0) && (!text || target.props.every((pr) => outlined(pr) === 0))
    return lists.every((l) => l.some((e) => e.type === TILE_EFFECT[tile]))
  }
  const press = (tile: Tile) => {
    if (tile === 'none') {
      set(target, (now) => ({ effects: [], ...(text ? { style: { ...(now.style as Style), outline: undefined } } : {}) }))
      return
    }
    if (tile === 'outline') {
      const off = on('outline')
      set(target, (now) => ({ style: { ...(now.style as Style), outline: off ? undefined : { width: 2, color: ((now.style as Style).outline as { color?: string } | undefined)?.color ?? '#000000FF' } } }))
      return
    }
    const type = TILE_EFFECT[tile] as Effect['type']
    const off = on(tile)
    write((now) => (off ? now.filter((e) => e.type !== type) : now.some((e) => e.type === type) ? now : [...now, NEW_EFFECT[type]]))
  }
  const outline = shared(target.props.map((pr) => (pr.style as Style | undefined)?.outline as { width: number; color: string } | undefined))
  const setOutline = (to: (was: { width: number; color: string }) => { width: number; color: string }) =>
    set(target, (now) => {
      const was = (now.style as Style).outline as { width: number; color: string } | undefined
      return was ? { style: { ...(now.style as Style), outline: to(was) } } : null
    })
  return (
    <>
      <div role="group" aria-label={p.effects} className="grid grid-cols-4 gap-[7px] px-[18px] pb-3.5">
        {tiles.map((tile) => (
          <button
            key={tile}
            type="button"
            aria-pressed={on(tile)}
            data-tile={tile}
            onClick={() => press(tile)}
            className={TILE}
          >
            <span className={TILE_FACE}>
              {thumbnails?.plain
                ? <img src={(tile === 'outline' && thumbnails.outlined) || thumbnails.plain} alt="" draggable={false} data-thumbnail className={cn('size-[62%] object-contain', THUMB_LOOK[tile])} />
                : <span aria-hidden className={cn('font-display text-[19px] font-extrabold text-text', TILE_LOOK[tile])}>{TILE_SAMPLE}</span>}
            </span>
            {p.tiles[tile]}
          </button>
        ))}
      </div>
      <div className={cn('flex flex-col gap-2.5', CARD_LOWER)}>
          {text && outline && outline !== 'mixed' && outline.width > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-24 shrink-0">
                <NumberField label="W" name={p.outlineWidth} value={outline.width} min={0} step={0.5} editor={target.editor} onSet={(width) => setOutline((was) => ({ ...was, width }))} onShift={(by) => setOutline((was) => ({ ...was, width: tidy(clamp(was.width + by, 0)) }))} />
              </div>
              <ColorField name={p.outline} value={outline.color} onSet={(to) => setOutline((was) => ({ ...was, color: to(was.color) }))} />
            </div>
          )}
          <Select
            name="add-effect"
            label={p.addEffect}
            value=""
            placeholder={p.addEffect}
            options={(Object.keys(NEW_EFFECT) as Effect['type'][]).map((type) => ({ value: type, label: p.effect[type] }))}
            onChange={(type) => {
              const fresh = NEW_EFFECT[type as Effect['type']]
              write((now) => [...(list === 'mixed' ? [] : now), fresh])
            }}
            className="h-7 w-full bg-bg/40 px-2 text-[12px] font-semibold"
          />
          {list === 'mixed'
            ? (
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                {p.mixedList}
                <button type="button" onClick={() => write(() => [])} className="cursor-pointer font-medium text-accent-text hover:underline">{p.useOne}</button>
              </div>
            )
            : list.map((effect, i) => <EffectRow key={i} effect={effect} i={i} target={target} p={p} write={write} />)}
        </div>
    </>
  )
}

/**
 * Where changes go when a design has more than one size: a chip in the header card naming them, which
 * opens to choose all sizes or only this one, and to reset what this size has of its own.
 */
function ScopeMenu({ everyFormat, onChange, size, p, children }: { everyFormat: boolean; onChange: (every: boolean) => void; size: string; p: P; children?: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" data-testid="scope-chip" className={cn(CHIP_ACCENT, 'shrink-0', FOCUS_RING)}>
          {everyFormat ? p.forAllSizes : format(p.onlySize, { size })}
          <CaretDownIcon size={10} weight="bold" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} aria-label={p.applyTo} data-testid="scope-menu" className={cn(POPOVER, 'flex w-64 flex-col gap-2.5 p-2.5')}>
          <div role="radiogroup" aria-label={p.applyTo} className={SEGMENTS}>
            {([true, false] as const).map((every) => (
              <button key={String(every)} type="button" role="radio" aria-checked={everyFormat === every} onClick={() => onChange(every)} className={SEGMENT}>
                {every ? p.allSizes : format(p.onlySize, { size })}
              </button>
            ))}
          </div>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** The effects of several layers, which have no bar of their own for them. */
function EffectsCard({ target, p }: { target: Target; p: P }) {
  return (
    <section aria-labelledby="effects-card-title" className={CARD} data-testid="effects-card">
      <CardHeader id="effects-card-title" title={p.effects} />
      <EffectsBody target={target} p={p} />
    </section>
  )
}

/**
 * The selected layers as the cards and the bar act on them, in the frame they are selected in: like a
 * drag on the canvas, a change goes to the format shown unless every format is asked for. Null when
 * none of them is in the design.
 */
export function useTarget(editor: Editor, ids: string[]): { target: Target; design: Design } | null {
  const { design } = useLiveDesign(editor)
  const everyFormat = useEveryFormat()
  const [framePage, frameFormat] = editor.selectedFrame()?.split('/') ?? []
  const formatId = frameFormat && design.formats[frameFormat] ? frameFormat : design.meta.primaryFormatId
  const live = ids.filter((id) => design.nodes[id])
  if (live.length === 0) return null
  const placedIn = (id: string) => ({ ...design.nodes[id]?.props, ...design.overrides[`format:${formatId}`]?.[id] }) as Props
  return {
    design,
    target: {
      editor, ids: live, pageId: framePage ?? '', formatId, everyFormat: everyFormat || Object.keys(design.formats).length === 1,
      props: live.map(placedIn), types: live.map((id) => design.nodes[id]?.type ?? ''), names: live.map((id) => design.nodes[id]?.name ?? ''),
    },
  }
}

/**
 * The selection's cards, after the font: the header card first (Arrange before it for several
 * layers, as the mock's "3 selected"), then the look, the rest open, and See-through last.
 */
export function SelectionCards({ editor, brandId, ids }: { editor: Editor; brandId: string; ids: string[] }) {
  const t = useMessages()
  const p = t.editor.props
  const everyFormat = useEveryFormat()
  // Once nothing is selected, changes go to the format shown again.
  useEffect(() => () => setEveryFormat(false), [])
  const selected = useTarget(editor, ids)
  if (!selected) return null
  const { target, design } = selected
  const { ids: live, types, formatId } = target
  const all = (...kinds: string[]) => types.every((type) => kinds.includes(type))
  const several = live.length > 1
  const shapeKinds = new Set(live.map((id) => {
    const node = design.nodes[id]
    return node?.type === 'graphic' ? node.props.shape.kind : null
  }))
  const [shapeKind] = shapeKinds
  // Children of an auto layout frame, every one of them.
  const inFlow = live.every((id) => {
    const parent = design.nodes[design.nodes[id]?.parentId ?? '']
    return parent?.type === 'frame' && parent.props.layout !== undefined
  })
  const imageFill = imageFillOf(target)
  const ownShape = shapeKinds.size === 1 && (shapeKind === 'rect' || shapeKind === 'polygon' || shapeKind === 'star' || shapeKind === 'line') ? shapeKind : null
  const scope = Object.keys(design.formats).length > 1 && (
    <ScopeMenu everyFormat={everyFormat} onChange={setEveryFormat} size={design.formats[formatId]?.name ?? ''} p={p}>
      <OwnChanges design={design} ids={live} formatId={formatId} editor={editor} p={p} />
    </ScopeMenu>
  )
  return (
    <>
      <HeaderCard target={target} p={p} scope={scope}>
        {imageFill && <FitRow target={target} p={p} index={imageFill.index} paint={imageFill.paint} />}
      </HeaderCard>
      {/* One layer's look, outline and effects are in the bar; the panel keeps their numbers. A photo's
          fills and strokes, and several layers' look, outline and effects, are cards here. */}
      {imageFill
        ? (
          <>
            {several && <PhotosCard target={target} p={p} brandId={brandId} index={imageFill.index} paint={imageFill.paint} />}
            <AdjustCard target={target} p={p} index={imageFill.index} paint={imageFill.paint} />
            <ColourCard target={target} brandId={brandId} p={p} b={t.editor.bar} swatches={false} />
          </>
        )
        : all('graphic', 'frame', 'boolean') && (several
          ? <ColourCard target={target} brandId={brandId} p={p} b={t.editor.bar} swatches />
          : ownShape && <ShapeCard target={target} p={p} kind={ownShape} />)}
      {several && !all('text') && <EffectsCard target={target} p={p} />}
      {all('text') && <TextBoxCard target={target} p={p} />}
      {all('text') && <SpacingCard target={target} p={p} />}
      {all('frame') && <FrameCard target={target} p={p} />}
      {all('frame') && <AutoLayoutCard target={target} p={p} ownSizing={!inFlow} />}
      {inFlow && <FlowCard target={target} p={p} />}
      <SeeThroughCard target={target} p={p} />
    </>
  )
}
