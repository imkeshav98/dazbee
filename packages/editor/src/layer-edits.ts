// What the edit panel and the layers panel change on layers, each as one undo step: properties in
// one format or every one, the font, a reset to what every format has, the name, the lock, hiding
// and the place in the layer tree.
import { descendants, mergedProps, type Session } from '@dazbee/doc'
import { type BindingTarget, boundFillIndex, formatScope, isContainer, LOCK_FLAGS } from '@dazbee/schema'

import type { EditorActions } from './actions.ts'
import { scope } from './canvas/grid.ts'
import type { EditorView } from './canvas/view.ts'
import { hug as hugIn } from './layers/hug.ts'
import { round } from './layers/transform.ts'
import type { EditorResources } from './resources.ts'
import { runQuietly } from './run-quietly.ts'
import type { EditorSelection } from './selection.ts'
import type { EditorTyping } from './text/typing.ts'

export interface LayerEditsDeps {
  session: Session
  view: Pick<EditorView, 'defaultFrame'>
  selection: Pick<EditorSelection, 'current'>
  resources: Pick<EditorResources, 'loadFamilies'>
  typing: Pick<EditorTyping, 'fitText' | 'selectedText' | 'styleRange'>
  actions: Pick<EditorActions, 'hideInEveryFormat'>
  /** Aborted once the editor is destroyed: a font that arrives after that is not set. */
  signal: AbortSignal
}

/** What the `Editor`'s members of the same names do. */
export interface EditorLayerEdits {
  moveLayer(id: string, parentId: string, before?: string): boolean
  setProps(
    ids: string[],
    to: (id: string, now: Readonly<Record<string, unknown>>) => Record<string, unknown> | null,
    everyFormat: boolean,
    pageId?: string,
    formatId?: string,
  ): boolean
  renameLayer(id: string, name: string): boolean
  setLocked(ids: string[], locked: boolean): boolean
  setHidden(ids: string[], hidden: boolean, pageId?: string, formatId?: string, everyFormat?: boolean): boolean
  resetOwn(ids: string[], scope: ReturnType<typeof formatScope>, paths?: string[]): boolean
  setFont(fontFamily: string, fontWeight?: number): Promise<void>
}

/** Text properties that change how big its words are, so an auto-sized box fits them again. */
const SIZES_TEXT = new Set([
  'text',
  'runs',
  'style',
  'boxMode',
  'width',
  'list',
  'paragraphSpacing',
  'maxLines',
  'shrinkToFit',
  'direction',
])

