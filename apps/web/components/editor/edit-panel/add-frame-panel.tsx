'use client'

// The Add a frame card. Picking the Frame tool opens it in the edit panel, and closing it, or picking
// another tool, puts the tool down. It shows the sizes as tiles three across, grouped by channel,
// each with its outlined shape, name and pixels, then W × H and Add for a size of your own, checked
// against the size limits as it is typed. A tile or Add adds an empty frame to the shown page. A
// picked frame's Add size opens the same card, titled for that frame, where they add a frame of the
// size holding linked copies of its layers. Either is one undo step; the new frame is picked and
// shown, and the card closes.
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react'

import type { Editor, Tool } from '@dazbee/editor'
import {
  BLANK_SIZE,
  type Design,
  framesOf,
  SIZE_CHANNELS,
  SIZE_LIMITS,
  SIZE_PRESETS,
  type SizeIssue,
} from '@dazbee/schema'

import { editState, setOpen, useEditState } from '@/components/editor/edit-store.ts'
import { usePickedFrame } from '@/components/editor/editor-hooks.ts'
import { PANEL_HEADING } from '@/components/editor/styles.ts'
import { useLiveDesign } from '@/components/editor/use-live-design.ts'
import { FOCUS_RING, LIT_ROW } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { sizeOf, typedSize } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format, type Messages } from '@/lib/i18n/index.ts'

import { PanelFrame } from './edit-panel.tsx'

type Size = { width: number; height: number }

/** The frame Add size copies: its id, name and size. */
interface Source extends Size {
  id: string
  name: string
}

/** The sign between a size's two fields, as sizes are written in every locale. */
const TIMES = '×'
/** The longest side of a tile's outlined shape, in pixels. */
const TILE_SHAPE = 40
/** A size of your own's field: its letter, then the number in mono; its border shows the focus. */
const SIZE_FIELD =
  'flex h-[34px] min-w-0 flex-1 items-center gap-1.5 rounded-row border border-line bg-surface px-2.5 focus-within:border-accent has-[[aria-invalid=true]]:border-danger max-sm:h-11'

/** A size's outline, as long as a tile's shape on its long side and never thinner than a hairline box. */
const shapeStyle = ({ width, height }: Size): CSSProperties => {
  const k = TILE_SHAPE / Math.max(width, height)
  return { width: Math.max(4, Math.round(width * k)), height: Math.max(3, Math.round(height * k)) }
}

/** Why a size can't be a frame's, in the app's words. */
const issueText = (t: Messages, issue: SizeIssue) =>
  format(t.editor.addFrame.issue[issue], {
    n: issue === 'short' ? SIZE_LIMITS.minSide : issue === 'long' ? SIZE_LIMITS.maxSide : SIZE_LIMITS.maxRatio,
  })

/** The size of the frame you are on: the selection's, else the picked one, else the shown page's first, else a blank design's. */
function sizeYouAreOn(editor: Editor, design: Design): Size {
  const on = [editor.selectedFrame(), editor.pickedFrame()].find(
    (id) => id !== null && Object.hasOwn(design.frames, id),
  )
  return (on ? design.frames[on] : undefined) ?? framesOf(design, editor.shownPage())[0]?.[1] ?? BLANK_SIZE
}

/**
 * Keeps the Add a frame card open while the Frame tool is: picking the tool opens it, putting the
 * tool down closes it, and closing the card, or opening another panel or pop-up over it, puts the
 * tool down.
 */
export function useFrameToolCard(editor: Editor | null, tool: Tool) {
  const { open } = useEditState()
  const frameTool = tool === 'frame'
  useEffect(() => {
    if (frameTool) setOpen('addFrame')
    else if (editState().open === 'addFrame') setOpen(null)
  }, [frameTool])
  const cardOpen = open === 'addFrame'
  const wasOpen = useRef(cardOpen)
  useEffect(() => {
    if (wasOpen.current && !cardOpen && editor?.tool() === 'frame') editor.setTool('select')
    wasOpen.current = cardOpen
  }, [cardOpen, editor])
}

/** The Add a frame card while the Frame tool is picked, or the Add size card for the picked frame. */
export function AddFramePanel({ editor }: { editor: Editor }) {
  const { open } = useEditState()
  const picked = usePickedFrame(editor)
  if (open === 'addFrame') return <SizesCard editor={editor} from={null} />
  if (open !== 'addSize' || !picked) return null
  return <AddSize key={picked} editor={editor} frameId={picked} />
}

/**
 * The card: a note, the tiles by channel, then a size of your own. Opened by F on the stage, it
 * leaves the focus there, so the tool keys still work; from the dock's Frame button or a menu, it
 * takes the focus as every edit panel does.
 */
