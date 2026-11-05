'use client'

// The hooks that follow the editor: the selection, the picked frame, the design, the page the
// canvas shows and its frames, and the text being edited. Each re-renders its caller when what it
// follows changes.
import { useEffect, useState } from 'react'

import type { Editor, Frame } from '@dazbee/editor'

import { useLiveDesign } from './use-live-design.ts'

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

/** The frame picked as a whole, or null, kept current. */
export function usePickedFrame(editor: Editor) {
  const [picked, setPicked] = useState(() => editor.pickedFrame())
  useEffect(() => {
    setPicked(editor.pickedFrame())
    const stop = editor.onFramePick(setPicked)
    return () => {
      stop()
    }
  }, [editor])
  return picked
}

/** The design as the editor holds it, kept current: every redraw hands over the latest one. */
export function useEditorDesign(editor: Editor) {
  const { design } = useLiveDesign(editor)
  return { design }
}

/** The page the canvas shows, kept current: it changes when another page is shown or the shown one is deleted. */
export function useShownPage(editor: Editor) {
  const [page, setPage] = useState(() => editor.shownPage())
  useEffect(() => {
    const follow = () => setPage(editor.shownPage())
    follow()
    const stop = editor.onDraw(follow)
    return () => {
      stop()
    }
  }, [editor])
  return page
}

/** The shown page's frames as last drawn, by order, kept current; the same array while none of them changed. */
export function useShownFrames(editor: Editor) {
  const [frames, setFrames] = useState(() => editor.frames())
  useEffect(() => {
    const follow = () =>
      setFrames((now) => {
        const next = editor.frames()
        return sameFrames(now, next) ? now : next
      })
    follow()
    const stop = editor.onDraw(follow)
    return () => {
      stop()
    }
  }, [editor])
  return frames
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

function sameFrames(a: readonly Frame[], b: readonly Frame[]) {
  return (
    a.length === b.length &&
    a.every((frame, i) => {
      const other = b[i]
      return (
        other !== undefined &&
        frame.id === other.id &&
        frame.pageId === other.pageId &&
        frame.name === other.name &&
        frame.x === other.x &&
        frame.y === other.y &&
        frame.width === other.width &&
        frame.height === other.height
      )
    })
  )
}