export function editorLayerEdits({
  session,
  view,
  selection,
  resources,
  typing,
  actions,
  signal,
}: LayerEditsDeps): EditorLayerEdits {
  const { defaultFrame } = view
  const hug = (ids: string[]) => hugIn(session, ids)

  function moveLayer(id: string, parentId: string, before?: string) {
    const from = session.design().nodes[id]?.parentId
    return runQuietly(() =>
      session.gesture(() => {
        session.run('node.move', { id, parentId, ...(before ? { before } : {}) })
        hug([id, ...(from && session.design().nodes[from] ? [from] : [])])
      }),
    )
  }
  function setProps(
    ids: string[],
    to: (id: string, now: Readonly<Record<string, unknown>>) => Record<string, unknown> | null,
    everyFormat: boolean,
    pageId?: string,
    formatId?: string,
  ) {
    const frame = defaultFrame(pageId, formatId)
    const here = scope(frame)
    return runQuietly(() =>
      session.gesture(() => {
        const now = session.design()
        const placedProps = (id: string) => mergedProps(now, here, id)
        const writes = new Map<string, Record<string, unknown>>()
        for (const id of ids) {
          const node = now.nodes[id]
          if (!node) continue
          const at = placedProps(id)
          // Values a change leaves as they are aren't written, so they make no undo step.
          const asked = to(id, at)
          const patch =
            asked &&
            Object.fromEntries(
              Object.entries(asked).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(at[key])),
            )
          if (!patch || Object.keys(patch).length === 0) continue
          writes.set(id, { ...writes.get(id), ...patch })
          if (!isContainer(node.type) || !('x' in patch || 'y' in patch)) continue
          const dx = 'x' in patch ? Number(patch.x) - Number(at.x) : 0
          const dy = 'y' in patch ? Number(patch.y) - Number(at.y) : 0
          for (const inner of descendants(now, id)) {
            if (ids.includes(inner)) continue
            const was = placedProps(inner)
            writes.set(inner, { ...writes.get(inner), x: round(Number(was.x) + dx), y: round(Number(was.y) + dy) })
          }
        }
        for (const [id, patch] of writes) {
          const node = session.design().nodes[id]
          const at = placedProps(id)
          const style = patch.style as { color?: string; fontFamily?: string } | undefined
          const was = at.style as { color?: string; fontFamily?: string } | undefined
          const unbind: BindingTarget[] = [
            ...(node?.bindings?.fill && 'fills' in patch && !sameTopSolid(patch.fills, at.fills)
              ? ['fill' as const]
              : []),
            ...(node?.bindings?.textColor && style && style.color !== was?.color ? ['textColor' as const] : []),
            ...(node?.bindings?.fontFamily && style && style.fontFamily !== was?.fontFamily
              ? ['fontFamily' as const]
              : []),
          ]
          for (const target of unbind) session.run('node.bind', { ids: [id], target, ref: null })
          if (!everyFormat) {
            session.run('node.update', { ids: [id], scope: here, patch })
            continue
          }
          session.run('node.update', { ids: [id], scope: 'base', patch })
          for (const [other, byNode] of Object.entries(session.design().overrides)) {
            const paths = Object.keys(patch).filter((path) => byNode[id] && path in byNode[id])
            if (paths.length > 0) session.run('override.reset', { ids: [id], scope: other, paths })
          }
        }
        // Text that grows the size of its words fits them again, in the formats the change reached.
        for (const [id, patch] of writes) {
          if (Object.keys(patch).some((key) => SIZES_TEXT.has(key)))
            typing.fitText(id, everyFormat ? undefined : frame.formatId)
        }
        hug([...writes.keys()])
      }),
    )
  }
  const renameLayer = (id: string, name: string) => runQuietly(() => session.run('node.rename', { id, name }))
  const setLocked = (ids: string[], locked: boolean) =>
    runQuietly(() =>
      session.run('node.lock', { ids, lock: Object.fromEntries(LOCK_FLAGS.map((flag) => [flag, locked])) }),
    )
  function setHidden(ids: string[], hidden: boolean, pageId?: string, formatId?: string, everyFormat = false) {
    if (everyFormat) return actions.hideInEveryFormat(ids, hidden)
    const frame = defaultFrame(pageId, formatId)
    return runQuietly(() => session.run('node.update', { ids, scope: scope(frame), patch: { visible: !hidden } }))
  }
  function resetOwn(ids: string[], scope: ReturnType<typeof formatScope>, paths?: string[]) {
    return runQuietly(() =>
      session.gesture(() => {
        session.run('override.reset', { ids, scope, ...(paths ? { paths } : {}) })
        for (const id of ids) typing.fitText(id, scope.slice('format:'.length))
      }),
    )
  }
  async function setFont(fontFamily: string, fontWeight?: number) {
    const ids = (selection.current()?.ids ?? []).filter((id) => session.design().nodes[id]?.type === 'text')
    const range = typing.selectedText()
    if (ids.length === 0 && !range) return
    await resources.loadFamilies([fontFamily])[0]
    if (signal.aborted) return
    if (range) {
      const node = session.design().nodes[range.id]
      if (node?.type === 'text' && range.range.end <= node.props.text.length)
        typing.styleRange(range, { fontFamily, ...(fontWeight === undefined ? {} : { fontWeight }) })
      return
    }
    const current = session.design()
    session.gesture(() => {
      for (const id of ids) {
        const node = current.nodes[id]
        if (node?.type !== 'text') continue
        // A font picked by hand no longer follows the brand's (#53).
        if (node.bindings?.fontFamily)
          runQuietly(() => session.run('node.bind', { ids: [id], target: 'fontFamily', ref: null }))
        const style = { ...node.props.style, fontFamily, ...(fontWeight === undefined ? {} : { fontWeight }) }
        runQuietly(() => session.run('node.update', { ids: [id], patch: { style } }))
        typing.fitText(id)
      }
    })
  }

  return {
    moveLayer,
    setProps,
    renameLayer,
    setLocked,
    setHidden,
    resetOwn,
    setFont,
  }
}

/**
 * Whether two fill lists have the same topmost solid fill: the one a brand colour binding colours,
 * so a change that leaves it be (an image added or swapped) keeps the binding.
 */
function sameTopSolid(a: unknown, b: unknown) {
  const top = (fills: unknown) => (Array.isArray(fills) ? fills[boundFillIndex(fills)] : undefined)
  return JSON.stringify(top(a)) === JSON.stringify(top(b))
}