function SizesCard({ editor, from }: { editor: Editor; from: Source | null }) {
  const t = useMessages()
  const a = t.editor.addFrame
  const [focus] = useState(() => {
    const at = document.activeElement
    return from !== null || (at instanceof HTMLElement && at.dataset.opens === 'addFrame')
  })
  const add = (size: Size) => {
    if (editor.addFrame(size, from?.id) !== null) setOpen(null)
  }
  return (
    <PanelFrame
      id={from ? 'addSize' : 'addFrame'}
      title={from ? format(a.addSizeTitle, { name: from.name }) : a.title}
      focus={focus}
    >
      <p data-testid="add-frame-note" className="text-[12px] leading-[1.4] text-subtle">
        {from ? format(a.addSizeNote, { name: from.name }) : a.note}
      </p>
      {SIZE_CHANNELS.map((channel) => (
        <section key={channel} aria-label={t.editor.sizes.channel[channel]} className="flex flex-col gap-1">
          <h3 className={PANEL_HEADING}>{t.editor.sizes.channel[channel]}</h3>
          <div className="grid grid-cols-3 gap-0.5" data-testid={`sizes-${channel}`}>
            {SIZE_PRESETS.filter((preset) => preset.channel === channel).map((preset) => (
              <SizeTile key={preset.id} size={preset} name={t.editor.sizes.preset[preset.id]} onAdd={add} />
            ))}
          </div>
        </section>
      ))}
      <OwnSize start={from ?? sizeYouAreOn(editor, editor.design())} onAdd={add} />
    </PanelFrame>
  )
}

/** One size to add: its outlined shape, its name and its pixels. */
function SizeTile({ size, name, onAdd }: { size: Size & { id: string }; name: string; onAdd: (size: Size) => void }) {
  return (
    <button
      type="button"
      data-preset={size.id}
      onClick={() => onAdd({ width: size.width, height: size.height })}
      className={cn(
        'group flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-[10px] px-1 pt-2.5 pb-2 text-center text-text transition-colors duration-[var(--chrome-fast)]',
        LIT_ROW,
        FOCUS_RING,
      )}
    >
      <span aria-hidden className="grid h-11 place-items-center">
        <span
          style={shapeStyle(size)}
          className="block rounded-[2px] border-[1.5px] border-subtle transition-colors duration-[var(--chrome-fast)] group-hover:border-accent group-focus-visible:border-accent"
        />
      </span>
      <span className="flex min-h-[2.4em] max-w-full items-center text-[11.5px] leading-[1.2] font-medium">{name}</span>
      <span className="font-mono text-[10.5px] leading-none text-subtle tabular-nums">{sizeOf(size)}</span>
    </button>
  )
}

/**
 * A size of your own: W × H and Add, starting at `start`. Past the limits, a line under the fields
 * says why as it is typed, scrolled into view, and Add waits; Enter in a field adds as Add does.
 */
function OwnSize({ start, onAdd }: { start: Size; onAdd: (size: Size) => void }) {
  const t = useMessages()
  const a = t.editor.addFrame
  const [width, setWidth] = useState(() => String(start.width))
  const [height, setHeight] = useState(() => String(start.height))
  const typed = typedSize(width, height)
  const issue = typed?.issue
  const issueId = useId()
  const issueLine = useRef<HTMLParagraphElement>(null)
  // The line saying why comes into view as it shows, past the body's padding and its faded edge:
  // on a phone the sheet may end at the fields.
  useEffect(() => {
    if (issue) issueLine.current?.scrollIntoView({ block: 'nearest' })
  }, [issue])
  const field = (axis: 'width' | 'height', value: string, set: (to: string) => void) => (
    <label className={SIZE_FIELD}>
      <span aria-hidden className="text-[11px] font-semibold text-subtle">
        {axis === 'width' ? a.w : a.h}
      </span>
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        aria-label={a[axis]}
        aria-invalid={issue !== undefined}
        aria-describedby={issue ? issueId : undefined}
        name={axis}
        data-testid={`own-${axis}`}
        className="w-full min-w-0 bg-transparent font-mono text-[12px] text-text tabular-nums outline-none focus-visible:outline-none!"
      />
    </label>
  )
  return (
    <form
      aria-label={a.ownSize}
      data-testid="own-size"
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (typed && !typed.issue) onAdd(typed)
      }}
    >
      <h3 className={PANEL_HEADING}>{a.ownSize}</h3>
      <div className="flex items-center gap-1.5">
        {field('width', width, setWidth)}
        <span aria-hidden className="text-[12px] text-subtle">
          {TIMES}
        </span>
        {field('height', height, setHeight)}
        <button
          type="submit"
          disabled={!typed || issue !== undefined}
          className={cn(
            'h-[34px] shrink-0 cursor-pointer rounded-row bg-accent-solid px-3.5 text-[12.5px] font-semibold text-on-accent transition-colors duration-[var(--chrome-fast)] hover:bg-accent-solid-hover active:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-45 max-sm:h-11',
            FOCUS_RING,
          )}
        >
          {a.add}
        </button>
      </div>
      {issue && (
        <p
          ref={issueLine}
          id={issueId}
          role="alert"
          data-testid="own-size-issue"
          className="scroll-mb-4 text-xs text-danger"
        >
          {issueText(t, issue)}
        </p>
      )}
    </form>
  )
}

/** The Add size card for one frame, under its name as it is now; none once the frame is gone. */
function AddSize({ editor, frameId }: { editor: Editor; frameId: string }) {
  const { design } = useLiveDesign(editor)
  const frame = design.frames[frameId]
  if (!frame) return null
  return (
    <SizesCard editor={editor} from={{ id: frameId, name: frame.name, width: frame.width, height: frame.height }} />
  )
}
