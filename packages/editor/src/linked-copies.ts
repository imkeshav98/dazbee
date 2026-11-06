// Copy style and Paste style, and the full menu's actions on the selected layers' linked copies
// (ADR-0014): Copy to other frames ▸ Style, Text and Layer, and lock, hide and delete in all frames.
// Each finds the copies by link id on the selection's page and is one undo step. What each would do
// for a selection, or why it has nothing to do, is `linkedMenu`, which the menus grey their items by.
import { copiesOf, descendants, framesWithout, linkedFrames, type Session } from '@dazbee/doc'
import {
  type Design,
  frameIdOf,
  type Layer,
  type LayerStyle,
  type LayerType,
  LOCK_FLAGS,
  restyle,
  styleOf,
  type TextRun,
} from '@dazbee/schema'

import { keepStyle, rememberedStyle } from './clipboard.ts'
import { hug as hugIn } from './layers/hug.ts'
import { round } from './layers/transform.ts'
import type { EditorResources } from './resources.ts'
import { runQuietly } from './run-quietly.ts'
import { type EditorSelection, idsOf } from './selection.ts'
import type { ShortcutAction } from './shortcuts.ts'
import type { EditorTyping } from './text/typing.ts'

/** The actions this module does. */
export const LINKED_ACTIONS = [
  'copyStyle',
  'pasteStyle',
  'styleToLinked',
  'textToLinked',
  'layerToLinked',
  'lockLinked',
  'hideLinked',
  'deleteLinked',
] as const satisfies readonly ShortcutAction[]
export type LinkedAction = (typeof LINKED_ACTIONS)[number]

/**
 * What each item of the full menu would do for a selection: `ready` when it has something to do,
 * else the reason it has nothing to do, or `hidden` for an item that never applies to it.
 */
export interface LinkedMenu {
  /** How many frames of the page are linked to the selection's frame. */
  frames: number
  /**
   * How many frames Copy to other frames reaches: the linked frames holding a copy of a selected
   * layer, which Style and Text write into, or every linked frame when none holds one, as Layer
   * copies into.
   */
  reach: number
  /** Copy style takes one layer's style. */
  copyStyle: 'ready' | 'several'
  /**
   * Paste style: nothing copied yet, every layer has the style, the ones that lack it are
   * style-locked, or the style is a text's or a shape's and no selected layer is that kind.
   */
  pasteStyle:
    | 'ready'
    | 'nothingCopied'
    | 'hasStyle'
    | 'styleLocked'
    | 'textStyleOnShape'
    | 'textStyleOnBox'
    | 'textStyleOnGroup'
    | 'textStyleOnLayers'
    | 'shapeStyleOnText'
    | 'shapeStyleOnGroup'
    | 'shapeStyleOnLayers'
  /** Copy to other frames ▸ Style: no linked copies, every copy has it, or the ones that lack it are locked. */
  style: 'ready' | 'noCopies' | 'copiesHaveStyle' | 'copiesLocked'
  /** Copy to other frames ▸ Text, for text layers only. */
  text: 'ready' | 'hidden' | 'noCopies' | 'copiesHaveText' | 'copiesLocked'
  /** Copy to other frames ▸ Layer: no frame is linked, or every linked frame has a copy. */
  layer: 'ready' | 'noFrames' | 'everyFrame'
  /** Lock in all frames, or Unlock once the layers and every copy are locked. */
  lock: 'lock' | 'unlock'
  /** Hide in all frames, or Show once the layers and every copy are hidden. */
  hide: 'hide' | 'show'
  /**
   * Delete from all frames, which the small menu's Delete greys by too: a selected layer, or one
   * inside it, is locked against deleting, here only or in every frame.
   */
  delete: 'ready' | 'selectionLocked' | 'deleteLocked'
}

export interface LinkedCopiesDeps {
  session: Session
  selection: Pick<EditorSelection, 'current' | 'select'>
  typing: Pick<EditorTyping, 'fitText'>
  resources: Pick<EditorResources, 'loadFamilies'>
  /** Aborted once the editor is destroyed: a style whose font arrives after that is not pasted. */
  signal: AbortSignal
  /** Draws the overlay. */
  drawOverlay: () => void
}

export interface EditorLinkedCopies {
  /** Does a linked-copy action to the selection; false when it has nothing to do (see `menu`). */
  perform(action: LinkedAction): boolean
  /** What each linked-copy item would do for the selection now; null with nothing selected. */
  menu(): LinkedMenu | null
}

