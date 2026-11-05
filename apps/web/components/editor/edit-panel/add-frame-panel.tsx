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
import { SIZE_CHANNELS, SIZE_LIMITS, SIZE_PRESETS } from '@dazbee/schema'

import { editState, setOpen, useEditState } from '@/components/editor/edit-store.ts'
import { usePickedFrame } from '@/components/editor/editor-hooks.ts'
import { NumberInput, useNumberInput } from '@/components/editor/number-input.tsx'
import { PANEL_HEADING } from '@/components/editor/styles.ts'
import { useLiveDesign } from '@/components/editor/use-live-design.ts'
import { FOCUS_RING, LIT_ROW } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { type SideIssue, sizeOf, sizeYouAreOn, typedSize } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format, type Messages } from '@/lib/i18n/index.ts'

import { PanelFrame } from './edit-panel.tsx'

type Size = { width: number; height: number }

/** The picked frame Add size adds a size to: its id, name and size. */
interface PickedFrame extends Size {
  id: string
  name: string
}

/** The sign between a size's two fields, as sizes are written in every locale. */
const TIMES = '×'
/** The longest side of a tile's outlined shape, in pixels. */
const TILE_SHAPE = 40
/**
 * A size of your own's field: its letter, then the number; its edge is the accent while it is typed
 * in, and the danger colour on a side past the limits.
 */
const SIZE_FIELD =
  'flex h-[34px] min-w-0 flex-1 cursor-text items-center gap-1.5 overflow-hidden rounded-row border border-line bg-surface px-2.5 transition-colors duration-[var(--chrome-fast)] data-typing:border-accent has-[[aria-invalid=true]]:border-danger max-sm:h-11'

/** A size's outline, as long as a tile's shape on its long side and never thinner than a hairline box. */
const shapeStyle = ({ width, height }: Size): CSSProperties => {
  const k = TILE_SHAPE / Math.max(width, height)
  return { width: Math.max(4, Math.round(width * k)), height: Math.max(3, Math.round(height * k)) }
}

/** Why a side of a size can't be a frame's, in the app's words. */
const issueText = (t: Messages, { side, issue }: SideIssue) =>
  format(t.editor.addFrame.issue[side][issue], {
    n: issue === 'short' ? SIZE_LIMITS.minSide : issue === 'long' ? SIZE_LIMITS.maxSide : SIZE_LIMITS.maxRatio,
  })

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
  if (open === 'addFrame') return <SizesCard editor={editor} picked={null} />
  if (open !== 'addSize' || !picked) return null
  return <AddSize key={picked} editor={editor} frameId={picked} />
}

/**
 * The card: a note, the tiles by channel, then a size of your own, the words and fields 8 px in from
 * the title as the mock sets them. Opened by F on the stage, it leaves the focus there, so the tool
 * keys still work; from the dock's Frame button or a menu, it takes the focus as every edit panel
 * does.
 */
function SizesCard({ editor, picked }: { editor: Editor; picked: PickedFrame | null }) {
  const t = useMessages()
  const a = t.editor.addFrame
  const [focus] = useState(() => {
    const at = document.activeElement
    return picked !== null || (at instanceof HTMLElement && at.dataset.opens === 'addFrame')
  })
  // Add a frame is the only edit panel while it is open: as it opens, after its size of your own has
  // read the frame they are in, the layers selected are let go, with their top bar and small menu.
  const addingFrame = picked === null
  useEffect(() => {
    if (addingFrame && editor.selection().length > 0) editor.select([])
  }, [editor, addingFrame])
  const add = (size: Size) => {
    const added = picked ? editor.addSize(picked.id, size) : editor.addFrame(size)
    if (added !== null) setOpen(null)
  }
  return (
    <PanelFrame
      id={picked ? 'addSize' : 'addFrame'}
      title={picked ? format(a.addSizeTitle, { name: picked.name }) : a.title}
      focus={focus}
    >
      <p data-testid="add-frame-note" className="px-[8px] text-[12px] leading-[1.4] text-subtle">
        {picked ? format(a.addSizeNote, { name: picked.name }) : a.note}
      </p>
      {SIZE_CHANNELS.map((channel) => (
        <section key={channel} aria-label={t.editor.sizes.channel[channel]} className="flex flex-col gap-[8px]">
          <h3 className={cn(PANEL_HEADING, 'px-[8px]')}>{t.editor.sizes.channel[channel]}</h3>
          <div className="grid grid-cols-3 gap-0.5" data-testid={`sizes-${channel}`}>
            {SIZE_PRESETS.filter((preset) => preset.channel === channel).map((preset) => (
              <SizeTile key={preset.id} size={preset} name={t.editor.sizes.preset[preset.id]} onAdd={add} />
            ))}
          </div>
        </section>
      ))}
      <OwnSize start={picked ?? sizeYouAreOn(editor, editor.design())} onAdd={add} />
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
        'group flex min-w-0 cursor-pointer flex-col items-center gap-[4px] rounded-[10px] px-1 pt-[11px] pb-[11px] text-center text-text transition-colors duration-[var(--chrome-fast)]',
        LIT_ROW,
        FOCUS_RING,
      )}
    >
      <span aria-hidden className="grid h-[40px] place-items-center">
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
 * A size of your own: W × H and Add, starting at `start`. Past the limits, the side at fault has
 * the danger outline and a line under the fields names it and says why as it is typed, scrolled
 * into view, while a side within them stays plain; Add waits. Enter in a field adds as Add does.
 */
