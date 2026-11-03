'use client'

import { useEffect, useState } from 'react'

import type { Editor } from '@dazbee/editor'

import { valueStore } from '@/lib/value-store.ts'

import { useLiveDesign } from './use-live-design.ts'

/** The page last brought into view, from the Pages panel or by picking it on the stage. */
export const shownPage = valueStore<string | null>(null)

/** The selected layers, kept current. */
export function useSelection(editor: Editor) {
  const [ids, setIds] = useState(() => editor.selection())
  useEffect(() => {
    const stop = editor.onSelection(setIds)
    return () => {
      stop()
    }
  }, [editor])
  return ids
}

/** The selection and the frame it is in, kept current. */
export function useSelectionWithFrame(editor: Editor) {
  const [state, setState] = useState(() => ({ ids: editor.selection(), frame: editor.selectedFrame() }))
  useEffect(() => {
    const stop = editor.onSelection((ids) => setState({ ids, frame: editor.selectedFrame() }))
    return () => {
      stop()
    }
  }, [editor])
  return state
}

/** The design as the editor holds it, kept current: every redraw hands over the latest one. */
export function useEditorDesign(editor: Editor) {
  const { design } = useLiveDesign(editor)
  const [focused, setFocused] = useState(() => editor.focused())
  useEffect(() => {
    const stop = editor.onDraw(() => setFocused(editor.focused()))
    return () => {
      stop()
    }
  }, [editor])
  return { design, focused }
}

/** The page a click on its background picked, or null, following the stage. */
export function usePickedPage(editor: Editor) {
  const [picked, setPicked] = useState(() => editor.pickedPage())
  useEffect(() => {
    const follow = (pageId: string | null) => {
      setPicked(pageId)
      if (pageId) shownPage.set(pageId)
    }
    follow(editor.pickedPage())
    const stop = editor.onPagePick(follow)
    return () => {
      stop()
    }
  }, [editor])
  return picked
}

/** Renders again whenever the text being edited, or its selected range, changes. */
export function useTextSelection(editor: Editor) {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const stop = editor.onTextSelection(() => setVersion((v) => v + 1))
    return () => {
      stop()
    }
  }, [editor])
  return editor.textSelection()
}