/** Why a copied text's or shape's style has nothing to do on a layer of a type that doesn't take it. */
const OFF_FOR: Record<'text' | 'shape', Partial<Record<LayerType, LinkedMenu['pasteStyle']>>> = {
  text: { graphic: 'textStyleOnShape', boolean: 'textStyleOnShape', box: 'textStyleOnBox', group: 'textStyleOnGroup' },
  shape: { text: 'shapeStyleOnText', group: 'shapeStyleOnGroup' },
}

export function editorLinkedCopies({
  session,
  selection,
  typing,
  resources,
  signal,
  drawOverlay,
}: LinkedCopiesDeps): EditorLinkedCopies {
  const hug = (ids: string[]) => hugIn(session, ids)

  function menu() {
    const ids = idsOf(selection.current())
    return ids.length === 0 ? null : linkedMenu(session.design(), ids, rememberedStyle())
  }

  function perform(action: LinkedAction): boolean {
    const current = selection.current()
    const state = menu()
    if (!current || !state) return false
    const design = session.design()
    const ids = idsOf(current).filter((id) => design.nodes[id])
    let done = false
    switch (action) {
      case 'copyStyle': {
        const [only] = ids
        done = state.copyStyle === 'ready' && only !== undefined && keepStyle(styleOf(design.nodes[only] as Layer))
        break
      }
      case 'pasteStyle': {
        const copied = rememberedStyle()
        if (state.pasteStyle !== 'ready' || !copied) return false
        done = pasteStyle(ids, copied)
        break
      }
      case 'styleToLinked':
        done = state.style === 'ready' && styleToLinked(ids)
        break
      case 'textToLinked':
        done = state.text === 'ready' && textToLinked(ids)
        break
      case 'layerToLinked':
        done = state.layer === 'ready' && layerToLinked(ids)
        break
      case 'lockLinked': {
        const lock = Object.fromEntries(LOCK_FLAGS.map((flag) => [flag, state.lock === 'lock']))
        done = runQuietly(() => session.run('node.lock', { ids: everyCopy(design, ids), lock }))
        break
      }
      case 'hideLinked': {
        const patch = { visible: state.hide === 'show' }
        done = runQuietly(() => session.run('node.update', { ids: everyCopy(design, ids), patch }))
        break
      }
      case 'deleteLinked':
        done = state.delete === 'ready' && deleteLinked(ids)
        break
    }
    drawOverlay()
    return done
  }

  /**
   * Sets a copied style on the layers that lack it, once its font is here, so text that grows with
   * its words is measured in it and fits in the same step.
   */
  function pasteStyle(ids: string[], style: LayerStyle) {
    const design = session.design()
    const targets = styleWork(design, ids, () => style)?.[0] ?? []
    const family = style.text && targets.some((id) => design.nodes[id]?.type === 'text') ? style.text.fontFamily : null
    const apply = () =>
      runQuietly(() =>
        session.gesture(() => {
          const live = targets.filter((id) => session.design().nodes[id])
          session.run('node.style', { ids: live, style })
          fitAndHug(live)
        }),
      )
    const loading = family === null ? undefined : resources.loadFamilies([family])[0]
    if (!loading) return apply()
    void loading.then(() => {
      if (!signal.aborted) apply()
    })
    return true
  }

  function styleToLinked(ids: string[]) {
    const design = session.design()
    return runQuietly(() =>
      session.gesture(() => {
        for (const id of ids) {
          const style = styleOf(design.nodes[id] as Layer)
          const copies = copiesOf(design, id).filter((copy) => {
            const node = design.nodes[copy]
            return node && !node.lock?.style && restyle(node, style) !== null
          })
          if (copies.length === 0) continue
          session.run('node.style', { ids: copies, style })
          fitAndHug(copies)
        }
      }),
    )
  }

  /** Writes each text's characters and runs into its copies that differ, replacing theirs, and fits them. */
  function textToLinked(ids: string[]) {
    const design = session.design()
    return runQuietly(() =>
      session.gesture(() => {
        for (const id of ids) {
          const source = design.nodes[id]
          if (source?.type !== 'text') continue
          for (const copy of copiesOf(design, id)) {
            const node = design.nodes[copy]
            const text = node && !textLocked(node) ? textFor(source, node) : null
            if (text) writeText(copy, node?.type === 'text' ? node.props.text.length : 0, text)
          }
          fitAndHug(copiesOf(design, id))
        }
      }),
    )
  }
  function writeText(id: string, length: number, { text, runs }: { text: string; runs: TextRun[] }) {
    if (length > 0) session.run('text.edit', { id, op: { kind: 'delete', at: 0, length } })
    if (text) session.run('text.edit', { id, op: { kind: 'insert', at: 0, text } })
    for (const run of runs)
      session.run('text.edit', {
        id,
        op: { kind: 'style', at: run.start, length: run.end - run.start, style: run.style },
      })
  }

  function layerToLinked(ids: string[]) {
    return runQuietly(() =>
      session.gesture(() => {
        const copies = session.run('node.copyToFrames', { ids })
        const now = session.design()
        for (const id of copies.flatMap((copy) => [copy, ...descendants(now, copy)]))
          if (now.nodes[id]?.type === 'text') typing.fitText(id)
        hug(copies)
      }),
    )
  }

  function deleteLinked(ids: string[]) {
    const design = session.design()
    const doomed = deletable(design, everyCopy(design, ids))
    const parents = doomed.map((id) => design.nodes[id]?.parentId ?? '').filter((id) => design.nodes[id])
    const done = runQuietly(() =>
      session.gesture(() => {
        session.run('node.delete', { ids: doomed })
        hug(parents)
      }),
    )
    if (done) selection.select([], null)
    return done
  }

  /** Text that changed fits its words again, and groups fit what they hold. */
  function fitAndHug(ids: string[]) {
    for (const id of ids) if (session.design().nodes[id]?.type === 'text') typing.fitText(id)
    hug(ids)
  }

  return { perform, menu }
}

