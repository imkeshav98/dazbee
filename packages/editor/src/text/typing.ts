// Typing into a text layer on the stage (#47): the text being edited with its caret and selected
// range, the keys that type, delete and move the caret, the text copied, cut and pasted, and the
// caret or range as the overlay draws it.
import type { CanvasKit } from '@dazbee/canvaskit'
import { anchorOffset, type DesignDoc, mergedProps, type Session, type TextAnchor, textAnchor } from '@dazbee/doc'
import { caretAt, caretPosition, selectionBoxes } from '@dazbee/renderer'
import { formatScope, type Point, type Rect, type TextStyle } from '@dazbee/schema'

import type { Frame } from '../canvas/grid.ts'
import { findLayer, type FrameScenes } from '../canvas/scenes.ts'
import type { EditorResources } from '../resources.ts'
import { runQuietly } from '../run-quietly.ts'
import type { Picked } from '../selection.ts'
import { type RunStyle, step, stylesIn, type StyleToggle, type TextRange, toggled } from './text-edit.ts'

export interface TypingDeps {
  ck: CanvasKit
  doc: DesignDoc
  session: Session
  resources: Pick<EditorResources, 'bytes'>
  scenes: Pick<FrameScenes, 'scene' | 'measure' | 'layout'>
  /** The frame of the grid as last drawn with a key, if there is one. */
  frameOf: (key: string | undefined) => Frame | undefined
  /** Groups fit what they hold again after a change inside them, in the same undo step (#41). */
  hug: (ids: string[]) => void
  /** Puts an overlay element over a box in a frame, in design pixels. */
  placeBox: (el: HTMLElement, frame: Frame, box: Rect) => void
  /** Tells the text selection listeners that the text being edited, or its selected range, changed. */
  textSelectionChanged: () => void
  /** Draws the overlay. */
  drawOverlay: () => void
}

export interface EditorTyping {
  /** The text layer being typed into, and the frame it is typed in; null when none is. */
  editing(): Readonly<Picked> | null
  /** The selected range of the text being edited, when it holds a character or more. */
  selectedText(): { id: string; range: TextRange } | null
  /** Each character's style in the selected range of the text being edited, or null with no range. */
  selectionStyles(): TextStyle[] | null
  /** The offset in the text being edited nearest a point in its frame, in design pixels; 0 with none. */
  caretFromPoint(p: Point): number
  /**
   * Starts typing into a text layer in a frame, with the caret at an offset, in one undo step until
   * typing stops: `endGesture` ends a step already begun, such as the one the text tool made the
   * layer in, and `created` says that tool made it.
   */
  start(id: string, frame: string, offset: number, endGesture?: () => void, created?: boolean): void
  /** Ends typing, closing its undo step; a text box the text tool made and left empty goes in it. */
  stop(): void
  /** Ends typing when the text being edited is no longer drawn: deleted, or its frame gone. */
  stopWhenGone(): void
  /** Puts the caret at an offset; with `extend`, the other end of the range stays where it is. */
  caretTo(offset: number, extend?: boolean): void
  /** Selects a range, the caret at its end. */
  selectText(range: TextRange): void
  /**
   * Styles a range of a text layer, as one undo step of its own: while the layer is being edited,
   * between the typing before and after it. A key left undefined changes nothing.
   */
  styleRange(selected: { id: string; range: TextRange }, style: RunStyle): void
  /** Styles the selected range of the text being edited; false when no range is selected. */
  styleSelectedText(style: RunStyle): boolean
  /**
   * Keeps the box of text that grows the size of its words in every format (#47), or in `only` that
   * one, and the groups around it fitted, in the step the edit is in.
   */
  fitText(id: string, only?: string): void
  /** A key pressed while typing: types, deletes, moves the caret or styles the range; other keys are the page's. */
  key(e: KeyboardEvent): void
  /** Copies the selected range as plain text; true while typing, so the layers aren't copied instead. */
  copy(e: ClipboardEvent): boolean
  /** Cuts the selected range as plain text. */
  cut(e: ClipboardEvent): void
  /** Pastes plain text over the selected range; its line breaks become paragraphs. */
  paste(e: ClipboardEvent): void
  /** The selected range as boxes, or else the caret, for the overlay. */
  parts(): HTMLElement[]
}

/**
 * The caret and the other end of the selected range (#47), anchored in the text so edits arriving
 * from other tabs carry them along; the same place when nothing is selected.
 */