function OwnSize({ start, onAdd }: { start: Size; onAdd: (size: Size) => void }) {
  const t = useMessages()
  const a = t.editor.addFrame
  const [width, setWidth] = useState(() => String(start.width))
  const [height, setHeight] = useState(() => String(start.height))
  const typed = typedSize(width, height)
  const issues = typed?.issues ?? []
  const issueId = useId()
  const issueLines = useRef<HTMLDivElement>(null)
  const said = issues.map(({ side, issue }) => `${side} ${issue}`).join()
  // The lines saying why come into view as they show, past the body's padding and its faded edge:
  // on a phone the sheet may end at the fields.
  useEffect(() => {
    if (said) issueLines.current?.scrollIntoView({ block: 'nearest' })
  }, [said])
  const field = (axis: 'width' | 'height', value: string, set: (to: string) => void) => {
    const wrong = issues.some(({ side }) => side === axis)
    return (
      <OwnSide
        axis={axis}
        value={value}
        wrong={wrong}
        describedBy={wrong ? `${issueId}-${axis}` : undefined}
        onChange={set}
      />
    )
  }
  return (
    <form
      aria-label={a.ownSize}
      data-testid="own-size"
      className="flex flex-col gap-1.5 px-[8px]"
      onSubmit={(e) => {
        e.preventDefault()
        if (typed && typed.issues.length === 0) onAdd({ width: typed.width, height: typed.height })
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
          disabled={!typed || issues.length > 0}
          className={cn(
            'h-[34px] shrink-0 cursor-pointer rounded-row bg-accent-solid px-[15px] text-[12.5px] font-semibold text-on-accent transition-colors duration-[var(--chrome-fast)] hover:bg-accent-solid-hover active:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-45 max-sm:h-11',
            FOCUS_RING,
          )}
        >
          {a.add}
        </button>
      </div>
      {issues.length > 0 && (
        <div
          ref={issueLines}
          role="alert"
          data-testid="own-size-issue"
          className="flex scroll-mb-4 flex-col gap-0.5 text-xs text-danger"
        >
          {issues.map((at) => (
            <p key={at.side} id={`${issueId}-${at.side}`}>
              {issueText(t, at)}
            </p>
          ))}
        </div>
      )}
    </form>
  )
}

/** One side of a size of your own: its letter, then the side as a number input. */
function OwnSide({
  axis,
  value,
  wrong,
  describedBy,
  onChange,
}: {
  axis: 'width' | 'height'
  value: string
  wrong: boolean
  describedBy: string | undefined
  onChange: (to: string) => void
}) {
  const a = useMessages().editor.addFrame
  const entry = useNumberInput()
  return (
    <div {...entry.knob} className={SIZE_FIELD}>
      <span aria-hidden className="text-[11px] font-semibold text-subtle">
        {axis === 'width' ? a.w : a.h}
      </span>
      <NumberInput
        entry={entry}
        text={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        aria-label={a[axis]}
        aria-invalid={wrong}
        aria-describedby={describedBy}
        name={axis}
        data-testid={`own-${axis}`}
      />
    </div>
  )
}

/** The Add size card for one frame, under its name as it is now; none once the frame is gone. */
function AddSize({ editor, frameId }: { editor: Editor; frameId: string }) {
  const { design } = useLiveDesign(editor)
  const frame = design.frames[frameId]
  if (!frame) return null
  return (
    <SizesCard editor={editor} picked={{ id: frameId, name: frame.name, width: frame.width, height: frame.height }} />
  )
}
