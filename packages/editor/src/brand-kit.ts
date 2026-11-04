// The brand kit in the editor (#53): the values bound properties take, binding the selection to a
// brand colour or font or unbinding it, and text that follows a brand font taking its new family.
import type { Session } from '@dazbee/doc'
import { type BindingTarget, canBind, fontFamilies, type VariableRef, type Variables } from '@dazbee/schema'

import type { EditorView } from './canvas/view.ts'
import { type EditorResources, SHIPPED_FAMILIES } from './resources.ts'
import { runQuietly } from './run-quietly.ts'
import type { EditorSelection } from './selection.ts'
import type { EditorTyping } from './text/typing.ts'

export interface BrandKitDeps {
  session: Session
  resources: Pick<EditorResources, 'bytes' | 'loadFamilies' | 'setVariables'>
  view: Pick<EditorView, 'redraw'>
  selection: Pick<EditorSelection, 'current'>
  typing: Pick<EditorTyping, 'fitText'>
  /** Aborted when the editor is destroyed: families that arrive after that change nothing. */
  signal: AbortSignal
}

export interface EditorBrandKit {
  /**
   * Gives bound properties new values, as when the brand kit changes: bound layers redraw with them,
   * the families of brand fonts load, and text bound to a brand font whose family changed refits;
   * the promise settles then.
   */
  setVariables(variables: Variables): Promise<void>
  /** Binds the selected layers to a brand colour or font, or unbinds them with null, in one undo step; returns how many changed. */
  bindSelection(kind: 'color' | 'font', ref: VariableRef | null): number
  /**
   * Text bound to a brand font whose family the kit has changed since takes it once its files are
   * here, its box fitting it in every format: a change no one undoes.
   */
  refitBrandFonts(): Promise<void>
}

export function editorBrandKit({ session, resources, view, selection, typing, signal }: BrandKitDeps): EditorBrandKit {
  function setVariables(variables: Variables) {
    resources.setVariables(variables)
    resources.loadFamilies(fontFamilies(session.design(), variables))
    view.redraw()
    return refitBrandFonts()
  }
  function bindSelection(kind: 'color' | 'font', ref: VariableRef | null): number {
    const current = session.design()
    const value = ref ? resources.bytes().variables?.[ref] : undefined
    if (ref && value === undefined) return 0
    const targets = (selection.current()?.ids ?? []).flatMap((id) => {
      const type = current.nodes[id]?.type ?? ''
      const target: BindingTarget = kind === 'font' ? 'fontFamily' : type === 'text' ? 'textColor' : 'fill'
      return canBind(type, target) ? [{ id, target }] : []
    })
    if (targets.length === 0) return 0
    let changed = 0
    session.gesture(() => {
      for (const { id, target } of targets) {
        if (
          !runQuietly(() =>
            session.run('node.bind', { ids: [id], target, ref, ...(value === undefined ? {} : { value }) }),
          )
        )
          continue
        changed++
        if (target === 'fontFamily') typing.fitText(id)
      }
    })
    return changed
  }
  /**
   * Text bound to a brand font whose family the kit has changed since: once that family's files are
   * here, it takes it and its box fits it in every format. The kit lives outside the design, so this
   * is a change no one undoes, as another tab's: undo could not put the kit back with it. Run when the
   * kit changes and when the design opens.
   */
  async function refitBrandFonts() {
    const kit = resources.bytes().variables ?? {}
    const stale = Object.entries(session.design().nodes).flatMap(([id, node]) => {
      const ref = node.type === 'text' ? node.bindings?.fontFamily : undefined
      const family = ref ? kit[ref] : undefined
      return node.type === 'text' && ref && family && family !== node.props.style.fontFamily
        ? [{ id, ref, family }]
        : []
    })
    if (stale.length === 0) return
    const families = [...new Set(stale.map((s) => s.family))]
    await Promise.all(resources.loadFamilies(families))
    if (signal.aborted) return
    // Fitted in the fallback fonts, a box would be wrong: only a family whose files came is written.
    const here = new Set([...SHIPPED_FAMILIES, ...resources.bytes().fonts.map((f) => f.family)])
    session.untracked(() => {
      for (const { id, ref, family } of stale) {
        const node = session.design().nodes[id]
        // Still bound, the kit still gives this family (not a newer one), and the text has not taken it already.
        if (node?.type !== 'text' || node.bindings?.fontFamily !== ref || resources.bytes().variables?.[ref] !== family)
          continue
        if (node.props.style.fontFamily === family || !here.has(family)) continue
        if (!runQuietly(() => session.run('node.bind', { ids: [id], target: 'fontFamily', ref, value: family })))
          continue
        typing.fitText(id)
      }
    })
  }

  return {
    setVariables,
    bindSelection,
    refitBrandFonts,
  }
}