/** What each linked-copy item would do for these layers, with `copied` the style Copy style last took. */
export function linkedMenu(design: Design, ids: readonly string[], copied: LayerStyle | null): LinkedMenu {
  const live = ids.filter((id) => design.nodes[id])
  const frameId = live[0] === undefined ? undefined : frameIdOf(design, live[0])
  const frames = frameId === undefined ? 0 : linkedFrames(design, frameId).length
  const holding = new Set(live.flatMap((id) => copiesOf(design, id).map((copy) => frameIdOf(design, copy))))
  const targets = everyCopy(design, live)
  return {
    frames,
    reach: holding.size > 0 ? holding.size : frames,
    copyStyle: live.length === 1 ? 'ready' : 'several',
    pasteStyle: copied ? pasteReadiness(design, live, copied) : 'nothingCopied',
    style: copiesReadiness(styleWork(design, copiesFor(design, live), styleFrom(design))),
    text: live.every((id) => design.nodes[id]?.type === 'text') ? textReadiness(design, live) : 'hidden',
    layer: frames === 0 ? 'noFrames' : live.some((id) => framesWithout(design, id).length > 0) ? 'ready' : 'everyFrame',
    lock: targets.every((id) => LOCK_FLAGS.every((flag) => design.nodes[id]?.lock?.[flag])) ? 'unlock' : 'lock',
    hide: targets.every((id) => design.nodes[id]?.props.visible === false) ? 'show' : 'hide',
    delete: deleteReadiness(design, live, targets),
  }
}

/** The layers and each one's linked copies on its page. */
function everyCopy(design: Design, ids: readonly string[]) {
  return [...new Set(ids.flatMap((id) => [id, ...copiesOf(design, id)]))]
}

/**
 * The layers a style would change, split by whether their style is locked: `[free, locked]`, or
 * null when there are none to look at. Takes the layers themselves, or `[source, copies]` pairs.
 */
function styleWork(
  design: Design,
  of: readonly string[] | readonly [string, string[]][],
  styleFor: (source: string) => LayerStyle,
): [string[], string[]] | null {
  const pairs: [string, string[]][] = of.map((entry) => (typeof entry === 'string' ? [entry, [entry]] : entry))
  if (pairs.every(([, targets]) => targets.length === 0)) return null
  const free: string[] = []
  const locked: string[] = []
  for (const [source, targets] of pairs) {
    const style = styleFor(source)
    for (const id of targets) {
      const node = design.nodes[id]
      if (!node || restyle(node, style) === null) continue
      if (node.lock?.style) locked.push(id)
      else free.push(id)
    }
  }
  return [free, locked]
}

/** A text copy's characters and runs are its own to change only while its content and style are unlocked. */
function textLocked(node: Layer) {
  return Boolean(node.lock?.content || node.lock?.style)
}

/**
 * The characters and runs a text copy takes from its source, each run's font size scaled by the
 * copy's base size over the source's; null when the copy has them already, or isn't text.
 */
