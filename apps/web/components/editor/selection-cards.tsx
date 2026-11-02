'use client'

// The selection's property cards (#60), visual first as in the final mock (layout A): the look
// card (text size and colour, or the shape and its fill, or the image's filters), the effects as
// tiles, then Details, one folded row per card of numbers (#151 to #157). A value the selected
// layers don't share shows as mixed; setting it gives them all the same one, and scrubbing or the
// arrow keys move each from its own. With more than one format the changes go to every format or to
// this one only. Each change is one undo step, and a drag on a number, however long, is one too.
import * as Popover from '@radix-ui/react-popover'
import { ArrowsClockwiseIcon, CaretDownIcon, ImageSquareIcon } from '@phosphor-icons/react'
import { withImage, type Editor } from '@dazbee/editor'
import { BlendMode, boundFillIndex, brandRef, ContainerBlendMode, ImageFilter, LineEnd, type Design, type Effect, type ImageAdjust, type Paint, type Shape } from '@dazbee/schema'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { format, type Messages } from '../../lib/i18n/index.ts'
import { Select } from '../ui/select.tsx'
import { CARD, CARD_LOWER, CardHeader, PICKED_RING, SWATCHES } from './card.tsx'
import { CHIP, CHIP_ACCENT, DASHED_BUTTON, FIELD, FOCUS_RING, KNOBS, KNOBS_FOUR, LINK_BUTTON, POPOVER, SEGMENT, SEGMENTS, SWATCH } from './styles.ts'
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
function shared<T>(values: T[]): T | 'mixed' {
  const [first] = values
  const same = values.every((v) => JSON.stringify(v) === JSON.stringify(first))
  return same ? first as T : 'mixed'
}

/**
 * A checkbox for a value in the document. The cards see the document's change at the redraw after it,
 * so a press shows at once and holds until the document's value changes.
 */
function DocCheckbox({ name, checked, onSet }: { name: string; checked: boolean; onSet: (checked: boolean) => void }) {
  const [pressed, setPressed] = useState<boolean | null>(null)
  useEffect(() => setPressed(null), [checked])
  return (
    <input
      type="checkbox"
      name={name}
      checked={pressed ?? checked}
      onChange={(event) => {
        setPressed(event.target.checked)
        onSet(event.target.checked)
      }}
    />
  )
}

