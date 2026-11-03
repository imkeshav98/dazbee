'use client'

// The selection's settings, as the top bar's edit panels and pop-ups show them: the box and the
// turn, the shape's own, the photo's filters, fit and adjustments, the text's colour, alignment,
// list, case, spacing and box, auto layout, the fills, the strokes, the effects, how much it shows
// through, its mask and its boolean operation. A value the selected layers don't share
// shows as mixed; setting it gives them all the same one, and scrubbing or the arrow keys move each
// from its own. With more than one format the changes go to every format or to this one only. Each
// change is one undo step, and a drag on a number, however long, is one too.
import * as Popover from '@radix-ui/react-popover'
import { CaretDownIcon, ImageSquareIcon, PlusIcon } from '@phosphor-icons/react'
import { withImage, type Editor } from '@dazbee/editor'
import { BlendMode, BooleanOp, boundFillIndex, brandRef, ContainerBlendMode, ImageFilter, LineEnd, type Design, type Effect, type ImageAdjust, type Paint, type Shape } from '@dazbee/schema'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { format, type Messages } from '../../lib/i18n/index.ts'
import { designColours } from '../../lib/design-colours.ts'
import { sizeTo } from '../../lib/size.ts'
import { Select } from '../ui/select.tsx'
import { PICKED_RING, SWATCHES } from './card.tsx'
import { CHIP, CHIP_ACCENT, FIELD, FIELD_LABEL, FOCUS_RING, KNOB_SWITCH, KNOBS, LINK_BUTTON, PANEL_BUTTON, PANEL_HEADING, PANEL_PART, POPOVER, SEGMENT, SEGMENTS, SWATCH, SWITCH, SWITCH_ROW, TILE, TILE_FACE_WIDE } from './styles.ts'
import { COMBINE } from './arrange-panel.tsx'
import { ImagePickerButton } from './image-tool.tsx'
import { useBrandKit } from './use-brand-kit.ts'
import { useLiveDesign } from './use-live-design.ts'
import { setEveryFormat, useEveryFormat } from './scope-store.ts'
import { Choice, clamp, ColorField, NumberField, tidy } from './fields.tsx'
import { AddButton, assetThumbnail, PaintEditor, PaintRow, RemoveButton, Stack } from './paint-stack.tsx'

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
  /** Each character's style in the selected range while that one text layer is being edited: what text styling then changes. */
  range?: Style[] | undefined
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

/** A part of an edit panel or pop-up: its heading, an action at the end, its controls. Advanced's heading is `strong`. */
function Card({ id, title, note, action, strong = false, children }: { id: string; title: string; note?: string; action?: ReactNode; strong?: boolean; children?: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className={PANEL_PART} data-testid={id}>
      <div className="flex h-7 items-center gap-2">
        <h3 id={`${id}-title`} className={cn('min-w-0 flex-1 truncate text-xs font-semibold', strong ? 'text-text' : 'text-muted')}>{title}</h3>
        {note && <span className="min-w-0 max-w-[60%] truncate text-[11px] font-medium text-muted">{note}</span>}
        {action}
      </div>
      {children}
    </section>
  )
}

