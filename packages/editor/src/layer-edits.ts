// What the edit panel and the layers panel change on layers, each as one undo step: their
// properties, the font, the name, the lock, hiding and the place in the layer tree. Each change
// stays on the layers given; their linked copies in other frames keep their own values.
import { descendants, type Session } from '@dazbee/doc'
import { type BindingTarget, boundFillIndex, isContainer, LOCK_FLAGS } from '@dazbee/schema'

import { hug as hugIn } from './layers/hug.ts'
import { round } from './layers/transform.ts'
import type { EditorResources } from './resources.ts'
import { runQuietly } from './run-quietly.ts'
import { type EditorSelection, idsOf } from './selection.ts'
import type { EditorTyping } from './text/typing.ts'

export interface LayerEditsDeps {
  session: Session
  selection: Pick<EditorSelection, 'current'>
  resources: Pick<EditorResources, 'loadFamilies'>
  typing: Pick<EditorTyping, 'fitText' | 'selectedText' | 'styleRange'>
  /** Aborted once the editor is destroyed: a font that arrives after that is not set. */
  signal: AbortSignal
}

/** What the `Editor`'s members of the same names do. */
export interface EditorLayerEdits {
  moveLayer(id: string, parentId: string, before?: string): boolean
  setProps(
    ids: string[],
    to: (id: string, props: Readonly<Record<string, unknown>>) => Record<string, unknown> | null,
  ): boolean
  renameLayer(id: string, name: string): boolean
  setLocked(ids: string[], locked: boolean): boolean
  setHidden(ids: string[], hidden: boolean): boolean
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

export function editorLayerEdits({ session, selection, resources, typing, signal }: LayerEditsDeps): EditorLayerEdits {
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
    to: (id: string, props: Readonly<Record<string, unknown>>) => Record<string, unknown> | null,
  ) {
    return runQuietly(() =>
      session.gesture(() => {
        const now = session.design()
        const placedProps = (id: string): Readonly<Record<string, unknown>> => now.nodes[id]?.props ?? {}
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
          session.run('node.update', { ids: [id], patch })
        }
        // Text that grows the size of its words fits them again.
        for (const [id, patch] of writes) {
          if (Object.keys(patch).some((key) => SIZES_TEXT.has(key))) typing.fitText(id)
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
  const setHidden = (ids: string[], hidden: boolean) =>
    runQuietly(() => session.run('node.update', { ids, patch: { visible: !hidden } }))
  async function setFont(fontFamily: string, fontWeight?: number) {
    const ids = idsOf(selection.current()).filter((id) => session.design().nodes[id]?.type === 'text')
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