/** A card of the selection's settings, open, as every card is: its title, an action at the end, its controls. */
function Card({ id, title, note, action, children }: { id: string; title: string; note?: string; action?: ReactNode; children: ReactNode }) {
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
function HeaderCard({ target, p, scope }: { target: Target; p: P; scope: ReactNode }) {
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

/**
 * A shape's own settings (#151), for layers that are all the same kind: a rectangle's corner radius
 * or each corner's own, a polygon's sides, a star's points and inner radius, a line's ends.
 */
function ShapeCard({ target, p, kind, look }: { target: Target; p: P; kind: ShapeKind; look?: ReactNode }) {
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
  // A rectangle with each corner's own radius keeps them in its corners; one radius for all drops them.
  const each = kind === 'rect' && shapes.every((s) => s.kind === 'rect' && s.corners)
  const eachCorner = (on: boolean) => set(target, (now) => {
    const { corners, ...rest } = now.shape as Record<string, unknown>
    const r = (rest.cornerRadius as number | undefined) ?? 0
    return { shape: on ? { ...rest, corners: [r, r, r, r] } : { ...rest, cornerRadius: (corners as number[] | undefined)?.[0] ?? r } }
  })
  const setCorner = (i: number, to: (r: number) => number) => setShape((now) => {
    const corners = [...((now.corners as number[] | undefined) ?? [0, 0, 0, 0])]
    corners[i] = tidy(Math.max(0, to(corners[i] ?? 0)))
    return { corners }
  })
  return (
    <Card id="shape-card" title={p.shapeKinds[kind]} note={target.names.join(', ')}>
      {look}
      {kind === 'line'
        ? (
          <div className="grid grid-cols-2 gap-x-3">
            {(['start', 'end'] as const).map((end) => (
              <Choice
                key={end}
                name={p.lineEnd[end]}
                value={value(end) as LineEnd | 'mixed' | undefined}
                options={LineEnd.options}
                labels={p.lineEnds}
                onSet={(v) => setShape(() => ({ [end]: v }))}
              />
            ))}
          </div>
        )
        : (
          <>
            <div className={cn(KNOBS, 'empty:hidden')}>
              {kind === 'polygon' && knob('sides', p.sides, { min: 3, max: 24 })}
              {kind === 'star' && knob('points', p.points, { min: 3, max: 24 })}
              {kind === 'star' && knob('innerRadius', p.innerRadius, { min: 0.05, max: 0.95, scale: 100, unit: '%', whole: false })}
              {!each && knob('cornerRadius', p.cornerRadius, { min: 0, max: 200 })}
            </div>
            <div dir="ltr" className={cn(KNOBS, 'empty:hidden')}>
              {each && CORNER_FIELDS.map((i) => CORNERS[i]).map((corner, n) => {
                const i = CORNER_FIELDS[n] ?? 0
                return (
                  <NumberField
                    key={corner}
                    label={p.cornersShort[corner]}
                    name={p.corners[corner]}
                    value={shared(shapes.map((s) => (s.kind === 'rect' ? s.corners?.[i] : undefined)))}
                    min={0}
                    editor={target.editor}
                    onSet={(v) => setCorner(i, () => v)}
                    onShift={(by) => setCorner(i, (r) => r + by)}
                  />
                )
              })}
            </div>
          </>
        )}
      {kind === 'rect' && (
        <label className="flex items-center gap-2 text-[12px]">
          <DocCheckbox name="each-corner" checked={each} onSet={eachCorner} />
          {p.eachCorner}
        </label>
      )}
    </Card>
  )
}

/** A list of paints, strokes or effects that every selected layer has the same of, or a way to make it so. */
function ListCard<T>({ id, title, p, target, field, fresh, onTop = fresh, topFirst = false, render }: {
  /** What + adds over a list that has items already; `fresh` starts an empty one. */
  onTop?: T
  /** The last item, drawn on top, shows first, and rows can be reordered. */
  topFirst?: boolean
  id: string
  title: string
  p: P
  target: Target
  field: string
  fresh: T
  /** `n` is the row's place as shown, from 1; `change` takes the item as the document holds it when the change is made, not as last drawn. */
  render: (item: T, n: number, change: (to: (now: T) => T) => void) => ReactNode
}) {
  const lists = target.props.map((pr) => (pr[field] ?? []) as T[])
  const list = shared(lists)
  const write = (to: (now: T[]) => T[]) => set(target, (now) => ({ [field]: to((now[field] ?? []) as T[]) }))
  return (
    <Card
      id={id}
      title={title}
      action={<AddButton label={format(p.add, { name: title.toLowerCase() })} onClick={() => write((now) => (list === 'mixed' && !topFirst ? [fresh] : [...now, now.length === 0 ? fresh : onTop]))} />}
    >
      {list === 'mixed'
        ? (
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            {p.mixedList}
            <button type="button" onClick={() => write(() => [fresh])} className="cursor-pointer font-medium text-accent-text hover:underline">{p.useOne}</button>
          </div>
        )
        : <Stack items={list} field={field} topFirst={topFirst} removeLabel={(n) => format(p.remove, { name: title.toLowerCase(), n })} onWrite={write} render={render} />}
    </Card>
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

type Style = Record<string, unknown> & { fontSize: number; color: string; letterSpacing?: number; lineHeight?: number; textCase?: string }

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

/** The lines and letters of the text: line height (Auto when cleared) and letter spacing. */
function TextCard({ target, p }: { target: Target; p: P }) {
  const { style, setStyle, shiftStyle } = textStyle(target)
  return (
    <Card id="text-card" title={p.textNumbers}>
      <div className={KNOBS}>
        <NumberField
          label="↕"
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
        <NumberField label="↔" name={p.letterSpacing} value={(style('letterSpacing') ?? 0) as number | 'mixed'} step={0.1} editor={target.editor} onSet={(v) => setStyle('letterSpacing', v)} onShift={(by) => shiftStyle('letterSpacing', by)} />
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

/** A row of choices of which one is on, as pressed buttons. */
function Pick<T extends string>({ name, value, options, labels, onSet }: { name: string; value: T | 'mixed'; options: readonly T[]; labels: Record<T, ReactNode>; onSet: (to: T) => void }) {
  return (
    <div role="group" aria-label={name} className={SEGMENTS}>
      {options.map((option) => (
        <button key={option} type="button" aria-pressed={value === option} data-value={option} onClick={() => onSet(option)} className={SEGMENT}>
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

/** The bar's align popover for text: alignment, case, lists, underline and strikethrough. */
export function TextAlignBody({ target, p }: { target: Target; p: P }) {
  const { style, setStyle } = textStyle(target)
  const flag = (key: string) => {
    const on = style(key)
    return on === 'mixed' ? 'mixed' : on === true
  }
  return (
    <div className="flex w-80 flex-col gap-2.5 p-1">
      <Pick name={p.textAlign} value={shared(target.props.map((pr) => (pr.align ?? 'start') as 'start' | 'center' | 'end' | 'justify'))} options={['start', 'center', 'end', 'justify'] as const} labels={p.textAligns} onSet={(align) => set(target, () => ({ align }))} />
      <Pick name={p.textCase} value={(style('textCase') ?? 'none') as 'none' | 'upper' | 'lower' | 'title' | 'mixed'} options={['none', 'upper', 'lower', 'title'] as const} labels={{ none: 'Ab', upper: 'AB', lower: 'ab', title: 'Aa' }} onSet={(v) => setStyle('textCase', v)} />
      <Pick name={p.list} value={shared(target.props.map((pr) => (pr.list ?? 'none') as 'none' | 'bullet' | 'number'))} options={['none', 'bullet', 'number'] as const} labels={p.lists} onSet={(list) => set(target, () => ({ list: list === 'none' ? undefined : list }))} />
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

/** The text's box and paragraphs: how the box sizes, lines shown at most, shrinking to fit, and paragraph spacing. */
function ParagraphCard({ target, p }: { target: Target; p: P }) {
  const value = (key: string) => shared(target.props.map((pr) => pr[key])) as unknown
  const shrink = value('shrinkToFit') as { min: number; max: number } | undefined | 'mixed'
  return (
    <Card id="paragraph-card" title={p.paragraph}>
      <div className={KNOBS}>
        <Choice name={p.boxMode} value={value('boxMode') as BoxMode | 'mixed' | undefined ?? 'autoHeight'} options={['autoWidth', 'autoHeight', 'fixed'] as const} labels={p.boxModes} onSet={(boxMode) => set(target, () => ({ boxMode }))} />
        <NumberField
          label="≡"
          name={p.maxLines}
          value={value('maxLines') as number | 'mixed' | undefined}
          min={0}
          placeholder={p.noLimit}
          editor={target.editor}
          // 0 lifts the limit.
          onSet={(v) => set(target, () => ({ maxLines: Math.round(v) >= 1 ? Math.round(v) : undefined }))}
          onShift={(by) => set(target, (now) => {
            const next = Math.round(((now.maxLines as number | undefined) ?? 0) + by)
            return { maxLines: next >= 1 ? next : undefined }
          })}
        />
        <NumberField
          label="¶"
          name={p.paragraphSpacing}
          value={(value('paragraphSpacing') ?? 0) as number | 'mixed'}
          min={0}
          editor={target.editor}
          onSet={(v) => set(target, () => ({ paragraphSpacing: v }))}
          onShift={(by) => set(target, (now) => ({ paragraphSpacing: tidy(clamp(((now.paragraphSpacing as number | undefined) ?? 0) + by, 0)) }))}
        />
      </div>
      <Toggles
        items={[
          { name: p.shrinkToFit, label: p.shrinkToFitShort, on: shrink === 'mixed' ? 'mixed' : shrink !== undefined, onSet: (on) => set(target, (now) => {
            const size = (now.style as Style).fontSize
            return { shrinkToFit: on ? { min: tidy(Math.max(1, size / 2)), max: size } : undefined }
          }) },
        ]}
      />
      {shrink !== undefined && shrink !== 'mixed' && (
        <div className={KNOBS}>
          {(['min', 'max'] as const).map((end) => (
            <NumberField
              key={end}
              label={end === 'min' ? '↓' : '↑'}
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
        </div>
      )}
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

/**
 * An image fill's own settings (#154): its filter as tiles of the picture itself, how it fits the
 * layer, and under them its opacity and adjustments (exposure, contrast, saturation, temperature,
 * tint). It acts on the first image fill the selected layers share.
 */
function ImageCard({ target, p, brandId, index, paint }: { target: Target; p: P; brandId: string; index: number; paint: ImageFill }) {
  const setPaint = (change: (now: ImageFill) => Partial<ImageFill>) => set(target, (now) => {
    const fills = (now.fills ?? []) as Paint[]
    const at = fills[index]
    if (at?.type !== 'image') return null
    return { fills: fills.map((f, i) => (i === index ? { ...at, ...change(at) } : f)) }
  })
  const setAdjust = (key: keyof ImageAdjust, to: (n: number) => number) => setPaint((now) => {
    const adjust = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, ...now.adjust }
    return { adjust: { ...adjust, [key]: Math.round(clamp(to(adjust[key]), -100, 100)) } }
  })
  const picture = `/brands/${encodeURIComponent(brandId)}/assets/${encodeURIComponent(paint.assetId)}/thumbnail`
  const filter = paint.filter ?? 'none'
  return (
    <section aria-labelledby="image-card-title" className={CARD} data-testid="image-card">
      <CardHeader id="image-card-title" title={p.image} note={target.names.join(', ')}>
        <ImagePickerButton
          brandId={brandId}
          title={p.replaceImageTitle}
          testId="replace-image"
          className={cn(CHIP, FOCUS_RING, 'shrink-0')}
          onPick={(asset) => set(target, (now) => ({ fills: withImage((now.fills ?? []) as Paint[], asset.id) }))}
        >
          <ArrowsClockwiseIcon size={12} aria-hidden />
          <span aria-hidden>{p.replaceImage}</span>
        </ImagePickerButton>
      </CardHeader>
      <div className="flex flex-col gap-3 px-[18px] pb-3">
        <div role="radiogroup" aria-label={p.filter} className="grid grid-cols-4 gap-1.5">
          {ImageFilter.options.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={filter === name}
              onClick={() => setPaint(() => ({ filter: name === 'none' ? undefined : name }))}
              className="group flex min-w-0 cursor-pointer flex-col items-center gap-1 text-[10px] font-semibold text-muted aria-checked:text-text"
            >
              <span className="block aspect-square w-full overflow-hidden rounded-[8px] border border-line group-aria-checked:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]">
                <img src={picture} alt="" draggable={false} loading="lazy" style={{ filter: FILTER_LOOK[name] }} className="size-full object-cover" />
              </span>
              <span className="w-full truncate text-center">{p.filters[name]}</span>
            </button>
          ))}
        </div>
        <Choice name={p.fit} value={paint.fit} options={['fill', 'fit', 'crop', 'tile'] as const} labels={p.fits} onSet={(fit) => setPaint(() => ({ fit }))} />
      </div>
      <div className={cn(KNOBS, CARD_LOWER)}>
          <NumberField
            label={p.opacity}
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
          {ADJUSTMENTS.map((key) => (
            <NumberField
              key={key}
              label={p.adjustShort[key]}
              name={p.adjust[key]}
              value={paint.adjust?.[key] ?? 0}
              min={-100}
              max={100}
              editor={target.editor}
              onSet={(v) => setAdjust(key, () => v)}
              onShift={(by) => setAdjust(key, (n) => n + by)}
            />
          ))}
        </div>
    </section>
  )
}

type Layout = { direction: 'row' | 'column'; gap: number; padding: Record<'top' | 'right' | 'bottom' | 'left', number>; justify: string; align: string; wrap: boolean; lineGap: number }

function AutoLayoutCard({ target, p }: { target: Target; p: P }) {
  const layouts = target.props.map((pr) => pr.layout as Layout | undefined)
  if (layouts.some((l) => !l)) {
    return (
      <Card id="auto-layout-card" title={p.autoLayout}>
        <button type="button" onClick={() => target.editor.perform('autoLayout')} className="h-8 cursor-pointer rounded-row border border-line text-[12px] font-medium hover:bg-hover">
          {p.addAutoLayout}
        </button>
      </Card>
    )
  }
  const value = (key: keyof Layout) => shared(layouts.map((l) => l?.[key]))
  const setLayout = (change: (l: Layout) => Partial<Layout>) => set(target, (now) => {
    const l = now.layout as Layout
    return { layout: { ...l, ...change(l) } }
  })
  return (
    <Card id="auto-layout-card" title={p.autoLayout}>
      <div className={KNOBS}>
        <Choice name={p.direction} value={value('direction') as Layout['direction'] | 'mixed'} options={['row', 'column'] as const} labels={p.directions} onSet={(direction) => setLayout(() => ({ direction }))} />
        <NumberField label="↔" name={p.gap} value={value('gap') as number | 'mixed'} editor={target.editor} onSet={(gap) => setLayout(() => ({ gap }))} onShift={(by) => setLayout((l) => ({ gap: tidy(l.gap + by) }))} />
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
        <Choice name={p.justify} value={value('justify') as string} options={['start', 'center', 'end', 'space-between']} labels={p.justifies} onSet={(justify) => setLayout(() => ({ justify }))} />
        <Choice name={p.alignItems} value={value('align') as string} options={['start', 'center', 'end']} labels={p.alignItemsOptions} onSet={(align) => setLayout(() => ({ align }))} />
      </div>
      <label className="flex items-center gap-2 text-[12px]">
        <DocCheckbox name="wrap" checked={value('wrap') === true} onSet={(wrap) => setLayout(() => ({ wrap }))} />
        {p.wrap}
      </label>
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

/**
 * How layers size and sit in an auto layout (#155): fixed, hugging what they hold or filling the
 * room on each axis, and, for children of an auto layout frame, kept out of the flow where they
 * are put.
 */
function FlowCard({ target, p, inFlow }: { target: Target; p: P; inFlow: boolean }) {
  const sizings = target.props.map((pr, i) => sizingOf(target.types[i] ?? '', pr))
  return (
    <Card id="flow-card" title={inFlow ? p.inAutoLayout : p.sizing}>
      <div className="grid grid-cols-2 gap-x-3">
        {(['width', 'height'] as const).map((axis) => (
          <Choice
            key={axis}
            name={p.sizingAxis[axis]}
            value={shared(sizings.map((s) => s[axis]))}
            options={['fixed', 'hug', 'fill'] as const}
            labels={p.sizings}
            onSet={(to) => set(target, (now, i) => ({ sizing: { ...sizingOf(target.types[i] ?? '', now), [axis]: to } }))}
          />
        ))}
      </div>
      {inFlow && (
        <label className="flex items-center gap-2 text-[12px]">
          <DocCheckbox
            name="absolute"
            checked={target.props.every((pr) => pr.absolute === true)}
            onSet={(absolute) => set(target, () => ({ absolute: absolute ? true : undefined }))}
          />
          {p.absolute}
        </label>
      )}
    </Card>
  )
}

type OwnGroup = keyof P['ownGroups']
/** Which card's words name a property a format can have of its own. */
const OWN_GROUP: Record<string, OwnGroup> = {
  x: 'layout', y: 'layout', width: 'layout', height: 'layout', rotation: 'layout', sizing: 'layout', absolute: 'layout',
  opacity: 'appearance', blendMode: 'appearance', visible: 'appearance',
  fills: 'fill', strokes: 'stroke', effects: 'effects', shape: 'shape',
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
  // A picture goes into layers that have none; one that has a picture changes it from the Image card.
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
            className="group flex min-w-0 cursor-pointer flex-col items-center gap-1 text-[11px] font-semibold text-muted aria-pressed:text-text"
          >
            <span className="grid aspect-square w-full place-items-center rounded-[10px] border border-line bg-bg/60 transition-colors duration-[var(--chrome-fast)] group-hover:border-line-strong group-aria-pressed:border-accent">
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

/** The Effects card, for layers whose effects are not in the bar yet. */
function EffectsCard({ target, p }: { target: Target; p: P }) {
  return (
    <section aria-labelledby="effects-card-title" className={CARD} data-testid="effects-card">
      <CardHeader id="effects-card-title" title={p.effects} />
      <EffectsBody target={target} p={p} />
    </section>
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
export function SelectionCards({ editor, brandId, ids, arrange }: { editor: Editor; brandId: string; ids: string[]; arrange: ReactNode }) {
  const t = useMessages()
  const p = t.editor.props
  const everyFormat = useEveryFormat()
  // Once nothing is selected, changes go to the format shown again.
  useEffect(() => () => setEveryFormat(false), [])
  const selected = useTarget(editor, ids)
  if (!selected) return arrange
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
  // The topmost image fill, the one showing, when every selected layer has the same fills.
  const fills = shared(target.props.map((pr) => (pr.fills ?? []) as Paint[]))
  const imageIndex = fills === 'mixed' ? -1 : fills.findLastIndex((f) => f.type === 'image')
  const imageFill = fills !== 'mixed' && imageIndex >= 0 ? { index: imageIndex, paint: fills[imageIndex] as ImageFill } : null
  const ownShape = shapeKinds.size === 1 && (shapeKind === 'rect' || shapeKind === 'polygon' || shapeKind === 'star' || shapeKind === 'line') ? shapeKind : null
  const scope = Object.keys(design.formats).length > 1 && (
    <ScopeMenu everyFormat={everyFormat} onChange={setEveryFormat} size={design.formats[formatId]?.name ?? ''} p={p}>
      <OwnChanges design={design} ids={live} formatId={formatId} editor={editor} p={p} />
    </ScopeMenu>
  )
  return (
    <>
      {several && arrange}
      <HeaderCard target={target} p={p} scope={scope} />
      {/* The look, as in the mock; text has its look in the bar. */}
      {imageFill
        ? <ImageCard target={target} p={p} brandId={brandId} index={imageFill.index} paint={imageFill.paint} />
        : all('graphic', 'frame', 'boolean') && (ownShape
          ? <ShapeCard target={target} p={p} kind={ownShape} look={ownShape === 'line' ? null : <FillLook target={target} brandId={brandId} p={p} />} />
          : (
            <section aria-labelledby="fill-look-title" className={CARD} data-testid="fill-look">
              <CardHeader id="fill-look-title" title={p.fill} note={target.names.join(', ')} />
              <div className="px-[18px] pb-4"><FillLook target={target} brandId={brandId} p={p} /></div>
            </section>
          ))}
      {!all('text') && <EffectsCard target={target} p={p} />}
      {all('text') && <TextCard target={target} p={p} />}
      {all('text') && <ParagraphCard target={target} p={p} />}
      {all('graphic', 'frame', 'boolean') && (
        <ListCard<Paint>
          id="fill-card"
          title={p.fill}
          p={p}
          target={target}
          field="fills"
          fresh={NEW_FILL}
          onTop={FILL_ON_TOP}
          topFirst
          render={(paint, n, change) => <PaintRow paint={paint} name={format(p.colour, { n })} brandId={brandId} editor={editor} p={p} onSet={change} />}
        />
      )}
      {all('graphic', 'boolean') && (
        <ListCard<Stroke>
          id="stroke-card"
          title={p.stroke}
          p={p}
          target={target}
          field="strokes"
          fresh={NEW_STROKE}
          topFirst
          render={(stroke, n, change) => <StrokeRow stroke={stroke} place={n} brandId={brandId} p={p} editor={editor} onSet={change} />}
        />
      )}
      {all('frame') && <AutoLayoutCard target={target} p={p} />}
      {(inFlow || all('frame') && target.props.every((pr) => pr.layout)) && <FlowCard target={target} p={p} inFlow={inFlow} />}
      <SeeThroughCard target={target} p={p} />
    </>
  )
}