interface Editing extends Picked {
  caret: TextAnchor
  anchor: TextAnchor
  endGesture: () => void
  created: boolean
}

export function editorTyping({
  ck,
  doc,
  session,
  resources,
  scenes,
  frameOf,
  hug,
  placeBox,
  textSelectionChanged,
  drawOverlay,
}: TypingDeps): EditorTyping {
  /** The text layer being typed into, with the caret and the other end of its range. */
  let editing: Editing | null = null

  function editingNow() {
    return editing
  }
  /** The layer as a frame shows it now, with the frame. */
  function pickedLayer(picked: Picked | null) {
    const frame = picked && frameOf(picked.frame)
    const layer = frame && findLayer(scenes.scene(frame).layers, picked.id)
    return frame && layer ? { frame, layer } : null
  }

  /** The editing layer's text, laid out as drawn, from the screen's cache, which owns it. */
  function editingText() {
    const found = pickedLayer(editing)
    if (found?.layer.type !== 'text') return null
    return { ...found, layer: found.layer, laid: scenes.layout(found.layer.props) }
  }
  /** The selected range of the text being edited; empty at the caret when nothing is selected. */
  function textRange(): TextRange | null {
    if (!editing) return null
    const caret = anchorOffset(doc, editing.caret)
    const anchor = anchorOffset(doc, editing.anchor)
    if (caret === null || caret === undefined) return null
    const other = anchor ?? caret
    return { start: Math.min(caret, other), end: Math.max(caret, other) }
  }
  /** Puts the caret at an offset; with `extend`, the other end of the range stays where it is. */
  function caretTo(offset: number, extend = false) {
    if (!editing) return
    editing.caret = textAnchor(doc, editing.id, offset)
    if (!extend) editing.anchor = editing.caret
    textSelectionChanged()
  }
  /**
   * Keeps the box of text that grows the size of its words in every format (#47), or in `only` that
   * one, and the groups around it fitted, in the step the edit is in.
   */
  function fitText(id: string, only?: string) {
    const now = session.design()
    const node = now.nodes[id]
    if (node?.type !== 'text') return
    const measure = scenes.measure()
    const sizes: Record<string, { width: number; height: number }> = {}
    // Text bound to a brand font is drawn, so measured, in the family the kit gives it.
    const bound = node.bindings?.fontFamily ? resources.bytes().variables?.[node.bindings.fontFamily] : undefined
    for (const formatId of only ? [only] : Object.keys(now.formats)) {
      const own = mergedProps(now, formatScope(formatId), id) as typeof node.props
      const props = bound ? { ...own, style: { ...own.style, fontFamily: bound } } : own
      if (props.boxMode === 'fixed') continue
      const size = measure(props, props.boxMode === 'autoWidth' ? null : props.width)
      sizes[formatId] = { width: props.boxMode === 'autoWidth' ? size.width : props.width, height: size.height }
    }
    if (Object.keys(sizes).length === 0) return
    runQuietly(() => session.run('text.fit', { id, sizes }))
    hug([id])
  }
  /** Selects a range, the caret at its end. */
  function selectText(range: TextRange) {
    if (!editing) return
    editing.anchor = textAnchor(doc, editing.id, range.start)
    editing.caret = textAnchor(doc, editing.id, range.end)
    textSelectionChanged()
  }
  /** The selected range of the text being edited, when it holds a character or more. */
  function selectedText(): { id: string; range: TextRange } | null {
    const range = textRange()
    return editing && range && range.end > range.start ? { id: editing.id, range } : null
  }
  /**
   * Styles a range of a text layer with `style`, as one undo step of its own: while the layer is
   * being edited, between the typing before and after it. A key left undefined changes nothing,
   * since a run can't say "as the layer".
   */
  function styleRange({ id, range }: { id: string; range: TextRange }, style: RunStyle) {
    const keys = Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined)) as RunStyle
    if (Object.keys(keys).length === 0) return
    const typing = editing?.id === id ? editing : null
    typing?.endGesture()
    session.gesture(() => {
      runQuietly(() =>
        session.run('text.edit', {
          id,
          op: { kind: 'style', at: range.start, length: range.end - range.start, style: keys },
        }),
      )
      fitText(id)
    })
    if (typing) typing.endGesture = session.beginGesture()
    drawOverlay()
  }
  /** Styles the selected range of the text being edited; false when no range is selected. */
  function styleSelectedText(style: RunStyle): boolean {
    const selected = selectedText()
    if (!selected) return false
    styleRange(selected, style)
    return true
  }
  function textSelectionStyles() {
    const selected = selectedText()
    const now = session.design()
    const node = selected && now.nodes[selected.id]
    if (!selected || !editing || node?.type !== 'text') return null
    const own = now.overrides[formatScope(String(frameOf(editing.frame)?.formatId))]?.[selected.id]?.style as
      Partial<typeof node.props.style> | undefined
    return stylesIn({ ...node.props, style: { ...node.props.style, ...own } }, selected.range)
  }

  function stopEditing() {
    if (!editing) return
    // A text box made with the text tool and left empty goes again, in the same undo step.
    const { id } = editing
    const node = session.design().nodes[id]
    if (node?.type === 'text' && node.props.text === '' && editing.created)
      runQuietly(() => session.run('node.delete', { ids: [id] }))
    editing.endGesture()
    editing = null
    textSelectionChanged()
  }
  /** Starts typing into a text layer in a frame, in one undo step until typing stops. */
  function startEditing(
    id: string,
    frame: string,
    offset: number,
    endGesture = session.beginGesture(),
    created = false,
  ) {
    const at = textAnchor(doc, id, offset)
    editing = { id, frame, caret: at, anchor: at, endGesture, created }
    textSelectionChanged()
  }
  function stopWhenGone() {
    if (editing && !pickedLayer(editing)) stopEditing()
  }

  function caretFromPoint(p: Point) {
    const text = editingText()
    if (!text) return 0
    return caretAt(ck, text.laid, p.x - text.layer.props.x, p.y - text.layer.props.y - text.laid.dy)
  }

  function onKey(e: KeyboardEvent) {
    if (!editing) return
    const mod = e.metaKey || e.ctrlKey
    // The document, not the last drawn scene: keys can come faster than redraws.
    const node = session.design().nodes[editing.id]
    if (node?.type !== 'text') return
    const text = node.props.text
    const range = textRange() ?? { start: 0, end: 0 }
    const caret = Math.min(anchorOffset(doc, editing.caret) ?? 0, text.length)
    const selected = range.end > range.start
    const { id } = editing
    const key = e.key.toLowerCase()
    /** Replaces the selected range with text, or with nothing; the caret ends after what went in. */
    const replace = (inserted: string) => {
      const ok = runQuietly(() => {
        if (selected)
          session.run('text.edit', { id, op: { kind: 'delete', at: range.start, length: range.end - range.start } })
        if (inserted) session.run('text.edit', { id, op: { kind: 'insert', at: range.start, text: inserted } })
      })
      // The anchor sits after the character before the caret, so inserting at the caret leaves it
      // before the new text; it is moved past it.
      if (ok) caretTo(range.start + inserted.length)
      return ok
    }
    /** The caret's offset on the line above or below, or at the start or end of its line. */
    const lineMove = (to: 'up' | 'down' | 'home' | 'end') => {
      const laid = editingText()
      if (!laid) return caret
      const at = caretPosition(ck, laid.laid, caret)
      if (to === 'home' || to === 'end') return caretAt(ck, laid.laid, to === 'home' ? -1e6 : 1e6, at.y + at.height / 2)
      const y = to === 'up' ? at.y - at.height / 2 : at.y + at.height * 1.5
      if (y < 0) return 0
      if (y > laid.laid.height) return text.length
      return caretAt(ck, laid.laid, at.x, y)
    }
    if (e.key === 'Escape') {
      stopEditing()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Logical order: right-to-left text moves the other way on screen, as most editors do. With
      // a range and no Shift, the caret goes to its near end.
      const forward = e.key === 'ArrowRight'
      if (selected && !e.shiftKey) caretTo(forward ? range.end : range.start)
      else caretTo(step(text, caret, forward), e.shiftKey)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
      caretTo(lineMove(({ ArrowUp: 'up', ArrowDown: 'down', Home: 'home', End: 'end' } as const)[e.key]), e.shiftKey)
    } else if (mod && key === 'a') {
      selectText({ start: 0, end: text.length })
    } else if ((mod && ['b', 'i', 'u'].includes(key)) || (mod && e.shiftKey && key === 'x')) {
      // Style keys (#47) style the selected range, in the base, so every format shows it.
      const toggle: StyleToggle =
        key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : 'strikethrough'
      if (selected)
        runQuietly(() =>
          session.run('text.edit', {
            id,
            op: {
              kind: 'style',
              at: range.start,
              length: range.end - range.start,
              style: toggled(node.props, range, toggle),
            },
          }),
        )
    } else if (e.key === 'Backspace' && (selected || caret > 0)) {
      if (selected) replace('')
      else if (
        runQuietly(() =>
          session.run('text.edit', {
            id,
            op: { kind: 'delete', at: step(text, caret, false), length: caret - step(text, caret, false) },
          }),
        )
      )
        caretTo(step(text, caret, false))
    } else if (e.key === 'Delete' && (selected || caret < text.length)) {
      if (selected) replace('')
      else
        runQuietly(() =>
          session.run('text.edit', { id, op: { kind: 'delete', at: caret, length: step(text, caret, true) - caret } }),
        )
    } else if (e.key === 'Enter') {
      replace('\n')
    } else if (e.key.length > 0 && [...e.key].length === 1 && !mod) {
      // Text is shared by every format, so typing writes the base.
      replace(e.key)
    } else {
      // Copy, cut and paste come as their own events; anything else is the page's.
      return
    }
    e.preventDefault()
    if (session.design().nodes[id] !== node) fitText(id)
    drawOverlay()
  }
  /** The text being edited and its selected range, for the clipboard. */
  function clipboardText() {
    const node = editing && session.design().nodes[editing.id]
    const range = textRange()
    return node?.type === 'text' && range ? { id: node, text: node.props.text, range } : null
  }
  function copy(e: ClipboardEvent) {
    const at = clipboardText()
    if (at) {
      if (at.range.end === at.range.start) return true
      e.clipboardData?.setData('text/plain', at.text.slice(at.range.start, at.range.end))
      e.preventDefault()
      return true
    }
    return false
  }
  function cut(e: ClipboardEvent) {
    const at = clipboardText()
    if (!at || !editing || at.range.end === at.range.start) return
    e.clipboardData?.setData('text/plain', at.text.slice(at.range.start, at.range.end))
    e.preventDefault()
    const { id } = editing
    if (
      runQuietly(() =>
        session.run('text.edit', {
          id,
          op: { kind: 'delete', at: at.range.start, length: at.range.end - at.range.start },
        }),
      )
    )
      caretTo(at.range.start)
    fitText(id)
    drawOverlay()
  }
  function paste(e: ClipboardEvent) {
    const at = clipboardText()
    if (!at || !editing) return
    const pasted = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n')
    e.preventDefault()
    const { id } = editing
    const { start, end } = at.range
    const ok = runQuietly(() => {
      if (end > start) session.run('text.edit', { id, op: { kind: 'delete', at: start, length: end - start } })
      if (pasted) session.run('text.edit', { id, op: { kind: 'insert', at: start, text: pasted } })
    })
    if (ok) caretTo(start + pasted.length)
    fitText(id)
    drawOverlay()
  }

  function textParts() {
    const parts: HTMLElement[] = []
    const text = editingText()
    const offset = editing && anchorOffset(doc, editing.caret)
    const range = textRange()
    if (text && range && range.end > range.start) {
      // The selected range, one box per run of one direction on one line (#47).
      for (const box of selectionBoxes(ck, text.laid, range.start, range.end)) {
        const el = document.createElement('div')
        el.className = 'text-selection'
        placeBox(el, text.frame, {
          x: text.layer.props.x + box.x,
          y: text.layer.props.y + text.laid.dy + box.y,
          width: box.width,
          height: box.height,
        })
        parts.push(el)
      }
    } else if (text && offset !== null && offset !== undefined) {
      const at = caretPosition(ck, text.laid, offset)
      const caret = document.createElement('div')
      caret.className = 'caret'
      placeBox(caret, text.frame, {
        x: text.layer.props.x + at.x,
        y: text.layer.props.y + text.laid.dy + at.y,
        width: 0,
        height: at.height,
      })
      caret.style.width = ''
      parts.push(caret)
    }
    return parts
  }

  return {
    editing: editingNow,
    selectedText,
    selectionStyles: textSelectionStyles,
    caretFromPoint,
    start: startEditing,
    stop: stopEditing,
    stopWhenGone,
    caretTo,
    selectText,
    styleRange,
    styleSelectedText,
    fitText,
    key: onKey,
    copy,
    cut,
    paste,
    parts: textParts,
  }
}
