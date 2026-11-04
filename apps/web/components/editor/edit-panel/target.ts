'use client'

// The selection as the edit panels, the pop-ups and the top bar act on it: its layers' own values,
// read as the one value they share or as mixed, and set on every layer at once. Setting a value
// gives them all the same one, and scrubbing or the arrow keys move each from its own. A change stays
// on these layers: their linked copies in other frames keep their own values. Each change is one
// undo step, and a drag on a number, however long, is one too.
import { type Editor } from '@dazbee/editor'
import { type Design, type Paint } from '@dazbee/schema'

import { useTextSelection } from '@/components/editor/editor-hooks.ts'
import { useLiveDesign } from '@/components/editor/use-live-design.ts'
import { tidy } from '@/lib/editor/size.ts'
import { type Messages } from '@/lib/i18n/index.ts'

import { clamp } from './fields.tsx'

export type Props = Readonly<Record<string, unknown>>

export type Patch = Record<string, unknown>

export type P = Messages['editor']['props']

export type Style = Record<string, unknown> & {
  fontFamily: string
  fontWeight: number
  fontSize: number
  color: string
  letterSpacing?: number
  lineHeight?: number
  textCase?: string
}

/** What the edit panels act on: the layers and their values. */
export interface Target {
  editor: Editor
  ids: string[]
  /** Each layer's own values. */
  props: Props[]
  types: string[]
  /** The layers' names, for a panel part's note. */
  names: string[]
  /** Each character's style in the selected range while that one text layer is being edited: what text styling then changes. */
  range?: Style[] | undefined
}

/** What each edit panel is given: the selection, the design it is in, and the brand whose kit and pictures it offers. */
export interface PanelProps {
  target: Target
  design: Design
  brandId: string
}

/** The sizes shrink to fit draws text between. */
export type Fit = { min: number; max: number }

export type ImageFill = Extract<Paint, { type: 'image' }>

export type ShapeKind = 'rect' | 'polygon' | 'star' | 'line'

/** Which top bar a selection gets: the kind every one of its layers is, or mixed. */
export type Kind = 'text' | 'photo' | 'shape' | 'box' | 'group' | 'mixed'

export const set = (target: Target, to: (now: Props, i: number) => Patch | null) => {
  const index = new Map(target.ids.map((id, i) => [id, i]))
  return target.editor.setProps(target.ids, (id, now) => to(now, index.get(id) ?? 0))
}

export const num = (props: Props, key: string) => props[key] as number

/** Turns a style flag on or off for the selected text, or the selected run while editing. */
export const setTextFlag = (target: Target, key: 'underline' | 'strikethrough', on: boolean) =>
  textStyle(target).setStyle(key, on)

/**
 * The selected layers as the edit panels and the bar act on them, with their own values. Null when
 * none of them is in the design.
 */
export function useTarget(editor: Editor, ids: string[]): { target: Target; design: Design } | null {
  const { design } = useLiveDesign(editor)
  const editing = useTextSelection(editor)
  const live = ids.filter((id) => design.nodes[id])
  if (live.length === 0) return null
  return {
    design,
    target: {
      editor,
      ids: live,
      props: live.map((id): Props => design.nodes[id]?.props ?? {}),
      types: live.map((id) => design.nodes[id]?.type ?? ''),
      names: live.map((id) => design.nodes[id]?.name ?? ''),
      range:
        editing && live.length === 1 && live[0] === editing.id
          ? ((editor.textSelectionStyles() as Style[] | null) ?? undefined)
          : undefined,
    },
  }
}

export function kindOf(target: Target): Kind {
  const all = (...kinds: string[]) => target.types.every((type) => kinds.includes(type))
  if (all('text')) return 'text'
  if (all('graphic', 'box', 'boolean') && imageFillOf(target)) return 'photo'
  if (all('graphic', 'boolean')) return 'shape'
  if (all('box')) return 'box'
  if (all('group', 'instance', 'lottie')) return 'group'
  return 'mixed'
}

/** What the top bar and its panels need to know of the selected layers beyond their kind. */
export function factsOf(target: Target, design: Design) {
  const shapeKinds = new Set(
    target.ids.map((id) => {
      const node = design.nodes[id]
      return node?.type === 'graphic' ? node.props.shape.kind : null
    }),
  )
  const [shapeKind] = shapeKinds
  const ownShape: ShapeKind | null =
    shapeKinds.size === 1 &&
    (shapeKind === 'rect' || shapeKind === 'polygon' || shapeKind === 'star' || shapeKind === 'line')
      ? shapeKind
      : null
  // Children of an auto layout box, every one of them.
  const inFlow = target.ids.every((id) => {
    const parent = design.nodes[design.nodes[id]?.parentId ?? '']
    return parent?.type === 'box' && parent.props.layout !== undefined
  })
  return {
    ownShape,
    inFlow,
    lines: ownShape === 'line',
    booleans: target.types.every((type) => type === 'boolean'),
    boxes: target.types.every((type) => type === 'box'),
    masks: target.props.every((pr) => Boolean(pr.mask)),
    sized: target.types.every((type) => type !== 'group' && type !== 'boolean'),
  }
}

/** The one value every layer has, or 'mixed'. */
export function shared<T>(values: T[]): T | 'mixed' {
  const [first] = values
  const same = values.every((v) => JSON.stringify(v) === JSON.stringify(first))
  return same ? (first as T) : 'mixed'
}

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
    shiftStyle: (key: string, by: number, min?: number, from = 0, max?: number) =>
      range
        ? target.editor.styleTextSelection({
            [key]: tidy(clamp(((range[0]?.[key] as number | undefined) ?? from) + by, min, max)),
          })
        : set(target, (now) =>
            styled(now, key, tidy(clamp((((now.style as Style)[key] as number | undefined) ?? from) + by, min, max))),
          ),
  }
}

/** Whether every selected text (or the selected run) has a style flag on, such as underline, or some do. */
export function textFlag(target: Target, key: 'underline' | 'strikethrough'): boolean | 'mixed' {
  const on = textStyle(target).style(key)
  return on === 'mixed' ? 'mixed' : on === true
}

/** The topmost image fill, the one showing, when every selected layer has the same fills; null otherwise. */
export function imageFillOf(target: Target): { index: number; paint: ImageFill } | null {
  const fills = shared(target.props.map((pr) => (pr.fills ?? []) as Paint[]))
  const index = fills === 'mixed' ? -1 : fills.findLastIndex((f) => f.type === 'image')
  return fills !== 'mixed' && index >= 0 ? { index, paint: fills[index] as ImageFill } : null
}

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