function textFor(source: Layer, copy: Layer): { text: string; runs: TextRun[] } | null {
  if (source.type !== 'text' || copy.type !== 'text') return null
  const scale = copy.props.style.fontSize / source.props.style.fontSize
  const runs = source.props.runs.map((run) =>
    run.style.fontSize === undefined
      ? run
      : { ...run, style: { ...run.style, fontSize: Math.max(0.01, round(run.style.fontSize * scale)) } },
  )
  const same = copy.props.text === source.props.text && runsKey(copy.props.runs) === runsKey(runs)
  return same ? null : { text: source.props.text, runs }
}

/** The layers Delete may take: none of them, nor anything inside them, is locked against deleting. */
function deletable(design: Design, ids: readonly string[]) {
  return ids.filter((id) => [id, ...descendants(design, id)].every((inner) => !design.nodes[inner]?.lock?.delete))
}

/**
 * Paste style for these layers: ready when some layer has work that isn't locked, else why not;
 * a style none of them takes, such as a text's on a shape, says so.
 */
function pasteReadiness(design: Design, ids: readonly string[], style: LayerStyle): LinkedMenu['pasteStyle'] {
  const [free, locked] = styleWork(design, ids, () => style) ?? [[], []]
  if (free.length > 0) return 'ready'
  if (locked.length > 0) return 'styleLocked'
  return ids.some((id) => takes(design.nodes[id], style)) ? 'hasStyle' : styleOff(design, ids, style)
}

/** The linked copies of each layer, as the layer and its copies. */
function copiesFor(design: Design, ids: readonly string[]): [string, string[]][] {
  return ids.map((id) => [id, copiesOf(design, id)])
}

/** The style each source gives its copies: its own. */
function styleFrom(design: Design) {
  return (id: string) => styleOf(design.nodes[id] as Layer)
}

/** Copy to other frames ▸ Style: ready when some copy has work that isn't locked, else why not. */
function copiesReadiness(work: [string[], string[]] | null): LinkedMenu['style'] {
  if (!work) return 'noCopies'
  const [free, locked] = work
  if (free.length > 0) return 'ready'
  return locked.length > 0 ? 'copiesLocked' : 'copiesHaveStyle'
}

/** Copy to other frames ▸ Text for text layers: ready, or why not. */
function textReadiness(design: Design, ids: readonly string[]): LinkedMenu['text'] {
  let copies = 0
  let locked = 0
  for (const id of ids) {
    const source = design.nodes[id]
    if (source?.type !== 'text') continue
    for (const copy of copiesOf(design, id)) {
      const node = design.nodes[copy]
      if (!node) continue
      copies++
      if (!textFor(source, node)) continue
      if (!textLocked(node)) return 'ready'
      locked++
    }
  }
  if (copies === 0) return 'noCopies'
  return locked > 0 ? 'copiesLocked' : 'copiesHaveText'
}

/**
 * Delete from all frames for these layers and `targets`, them with their copies: ready while no
 * selected layer is locked against deleting; else locked in every frame when they have copies and
 * every copy is locked too, or locked here.
 */
function deleteReadiness(design: Design, ids: readonly string[], targets: readonly string[]): LinkedMenu['delete'] {
  if (deletable(design, ids).length === ids.length) return 'ready'
  return targets.length > ids.length && deletable(design, targets).length === 0 ? 'deleteLocked' : 'selectionLocked'
}

/** Runs as text that two equal lists of runs share, whatever order their style keys are in. */
function runsKey(runs: readonly TextRun[]) {
  return JSON.stringify(runs.map((run) => [run.start, run.end, Object.entries(run.style).sort()]))
}

/** Whether a layer takes what a style is for: a text's look on a text, fills where it has fills. */
function takes(layer: Layer | undefined, style: LayerStyle) {
  if (!layer) return false
  if (style.text) return layer.type === 'text'
  return style.fills === undefined || 'fills' in layer.props
}

/** Why a text's or a shape's style has nothing to do on layers none of which takes it, by their kind. */
function styleOff(design: Design, ids: readonly string[], style: LayerStyle): LinkedMenu['pasteStyle'] {
  const kind = style.text ? 'text' : 'shape'
  const why = new Set(ids.map((id) => OFF_FOR[kind][design.nodes[id]?.type ?? 'group']))
  const [only] = why
  return why.size === 1 && only ? only : kind === 'text' ? 'textStyleOnLayers' : 'shapeStyleOnLayers'
}