const num = (props: Props, key: string) => props[key] as number

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
  const resize = (now: Props, axis: 'width' | 'height', to: number) => sizeTo({ width: num(now, 'width'), height: num(now, 'height') }, axis, to, keepRatio)
  const sides = [
    { key: 'width', label: p.width, name: p.widthName },
    { key: 'height', label: p.height, name: p.heightName },
  ] as const
  const spots = [
    { key: 'x', label: p.x, name: p.xName },
    { key: 'y', label: p.y, name: p.yName },
  ] as const
  return (
    <Card id="layout-card" title={title} strong>
      <div className={KNOBS}>
        {sized && sides.map((f) => (
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
    </Card>
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

function ListBody<T>({ title, item = title, p, target, field, fresh, onTop = fresh, topFirst = false, header = true, testId, render }: {
  /** What one row is called in its add and remove buttons, where it differs from `title`. */
  item?: string
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
          <AddButton label={format(p.add, { name: item.toLowerCase() })} onClick={add} />
        </div>
      )}
      {list === 'mixed'
        ? (
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            {p.mixedList}
            <button type="button" onClick={() => write(() => [fresh])} className="cursor-pointer font-medium text-accent-text hover:underline">{p.useOne}</button>
          </div>
        )
        : <Stack items={list} field={field} topFirst={topFirst} removeLabel={(n) => format(p.remove, { name: item.toLowerCase(), n })} onWrite={write} render={render} />}
    </div>
  )
}

/** The fill list, under a heading with +, each fill with its editor. */
export function FillBody({ target, brandId, p, title }: { target: Target; brandId: string; p: P; title: string }) {
  return (
    <ListBody<Paint>
      title={title}
      p={p}
      target={target}
      field="fills"
      fresh={NEW_FILL}
      onTop={FILL_ON_TOP}
      topFirst
      item={p.fill}
      testId="fill-list"
      render={(paint, n, change) => <PaintRow paint={paint} name={format(p.colour, { n })} brandId={brandId} editor={target.editor} p={p} onSet={change} />}
    />
  )
}

/**
 * The strokes, each with its paint, width, place, dashes, ends and corners, under a heading with +:
 * the Outline panel's Advanced.
 */
export function StrokeBody({ target, brandId, p, title }: { target: Target; brandId: string; p: P; title: string }) {
  return (
    <ListBody<Stroke>
      title={title}
      p={p}
      target={target}
      field="strokes"
      fresh={NEW_STROKE}
      topFirst
      item={p.stroke}
      testId="stroke-list"
      render={(stroke, n, change) => <StrokeRow stroke={stroke} place={n} brandId={brandId} p={p} editor={target.editor} onSet={change} />}
    />
  )
}

type StrokeLook = 'none' | 'solid' | 'dashed'
const STROKE_LOOKS: StrokeLook[] = ['none', 'solid', 'dashed']
/** How each of the Outline panel's tiles draws its stroke: a faint square for none, a solid or a dashed one. */
const STROKE_FACE: Record<StrokeLook, string> = {
  none: 'border-2 border-line-strong',
  solid: 'border-[3px] border-text',
  dashed: 'border-[3px] border-dashed border-text',
}
const DASHES = [8, 4]
const dashed = (stroke: Stroke) => (stroke.dashes?.length ?? 0) > 0
/** A stroke drawn solid: its dashes and their offset gone. */
function solidOf(stroke: Stroke): Stroke {
  const next = { ...stroke }
  delete next.dashes
  delete next.dashOffset
  return next
}

/**
 * The Outline panel: the strokes' look as three tiles, none, solid or dashed, and the width of every
 * stroke, then each stroke's own settings under Advanced. Picking solid or dashed gives a layer
 * without a stroke a new one.
 */
function StrokePanel({ target, brandId, p, b }: { target: Target; brandId: string; p: P; b: Messages['editor']['bar'] }) {
  const lists = target.props.map((pr) => (pr.strokes ?? []) as Stroke[])
  const look: StrokeLook | 'mixed' = lists.every((l) => l.length === 0)
    ? 'none'
    : lists.every((l) => l.length > 0 && l.every(dashed))
      ? 'dashed'
      : lists.every((l) => l.length > 0 && !l.some(dashed)) ? 'solid' : 'mixed'
  const pick = (to: StrokeLook) => set(target, (now) => {
    const strokes = (now.strokes ?? []) as Stroke[]
    if (to === 'none') return { strokes: [] }
    const kept = strokes.length > 0 ? strokes : [NEW_STROKE]
    return { strokes: kept.map((stroke) => (to === 'solid' ? solidOf(stroke) : dashed(stroke) ? stroke : { ...stroke, dashes: DASHES })) }
  })
  const widths = shared(lists.flatMap((l) => l.map((stroke) => stroke.width)))
  const setWidths = (to: (now: number) => number) => set(target, (now) => ({ strokes: ((now.strokes ?? []) as Stroke[]).map((stroke) => ({ ...stroke, width: tidy(clamp(to(stroke.width), 0.5)) })) }))
  return (
    <>
      <Card id="stroke-look" title={b.strokeLook.title}>
        <div role="radiogroup" aria-label={b.strokeLook.title} className="grid grid-cols-3 gap-[7px]">
          {STROKE_LOOKS.map((to) => (
            <button key={to} type="button" role="radio" aria-checked={look === to} data-value={to} onClick={() => pick(to)} className={TILE}>
              <span className={TILE_FACE_WIDE}><span aria-hidden className={cn('size-6 rounded-[5px]', STROKE_FACE[to])} /></span>
              <span className="w-full truncate text-center">{b.strokeLook[to]}</span>
            </button>
          ))}
        </div>
        {look !== 'none' && (
          <NumberField
            label={b.strokeLook.width}
            name={b.strokeLook.widthName}
            value={widths}
            min={0.5}
            step={0.5}
            fillRange={[0, 24]}
            editor={target.editor}
            onSet={(v) => setWidths(() => v)}
            onShift={(by) => setWidths((now) => now + by)}
          />
        )}
      </Card>
      <Card id="stroke-card" title={b.advanced} strong>
        <StrokeBody target={target} brandId={brandId} p={p} title={b.strokeLook.outlines} />
      </Card>
    </>
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
    <div className="flex flex-col gap-1.5" data-item={`effects-${i}`}>
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
      {'color' in effect && <ColorField name={format(p.effectNamed, { effect: effectName, n: i + 1 })} value={effect.color} onSet={(to) => change((now) => ({ ...now, color: to('color' in now ? now.color : undefined) }) as Effect)} />}
    </div>
  )
}

export type Style = Record<string, unknown> & { fontFamily: string; fontWeight: number; fontSize: number; color: string; letterSpacing?: number; lineHeight?: number; textCase?: string }

/**
 * The text's style, read and set: of the selected range while one text layer is being edited, so
 * only those characters change, else of the selected layers. A range shifted from mixed values
 * starts from its first character's.
 */
export function textStyle(target: Target) {
  const { range } = target
  const styles = range ?? target.props.map((pr) => pr.style as Style)
  /** A layer's style with `key` set, and with shrink to fit on, a size set is its largest size too. */
  const styled = (now: Props, key: string, value: unknown): Patch => ({
    style: { ...(now.style as Style), [key]: value },
    ...(key === 'fontSize' && typeof value === 'number' ? largestAt(now, value) : {}),
  })
  return {
    styles,
    style: (key: string) => shared(styles.map((s) => s[key])),
    setStyle: (key: string, value: unknown) =>
      range ? target.editor.styleTextSelection({ [key]: value }) : set(target, (now) => styled(now, key, value)),
    shiftStyle: (key: string, by: number, min?: number, from = 0) =>
      range
        ? target.editor.styleTextSelection({ [key]: tidy(clamp(((range[0]?.[key] as number | undefined) ?? from) + by, min)) })
        : set(target, (now) => styled(now, key, tidy(clamp((((now.style as Style)[key] as number | undefined) ?? from) + by, min)))),
  }
}

/** The sizes shrink to fit draws text between. */
type Fit = { min: number; max: number }

/**
 * With shrink to fit on, the text is drawn at the largest size that fits between its smallest and
 * largest, whatever its size says, so its size is kept as its largest: a size set becomes the
 * largest, and the smallest comes down to it when it was above it. Selected characters' own sizes
 * are scaled with the text's, so a size set on them needs nothing more.
 */
function largestAt(now: Props, size: number): Patch {
  const fit = now.shrinkToFit as Fit | undefined
  return fit ? { shrinkToFit: { min: Math.min(fit.min, size), max: size } } : {}
}

/** Shrink to fit's sizes as set under the Spacing panel's Advanced, the text's size following the largest. */
const fitPatch = (now: Props, fit: Fit): Patch => ({ shrinkToFit: fit, style: { ...(now.style as Style), fontSize: fit.max } })

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

/**
 * The text's spacing as slider fields, one to a row: between its lines (Auto when cleared), its
 * letters, which can come closer as well as part, and its paragraphs.
 */
function SpacingCard({ target, p }: { target: Target; p: P }) {
  const { style, setStyle, shiftStyle } = textStyle(target)
  return (
    <Card id="spacing-card" title={p.spacing}>
      <div className="grid gap-1.5">
        <NumberField
          label={p.lineHeight}
          name={p.lineHeight}
          value={style('lineHeight') as number | 'mixed' | undefined}
          step={0.05}
          min={0.5}
          fillRange={[0.8, 2]}
          placeholder={p.lineHeightAuto}
          editor={target.editor}
          onSet={(v) => setStyle('lineHeight', v)}
          onShift={(by) => shiftStyle('lineHeight', by, 0.5, 1.2)}
          onClear={() => setStyle('lineHeight', undefined)}
        />
        <NumberField label={p.letterSpacing} name={p.letterSpacing} value={(style('letterSpacing') ?? 0) as number | 'mixed'} step={0.1} fillRange={[-20, 20]} editor={target.editor} onSet={(v) => setStyle('letterSpacing', v)} onShift={(by) => shiftStyle('letterSpacing', by)} />
        <NumberField
          label={p.paragraphSpacing}
          name={p.paragraphSpacing}
          value={(shared(target.props.map((pr) => pr.paragraphSpacing)) ?? 0) as number | 'mixed'}
          min={0}
          fillRange={[0, 60]}
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

/** The text's alignment, as the top bar's Align pop-up shows it: along the line, and up and down in the box. */
export function TextAlignBody({ target, p }: { target: Target; p: P }) {
  const t = useMessages()
  return (
    <div className="flex w-72 flex-col gap-2.5 p-1">
      <Segments name={p.textAlign} value={shared(target.props.map((pr) => (pr.align ?? 'start') as 'start' | 'center' | 'end' | 'justify'))} options={['start', 'center', 'end', 'justify'] as const} labels={p.textAligns} onSet={(align) => set(target, () => ({ align }))} />
      <Segments name={t.editor.bar.upDown} value={shared(target.props.map((pr) => (pr.verticalAlign ?? 'top') as 'top' | 'middle' | 'bottom'))} options={['top', 'middle', 'bottom'] as const} labels={p.verticalAligns} onSet={(verticalAlign) => set(target, () => ({ verticalAlign }))} />
    </div>
  )
}

/** The text's list, as the top bar's List pop-up shows it: none, bullets or numbers. */
export function TextListBody({ target, p }: { target: Target; p: P }) {
  return (
    <div className="flex w-64 flex-col p-1">
      <Segments name={p.list} value={shared(target.props.map((pr) => (pr.list ?? 'none') as 'none' | 'bullet' | 'number'))} options={['none', 'bullet', 'number'] as const} labels={p.lists} onSet={(list) => set(target, () => ({ list: list === 'none' ? undefined : list }))} />
    </div>
  )
}

/** The text's case, as the top bar's aA pop-up shows it. */
export function TextCaseBody({ target, p }: { target: Target; p: P }) {
  const { style, setStyle } = textStyle(target)
  return (
    <div className="flex w-56 flex-col p-1">
      <Segments name={p.textCase} value={(style('textCase') ?? 'none') as 'none' | 'upper' | 'lower' | 'title' | 'mixed'} options={['none', 'upper', 'lower', 'title'] as const} labels={p.textCases} marks={CASE_MARKS} onSet={(v) => setStyle('textCase', v)} />
    </div>
  )
}

/** Whether every selected text (or the selected run) has a style flag on, such as underline, or some do. */
export function textFlag(target: Target, key: 'underline' | 'strikethrough'): boolean | 'mixed' {
  const on = textStyle(target).style(key)
  return on === 'mixed' ? 'mixed' : on === true
}

/** Turns a style flag on or off for the selected text, or the selected run while editing. */
export const setTextFlag = (target: Target, key: 'underline' | 'strikethrough', on: boolean) => textStyle(target).setStyle(key, on)

/** The letters a box mode's tile draws in its box; the same in every language, as a font sample is. */
const SAMPLE_LETTERS = 'Aa'
/**
 * How each box mode's tile draws it: a box round "Aa", dashed where it grows, with arrows along the
 * way it grows, or solid with its corners marked where it holds its size.
 */
function BoxArt({ mode }: { mode: BoxMode }) {
  const box = mode === 'autoWidth' ? { x: 16, y: 8, width: 32, height: 18 } : mode === 'autoHeight' ? { x: 6, y: 4, width: 52, height: 26 } : { x: 6, y: 8, width: 52, height: 18 }
  const marks = {
    autoWidth: 'M4 17h8M8 14l-4 3 4 3M60 17h-8M56 14l4 3-4 3',
    autoHeight: 'M58 6v22M55 9l3-3 3 3M55 25l3 3 3-3',
    fixed: 'M6 8h3M6 8v3M58 26h-3M58 26v-3',
  }
  return (
    <svg width="64" height="34" viewBox="0 0 64 34" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect {...box} rx="3" strokeDasharray={mode === 'fixed' ? undefined : '3 2'} />
      <text x="32" y="21" textAnchor="middle" fill="currentColor" stroke="none" className="font-sans text-[10px] font-semibold">{SAMPLE_LETTERS}</text>
      <path d={marks[mode]} strokeWidth={mode === 'fixed' ? 2 : 1.5} />
    </svg>
  )
}

/** The text's box as three picture tiles: growing along a line, growing down, or holding its size. */
function TextBoxCard({ target, p }: { target: Target; p: P }) {
  const mode = (shared(target.props.map((pr) => pr.boxMode)) ?? 'autoHeight') as BoxMode | 'mixed'
  return (
    <Card id="text-box-card" title={p.textBox}>
      <div role="radiogroup" aria-label={p.boxMode} className="grid grid-cols-3 gap-[7px]">
        {(['autoWidth', 'autoHeight', 'fixed'] as const).map((to) => (
          <button key={to} type="button" role="radio" aria-checked={mode === to} data-value={to} onClick={() => set(target, () => ({ boxMode: to }))} className={TILE}>
            <span className={cn(TILE_FACE_WIDE, 'text-muted group-aria-checked:text-text')}><BoxArt mode={to} /></span>
            <span className="w-full truncate text-center">{p.boxModes[to]}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}

/** The text box's numbers, under Advanced: shrinking to fit between a smallest and a largest size, and the lines shown at most. */
function TextFitCard({ target, p, title }: { target: Target; p: P; title: string }) {
  const value = (key: string) => shared(target.props.map((pr) => pr[key])) as unknown
  const shrink = value('shrinkToFit') as Fit | undefined | 'mixed'
  return (
    <Card id="text-fit-card" title={title} strong>
      <SwitchRow
        name={p.shrinkToFit}
        on={shrink === 'mixed' ? 'mixed' : shrink !== undefined}
        onSet={(on) => set(target, (now) => {
          const size = (now.style as Style).fontSize
          return { shrinkToFit: on ? { min: tidy(Math.max(1, size / 2)), max: size } : undefined }
        })}
      />
      {shrink !== undefined && shrink !== 'mixed' && (
        <div className={KNOBS}>
          {(['min', 'max'] as const).map((end) => (
            <NumberField
              key={end}
              label={p.shrinkShort[end]}
              name={p.shrinkSize[end]}
              value={shrink[end]}
              min={1}
              editor={target.editor}
              onSet={(v) => set(target, (now) => {
                const was = now.shrinkToFit as Fit | undefined
                if (!was) return null
                const next = { ...was, [end]: v }
                return fitPatch(now, end === 'min' ? { min: Math.min(next.min, next.max), max: next.max } : { min: next.min, max: Math.max(next.min, next.max) })
              })}
              onShift={(by) => set(target, (now) => {
                const was = now.shrinkToFit as Fit | undefined
                if (!was) return null
                const v = tidy(Math.max(1, was[end] + by))
                return fitPatch(now, end === 'min' ? { min: Math.min(v, was.max), max: was.max } : { min: was.min, max: Math.max(v, was.min) })
              })}
            />
          ))}
        </div>
      )}
      <NumberField
        label={p.maxLines}
        name={p.maxLines}
        value={value('maxLines') as number | 'mixed' | undefined}
        min={0}
        placeholder={p.none}
        editor={target.editor}
        // 0, or nothing, lifts the limit.
        onSet={(v) => set(target, () => ({ maxLines: Math.round(v) >= 1 ? Math.round(v) : undefined }))}
        onClear={() => set(target, () => ({ maxLines: undefined }))}
        onShift={(by) => set(target, (now) => {
          const next = Math.round(((now.maxLines as number | undefined) ?? 0) + by)
          return { maxLines: next >= 1 ? next : undefined }
        })}
      />
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
  const picture = assetThumbnail(brandId, paint.assetId)
  const filter = paint.filter ?? 'none'
  return (
    <div role="radiogroup" aria-label={p.filter} className="grid grid-cols-4 gap-1.5">
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

/**
 * The photo's adjustments as slider fields, one to a row, each filling from 0 either way: its light,
 * contrast, saturation, warmth and tint; then how much of the image shows.
 */
function AdjustCard({ target, p, index, paint }: { target: Target; p: P; index: number; paint: ImageFill }) {
  const setPaint = (change: (now: ImageFill) => Partial<ImageFill>) => setImage(target, index, change)
  const setAdjust = (key: keyof ImageAdjust, to: (n: number) => number) => setPaint((now) => {
    const adjust = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, ...now.adjust }
    return { adjust: { ...adjust, [key]: Math.round(clamp(to(adjust[key]), -100, 100)) } }
  })
  return (
    <Card id="adjust-card" title={p.adjustTitle}>
      <div className="grid gap-1.5">
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
          label={p.imageOpacity}
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
function PhotosCard({ target, p, b, brandId, index, paint }: { target: Target; p: P; b: Messages['editor']['bar']; brandId: string; index: number; paint: ImageFill }) {
  return (
    <Card
      id="photos-card"
      title={b.filters}
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

/** The fills, under Advanced with + in its heading: the Colour panel's, and a photo's in its Edit image panel. */
function FillsCard({ target, brandId, p, b, children }: { target: Target; brandId: string; p: P; b: Messages['editor']['bar']; children?: ReactNode }) {
  return (
    <Card id="fill-card" title={b.advanced} strong>
      {children}
      <FillBody target={target} brandId={brandId} p={p} title={b.colourPanel.fills} />
    </Card>
  )
}

type Layout = { direction: 'row' | 'column'; gap: number; padding: Record<'top' | 'right' | 'bottom' | 'left', number>; justify: string; align: string; wrap: boolean; lineGap: number }
type Place = 'start' | 'center' | 'end'
const PLACES: Place[] = ['start', 'center', 'end']

/** Each operation's action, which names it and gives its icon. */
const OPERATIONS = { union: 'booleanUnion', subtract: 'booleanSubtract', intersect: 'booleanIntersect', exclude: 'booleanExclude' } as const

/**
 * A boolean's operation, changed in place for every format: its shapes added together, the rest
 * cut from the first, where they overlap, or where they don't.
 */
function CombineCard({ target, p, a }: { target: Target; p: P; a: Messages['editor']['arrange'] }) {
  const value = shared(target.props.map((pr) => pr.op as (typeof BooleanOp.options)[number]))
  return (
    <Card id="combine-card" title={p.combine}>
      <div role="radiogroup" aria-label={p.combine} className={SEGMENTS}>
        {BooleanOp.options.map((op) => {
          const action = OPERATIONS[op]
          const Icon = COMBINE.find((c) => c.action === action)?.icon
          const name = a[action]
          return (
            <button key={op} type="button" role="radio" aria-checked={value === op} aria-label={name} title={name} data-value={op} onClick={() => set({ ...target, everyFormat: true }, () => ({ op }))} className={cn(SEGMENT, 'grid place-items-center')}>
              {Icon && <Icon size={16} aria-hidden />}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/** A mask: by its shape (where it is opaque) or by its brightness. A mask is the same in every format. */
function MaskCard({ target, p }: { target: Target; p: P }) {
  return (
    <Card id="mask-card" title={p.mask}>
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
    </Card>
  )
}

/** A frame: whether what is inside shows past its edges. */
function FrameCard({ target, p }: { target: Target; p: P }) {
  return (
    <Card id="frame-card" title={p.frame}>
      <CornerFields target={target} p={p} {...frameCorners} />
      <SwitchRow name={p.clip} on={shared(target.props.map((pr) => pr.clip !== false))} onSet={(clip) => set(target, () => ({ clip }))} />
    </Card>
  )
}

/** The room between that the Stack panel offers at a tap. */
const GAPS = [0, 8, 16, 32]

/**
 * The Stack panel: auto layout on or off by the switch in its heading; then its direction and
 * wrapping, the room between, at a tap or by number, and together or spread out. Under Advanced, a
 * 3×3 pad that lines up what is inside along both axes at once, the room around and each side's,
 * and, when `ownSizing`, how the frame sizes.
 */
function AutoLayoutCard({ target, p, b, ownSizing }: { target: Target; p: P; b: Messages['editor']['bar']; ownSizing: boolean }) {
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
  const gap = value('gap') as number | 'mixed'
  const around = shared(layouts.flatMap((l) => (l ? [l.padding.top, l.padding.right, l.padding.bottom, l.padding.left] : [])))
  return (
    <>
      <Card id="auto-layout-card" title={p.autoLayout} action={toggle}>
        <span className={PANEL_HEADING}>{p.direction}</span>
        <Segments name={p.direction} value={direction} options={['row', 'column'] as const} labels={p.directions} onSet={(to) => setLayout(() => ({ direction: to }))} />
        <SwitchRow name={p.wrap} on={value('wrap') === 'mixed' ? 'mixed' : value('wrap') === true} onSet={(wrap) => setLayout(() => ({ wrap }))} />
        <span className={PANEL_HEADING}>{p.gap}</span>
        <div role="group" aria-label={p.gap} className="grid grid-cols-4 gap-1.5">
          {GAPS.map((to) => (
            <button key={to} type="button" aria-pressed={gap === to} data-gap={to} onClick={() => setLayout(() => ({ gap: to }))} className={cn(PANEL_BUTTON, 'justify-center font-mono tabular-nums aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text')}>
              {to}
            </button>
          ))}
        </div>
        <NumberField label={p.between} name={p.gap} value={gap} fillRange={[0, 64]} editor={target.editor} onSet={(to) => setLayout(() => ({ gap: to }))} onShift={(by) => setLayout((l) => ({ gap: tidy(l.gap + by) }))} />
        <Segments name={p.spreadOut} value={justify === 'mixed' ? 'mixed' : justify === 'space-between' ? 'between' : 'packed'} options={['packed', 'between'] as const} labels={p.spreads} onSet={(to) => setLayout((l) => ({ justify: to === 'between' ? 'space-between' : l.justify === 'space-between' ? 'start' : l.justify }))} />
      </Card>
      <Card id="auto-layout-advanced" title={b.advanced} strong>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-text">{p.lineUp}</span>
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
        </div>
        <NumberField
          label={p.paddingAll}
          name={p.paddingAll}
          value={around}
          editor={target.editor}
          onSet={(v) => setLayout(() => ({ padding: { top: v, right: v, bottom: v, left: v } }))}
          onShift={(by) => setLayout((l) => ({ padding: { top: tidy(l.padding.top + by), right: tidy(l.padding.right + by), bottom: tidy(l.padding.bottom + by), left: tidy(l.padding.left + by) } }))}
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
      </Card>
    </>
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

/**
 * A layer in an auto layout, in the Position panel's Advanced: on each axis its own size, fitting
 * its content or filling the room, and kept where it is put, out of the flow.
 */
function FlowPart({ target, p }: { target: Target; p: P }) {
  return (
    <div role="group" aria-labelledby="flow-card-title" data-testid="flow-card" className="flex flex-col gap-2.5">
      <h4 id="flow-card-title" className={PANEL_HEADING}>{p.inAutoLayout}</h4>
      <SizingFields target={target} p={p} options={['fixed', 'hug', 'fill']} labels={p.childSizings} />
      <SwitchRow name={p.absolute} on={shared(target.props.map((pr) => pr.absolute === true))} onSet={(absolute) => set(target, () => ({ absolute: absolute ? true : undefined }))} />
    </div>
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
          <Swatch
            key={c.token}
            color={c.value.slice(0, 7)}
            label={c.name}
            on={now === c.value.slice(0, 7).toUpperCase()}
            onPick={() => (target.range ? paint(c.value.slice(0, 7)) : target.editor.bindSelection('color', brandRef(c.token)))}
          />
        ))
        : SWATCHES.map((hex) => <Swatch key={hex} color={hex} label={hex} on={now === hex} onPick={() => paint(hex)} />)}
    </div>
  )
}

/**
 * The colours to pick from, simple first: the brand kit's, which the layers then follow, and the
 * colours already in the design, with + first, which opens `picker` under them: any colour, or
 * for shapes and boxes a gradient or an image too.
 */
function ColourChoices({ target, design, brandId, p, b, current, paint, picker }: {
  target: Target
  design: Design
  brandId: string
  p: P
  b: Messages['editor']['bar']
  current: string | 'mixed' | undefined
  paint: (hex: string) => void
  picker: ReactNode
}) {
  const [picking, setPicking] = useState(false)
  const kit = (useBrandKit(brandId)?.colors.length ?? 0) > 0
  const now = current && current !== 'mixed' ? current.slice(0, 7).toUpperCase() : null
  return (
    <>
      <Card id="brand-colours" title={kit ? b.colourPanel.brandKit : p.colours}>
        <Swatches target={target} brandId={brandId} p={p} current={current} paint={paint} />
      </Card>
      <Card id="design-colours" title={b.colourPanel.inDesign}>
        <div role="group" aria-label={b.colourPanel.inDesign} className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-label={b.colourPanel.pick}
            title={b.colourPanel.pick}
            aria-pressed={picking}
            data-testid="colour-pick"
            onClick={() => setPicking(!picking)}
            className={cn('grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-full border border-dashed border-line-strong text-muted transition-colors hover:border-accent hover:text-text aria-pressed:border-accent aria-pressed:text-accent-text', FOCUS_RING)}
          >
            <PlusIcon size={12} weight="bold" aria-hidden />
          </button>
          {designColours(design).map((hex) => <Swatch key={hex} color={hex} label={hex} on={now === hex} onPick={() => paint(hex)} />)}
        </div>
        {picking && <div className="rounded-[12px] border border-line" data-testid="colour-picker">{picker}</div>}
      </Card>
    </>
  )
}

/**
 * The Colour panel of shapes and boxes: the kit's and the design's colours, which paint the fill
 * that shows, + with any paint for it, Add image for layers without one, then every fill under
 * Advanced.
 */
function ColourPanel({ target, design, brandId, p, b }: { target: Target; design: Design; brandId: string; p: P; b: Messages['editor']['bar'] }) {
  // The fill a colour paints: the topmost one that shows.
  const bound = (fills: Paint[]) => fills[boundFillIndex(fills)]
  const shown = shared(target.props.map((pr) => {
    const fill = bound((pr.fills ?? []) as Paint[])
    return fill?.type === 'solid' ? fill.color : undefined
  }))
  const paintFill = (to: (now: Paint) => Paint) => set(target, (now) => {
    const fills = (now.fills ?? []) as Paint[]
    const i = boundFillIndex(fills)
    return { fills: i < 0 ? [...fills, to(NEW_FILL)] : fills.map((f, j) => (j === i ? to(f) : f)) }
  })
  const paint = (hex: string) => paintFill((now) => (now.type === 'solid' ? { ...now, color: `${hex}FF` } : { type: 'solid', color: `${hex}FF` }))
  // The picker edits the topmost fill that shows, whatever its type, so a gradient picked stays the one it shows.
  const showing = (fills: Paint[]) => fills.findLastIndex((f) => f.visible !== false)
  const pickFill = (to: (now: Paint) => Paint) => set(target, (now) => {
    const fills = (now.fills ?? []) as Paint[]
    const i = showing(fills)
    return { fills: i < 0 ? [...fills, to(NEW_FILL)] : fills.map((f, j) => (j === i ? to(f) : f)) }
  })
  // A picture goes into layers that have none; one that has a picture changes it with Replace on the bar.
  const pictureless = target.props.every((pr) => !((pr.fills ?? []) as Paint[]).some((f) => f.type === 'image'))
  const firstFills = (target.props[0]?.fills ?? []) as Paint[]
  const first = firstFills[showing(firstFills)] ?? NEW_FILL
  return (
    <>
      <ColourChoices
        target={target}
        design={design}
        brandId={brandId}
        p={p}
        b={b}
        current={shown}
        paint={paint}
        picker={<PaintEditor paint={first} brandId={brandId} editor={target.editor} p={p} onSet={pickFill} />}
      />
      {pictureless && (
        <ImagePickerButton
          brandId={brandId}
          title={p.addImageTitle}
          testId="add-image"
          className={PANEL_BUTTON}
          onPick={(asset) => set(target, (now) => ({ fills: withImage((now.fills ?? []) as Paint[], asset.id) }))}
        >
          <ImageSquareIcon size={14} aria-hidden className="shrink-0" />
          <span aria-hidden>{p.addImage}</span>
        </ImagePickerButton>
      )}
      <FillsCard target={target} brandId={brandId} p={p} b={b} />
    </>
  )
}

/** The Colour panel of text: the kit's and the design's colours, and + with any colour by its hex and how much shows. */
function TextColourPanel({ target, design, brandId, p, b }: { target: Target; design: Design; brandId: string; p: P; b: Messages['editor']['bar'] }) {
  const { style, setStyle } = textStyle(target)
  const color = style('color') as string | 'mixed'
  // A range's colour builds on its first character's, as a layer's on its own.
  const first = (target.range?.[0]?.color as string | undefined) ?? ''
  const paint = (hex: string) => (target.range
    ? setStyle('color', `${hex}${first.slice(7, 9) || 'FF'}`)
    : set(target, (now) => ({ style: { ...(now.style as Style), color: `${hex}${((now.style as Style).color ?? '').slice(7, 9) || 'FF'}` } })))
  return (
    <ColourChoices
      target={target}
      design={design}
      brandId={brandId}
      p={p}
      b={b}
      current={color}
      paint={paint}
      picker={(
        <div className="p-3">
          <ColorField
            name={p.textColour}
            value={color}
            onSet={(to) => (target.range ? setStyle('color', to(first)) : set(target, (now) => ({ style: { ...(now.style as Style), color: to((now.style as Style).color) } })))}
          />
        </div>
      )}
    />
  )
}

/** The letters text's effect tiles show their effects on; the same in every language, as a font sample is. */
const SAMPLE_GLYPHS = 'Ag'
/** The effect tiles, in the order the panel shows them; Outline is text's alone. */
type Tile = 'none' | Effect['type'] | 'outline'
const TILES: Tile[] = ['none', 'dropShadow', 'innerShadow', 'glow', 'outline', 'layerBlur', 'backgroundBlur']
/** How a tile's sample shows its effect, close to what the renderer draws. */
const TILE_LOOK: Record<Tile, string> = {
  none: '',
  dropShadow: '[filter:drop-shadow(0_4px_3px_rgb(0_0_0/0.55))]',
  innerShadow: '',
  glow: '[filter:drop-shadow(0_0_4px_var(--accent))_drop-shadow(0_0_2px_var(--accent))]',
  outline: '',
  layerBlur: 'blur-[1.8px]',
  backgroundBlur: '',
}
/** What the effect tiles show their effects on: "Ag" for text, a photo for a photo, a rounded shape for the rest. */
type Sample = { kind: 'text' } | { kind: 'photo'; src: string } | { kind: 'shape' }

/** One tile's picture: the sample with the tile's effect on it. Background blur sets it on a frosted pane over stripes. */
function EffectSample({ sample, tile }: { sample: Sample; tile: Tile }) {
  const inner = tile === 'innerShadow'
  const body = sample.kind === 'text'
    ? (
      <span
        aria-hidden
        className={cn(
          'font-display text-[26px] leading-none font-extrabold',
          tile === 'outline' ? 'text-transparent [-webkit-text-stroke:1.4px_var(--accent)]' : inner ? 'bg-[linear-gradient(180deg,rgb(0_0_0/0.85)_10%,var(--accent)_70%)] bg-clip-text text-transparent' : 'text-accent',
          TILE_LOOK[tile],
        )}
      >
        {SAMPLE_GLYPHS}
      </span>
    )
    : sample.kind === 'photo'
      ? (
        <span aria-hidden className={cn('relative block size-[60%] overflow-hidden rounded-[6px]', TILE_LOOK[tile])}>
          <img src={sample.src} alt="" draggable={false} loading="lazy" className="size-full object-cover" />
          {inner && <span className="absolute inset-0 shadow-[inset_0_4px_6px_rgb(0_0_0/0.65)]" />}
        </span>
      )
      : <span aria-hidden className={cn('block size-[56%] rounded-[10px] bg-accent', inner && 'shadow-[inset_0_4px_6px_rgb(0_0_0/0.55)]', TILE_LOOK[tile])} />
  if (tile !== 'backgroundBlur') return body
  // Background blur blurs what is behind the layer: bright stripes, softened through a frosted pane
  // that holds the sample, sharp.
  return (
    <span aria-hidden className="grid size-full place-items-center bg-[repeating-linear-gradient(135deg,#ff48b0_0_6px,#ffd23f_6px_12px,#3d6bff_12px_18px)]">
      <span className="grid aspect-[4/3] h-[72%] place-items-center rounded-[8px] border border-white/60 bg-white/35 backdrop-blur-[3px]">{body}</span>
    </span>
  )
}

/**
 * The Effects panel: one grid of picture tiles, each previewing its effect on a sample of the
 * selection's kind, never the layer itself. A tile adds its effect, or takes every effect of its type
 * off; None takes them all off. Under Advanced, each effect that is on with its numbers and its own
 * remove button, text's outline with its width and colour, and Add another, which adds a second
 * effect of a type.
 */
export function EffectsBody({ target, p, b, brandId }: { target: Target; p: P; b: Messages['editor']['bar']; brandId: string }) {
  const lists = target.props.map((pr) => (pr.effects ?? []) as Effect[])
  const list = shared(lists)
  const write = (to: (now: Effect[]) => Effect[]) => set(target, (now) => ({ effects: to((now.effects ?? []) as Effect[]) }))
  const kind = kindOf(target)
  const text = kind === 'text'
  const image = imageFillOf(target)
  const sample: Sample = text ? { kind: 'text' } : kind === 'photo' && image ? { kind: 'photo', src: assetThumbnail(brandId, image.paint.assetId) } : { kind: 'shape' }
  const tiles = TILES.filter((tile) => tile !== 'outline' || text)
  const outlined = (pr: Props) => ((pr.style as Style | undefined)?.outline as { width: number } | undefined)?.width ?? 0
  const on = (tile: Tile): boolean => {
    if (tile === 'outline') return target.props.every((pr) => outlined(pr) > 0)
    if (tile === 'none') return lists.every((l) => l.length === 0) && (!text || target.props.every((pr) => outlined(pr) === 0))
    return lists.every((l) => l.some((e) => e.type === tile))
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
    const off = on(tile)
    write((now) => (off ? now.filter((e) => e.type !== tile) : now.some((e) => e.type === tile) ? now : [...now, NEW_EFFECT[tile]]))
  }
  const outline = shared(target.props.map((pr) => (pr.style as Style | undefined)?.outline as { width: number; color: string } | undefined))
  const setOutline = (to: (was: { width: number; color: string }) => { width: number; color: string }) =>
    set(target, (now) => {
      const was = (now.style as Style).outline as { width: number; color: string } | undefined
      return was ? { style: { ...(now.style as Style), outline: to(was) } } : null
    })
  const empty = list !== 'mixed' && list.length === 0 && !(text && outline && outline !== 'mixed' && outline.width > 0)
  return (
    <>
      <section aria-label={p.effects} className={PANEL_PART} data-testid="effect-tiles">
        <div role="group" aria-label={p.effects} className="grid grid-cols-3 gap-[7px]">
          {tiles.map((tile) => (
            <button key={tile} type="button" aria-pressed={on(tile)} data-tile={tile} onClick={() => press(tile)} className={TILE}>
              <span className={TILE_FACE_WIDE}><EffectSample sample={sample} tile={tile} /></span>
              <span className="w-full truncate text-center">{tile === 'none' || tile === 'outline' ? p.tiles[tile] : p.effect[tile]}</span>
            </button>
          ))}
        </div>
      </section>
      <Card id="effects-card" title={b.advanced} strong>
        {text && outline && outline !== 'mixed' && outline.width > 0 && (
          <div className="flex flex-col gap-1.5" data-item="text-outline">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text">{p.tiles.outline}</span>
              <RemoveButton label={format(p.remove, { name: p.tiles.outline.toLowerCase(), n: 1 })} onClick={() => press('outline')} />
            </div>
            <div className="flex items-center gap-1">
              <div className="w-24 shrink-0">
                <NumberField label="W" name={p.outlineWidth} value={outline.width} min={0.5} step={0.5} editor={target.editor} onSet={(width) => setOutline((was) => ({ ...was, width }))} onShift={(by) => setOutline((was) => ({ ...was, width: tidy(clamp(was.width + by, 0.5)) }))} />
              </div>
              <ColorField name={p.outline} value={outline.color} onSet={(to) => setOutline((was) => ({ ...was, color: to(was.color) }))} />
            </div>
          </div>
        )}
        {list === 'mixed'
          ? (
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              {p.mixedList}
              <button type="button" onClick={() => write(() => [])} className="cursor-pointer font-medium text-accent-text hover:underline">{p.useOne}</button>
            </div>
          )
          : list.map((effect, i) => <EffectRow key={i} effect={effect} i={i} target={target} p={p} write={write} />)}
        {empty && <p className="text-xs text-muted">{b.effectsHint}</p>}
        <Select
          name="add-effect"
          label={empty ? p.addEffect : b.addAnother}
          value=""
          placeholder={empty ? p.addEffect : b.addAnother}
          options={(Object.keys(NEW_EFFECT) as Effect['type'][]).map((type) => ({ value: type, label: p.effect[type] }))}
          onChange={(type) => {
            const fresh = NEW_EFFECT[type as Effect['type']]
            write((now) => [...(list === 'mixed' ? [] : now), fresh])
          }}
          className="h-8 w-full rounded-row border border-line bg-surface px-2.5 text-[12px] font-semibold"
        />
      </Card>
    </>
  )
}

/**
 * Where changes go when a design has more than one size: a chip in the header card naming them, which
 * opens to choose all sizes or only this one, and to reset what this size has of its own.
 */
function ScopeMenu({ everyFormat, onChange, size, p, open, onOpen, children }: { everyFormat: boolean; onChange: (every: boolean) => void; size: string; p: P; open: boolean; onOpen: (open: boolean) => void; children?: ReactNode }) {
  return (
    <Popover.Root open={open} onOpenChange={onOpen}>
      <Popover.Trigger asChild>
        <button type="button" data-bar-item data-testid="scope-chip" className={cn(CHIP_ACCENT, 'shrink-0', FOCUS_RING)}>
          {everyFormat ? p.forAllSizes : format(p.onlySize, { size })}
          <CaretDownIcon size={10} weight="bold" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={8} collisionPadding={12} aria-label={p.applyTo} data-testid="scope-menu" className={cn(POPOVER, 'flex w-64 flex-col gap-2.5 p-2.5')}>
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

/** Renders again whenever the text being edited, or its selected range, changes. */
function useTextSelection(editor: Editor) {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const stop = editor.onTextSelection(() => setVersion((v) => v + 1))
    return () => {
      stop()
    }
  }, [editor])
  return editor.textSelection()
}

/**
 * The selected layers as the cards and the bar act on them, in the frame they are selected in: like a
 * drag on the canvas, a change goes to the format shown unless every format is asked for. Null when
 * none of them is in the design.
 */
export function useTarget(editor: Editor, ids: string[]): { target: Target; design: Design } | null {
  const { design } = useLiveDesign(editor)
  const editing = useTextSelection(editor)
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
      range: editing && live.length === 1 && live[0] === editing.id ? (editor.textSelectionStyles() as Style[] | null) ?? undefined : undefined,
    },
  }
}

/** Which top bar a selection gets: the kind every one of its layers is, or mixed. */
export type Kind = 'text' | 'photo' | 'shape' | 'box' | 'group' | 'mixed'

export function kindOf(target: Target): Kind {
  const all = (...kinds: string[]) => target.types.every((type) => kinds.includes(type))
  if (all('text')) return 'text'
  if (all('graphic', 'frame', 'boolean') && imageFillOf(target)) return 'photo'
  if (all('graphic', 'boolean')) return 'shape'
  if (all('frame')) return 'box'
  if (all('group', 'instance', 'lottie')) return 'group'
  return 'mixed'
}

/** What the top bar and its panels need to know of the selected layers beyond their kind. */
export function factsOf(target: Target, design: Design) {
  const shapeKinds = new Set(target.ids.map((id) => {
    const node = design.nodes[id]
    return node?.type === 'graphic' ? node.props.shape.kind : null
  }))
  const [shapeKind] = shapeKinds
  const ownShape: ShapeKind | null = shapeKinds.size === 1 && (shapeKind === 'rect' || shapeKind === 'polygon' || shapeKind === 'star' || shapeKind === 'line') ? shapeKind : null
  // Children of an auto layout frame, every one of them.
  const inFlow = target.ids.every((id) => {
    const parent = design.nodes[design.nodes[id]?.parentId ?? '']
    return parent?.type === 'frame' && parent.props.layout !== undefined
  })
  return {
    ownShape,
    inFlow,
    lines: ownShape === 'line',
    booleans: target.types.every((type) => type === 'boolean'),
    frames: target.types.every((type) => type === 'frame'),
    masks: target.props.every((pr) => Boolean(pr.mask)),
    sized: target.types.every((type) => type !== 'group' && type !== 'boolean'),
  }
}

/**
 * The scope chip, the top bar's first item when the design has more than one format: which formats
 * a change goes to, and the own changes of the one shown, each with Reset.
 */
export function ScopeChip({ target, design, open, onOpen }: { target: Target; design: Design; open: boolean; onOpen: (open: boolean) => void }) {
  const p = useMessages().editor.props
  const everyFormat = useEveryFormat()
  if (Object.keys(design.formats).length < 2) return null
  return (
    <ScopeMenu everyFormat={everyFormat} onChange={setEveryFormat} size={design.formats[target.formatId]?.name ?? ''} p={p} open={open} onOpen={onOpen}>
      <OwnChanges design={design} ids={target.ids} formatId={target.formatId} editor={target.editor} p={p} />
    </ScopeMenu>
  )
}

/**
 * What an edit panel holds for the selection, each card as a part of it: Colour, Outline,
 * Effects, Position, Spacing, Edit image and Stack. Font is the font panel's own.
 */
export function PanelContent({ panel, target, design, brandId }: { panel: string; target: Target; design: Design; brandId: string }) {
  const t = useMessages()
  const p = t.editor.props
  const kind = kindOf(target)
  const facts = factsOf(target, design)
  const several = target.ids.length > 1
  const imageFill = imageFillOf(target)
  const body = (() => {
    switch (panel) {
      case 'colour':
        return kind === 'text'
          ? <TextColourPanel target={target} design={design} brandId={brandId} p={p} b={t.editor.bar} />
          : <ColourPanel target={target} design={design} brandId={brandId} p={p} b={t.editor.bar} />
      case 'outline':
        return <StrokePanel target={target} brandId={brandId} p={p} b={t.editor.bar} />
      case 'effects':
        return <EffectsBody target={target} p={p} b={t.editor.bar} brandId={brandId} />
      case 'position':
        return (
          <>
            <PlaceCard target={target} p={p} title={t.editor.bar.advanced}>
              {facts.inFlow && <FlowPart target={target} p={p} />}
            </PlaceCard>
          </>
        )
      case 'spacing':
        return (
          <>
            <SpacingCard target={target} p={p} />
            <TextBoxCard target={target} p={p} />
            <TextFitCard target={target} p={p} title={t.editor.bar.advanced} />
          </>
        )
      case 'edit':
        if (!imageFill) return null
        return (
          <>
            {several
              ? <PhotosCard target={target} p={p} b={t.editor.bar} brandId={brandId} index={imageFill.index} paint={imageFill.paint} />
              : <Card id="look-card" title={t.editor.bar.filters}><PhotoLookBody target={target} p={p} brandId={brandId} index={imageFill.index} paint={imageFill.paint} /></Card>}
            <AdjustCard target={target} p={p} index={imageFill.index} paint={imageFill.paint} />
            <FillsCard target={target} brandId={brandId} p={p} b={t.editor.bar}>
              <span className={PANEL_HEADING}>{p.fit}</span>
              <FitRow target={target} p={p} index={imageFill.index} paint={imageFill.paint} />
            </FillsCard>
          </>
        )
      case 'stack':
        return <AutoLayoutCard target={target} p={p} b={t.editor.bar} ownSizing={!facts.inFlow} />
      default:
        return null
    }
  })()
  return body
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
        return facts.frames ? <FrameCard target={target} p={p} /> : facts.ownShape === 'rect' && <ShapeCard target={target} p={p} kind="rect" />
      case 'box':
        return <FrameCard target={target} p={p} />
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
