'use client'

// The top bar: fixed at the top centre of the stage while something is selected, its items set by
// what is selected (text, a photo, a shape, a box, a group, or several). An item with ▾ opens a
// pop-up under the bar; a panel item opens the one edit panel at the stage's end; the rest act at
// once. When the items don't fit, the last ones go into ⋯, which opens a second row under the bar;
// on a phone the bar scrolls sideways instead.
import {
  ArrowsClockwiseIcon, CircleHalfIcon, CornersOutIcon, CropIcon, DotsThreeIcon, FadersIcon, FrameCornersIcon, ListBulletsIcon, ListNumbersIcon, MaskHappyIcon, MinusIcon, PlusIcon,
  RowsIcon, SparkleIcon, StarIcon, TextAaIcon, TextAlignCenterIcon, TextAlignJustifyIcon, TextAlignLeftIcon, TextAlignRightIcon, TextBIcon, TextItalicIcon, TextStrikethroughIcon,
  TextUnderlineIcon, AlignLeftIcon, UniteSquareIcon,
} from '@phosphor-icons/react'
import { shortcutFor, withImage, type Editor, type ShortcutAction } from '@dazbee/editor'
import { boundFillIndex, type Design, type Paint } from '@dazbee/schema'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { COMBINE, DISTRIBUTE, keyOf, useSelection } from './arrange-panel.tsx'
import { arrowAlong, BarPopover, useRovingTab } from './bar-popover.tsx'
import { editState, isPanel, setBar, setOpen, useEditState, usePhone, type PanelId } from './edit-store.ts'
import { nearest, useFontCatalog, weightsOf } from './font-panel.tsx'
import { ImagePickerButton } from './image-tool.tsx'
import { AlignRow } from './layer-actions.tsx'
import { setEveryFormat } from './scope-store.ts'
import {
  factsOf, imageFillOf, kindOf, PopupContent, ScopeChip, set, setTextFlag, shared, textFlag, textStyle, useTarget, type Style, type Target,
} from './selection-cards.tsx'
import { BAR_BUTTON, BAR_DIVIDER, BAR_ROW, BAR_TOGGLE, FOCUS_RING, MENU_DIVIDER, MENU_ITEM, MENU_KEY, MIXED_COLOUR } from './styles.ts'

/** Bold from this weight up, as type designers name their weights. */
const BOLD = 600
/** The marks on the text colour and case buttons; the same in every language, as a font sample is. */
const COLOUR_MARK = 'A'
const CASE_MARK = 'aA'
/** Room kept between the bar and the stage's sides. */
const SIDE = 16
/** The bar's look: a frosted pill of buttons, centred at the top of the stage under the header pill. */
const TOP_BAR = 'flex items-center gap-0.5 rounded-[14px] surface-frost p-1'

const ALIGN_ICON = {
  start: <TextAlignLeftIcon size={16} aria-hidden className="rtl:-scale-x-100" />,
  center: <TextAlignCenterIcon size={16} aria-hidden />,
  end: <TextAlignRightIcon size={16} aria-hidden className="rtl:-scale-x-100" />,
  justify: <TextAlignJustifyIcon size={16} aria-hidden />,
}

/** A swatch on a bar button: the colour, or a rainbow where the layers have different ones. */
const Dot = ({ colour }: { colour: string | null | 'mixed' }) => (
  <span aria-hidden className="size-4 rounded-full border border-line-strong" style={{ background: colour === 'mixed' || colour === null ? MIXED_COLOUR : colour }} />
)

/** One item of the bar: a button, a pop-up's button or a divider, by a key that names it. */
type Item = { key: string; node: ReactNode }

/** A bar item that opens one of the edit panels, or closes it when it is open. */
function PanelButton({ id, label, icon, face }: { id: PanelId; label: string; icon?: ReactNode; face?: ReactNode }) {
  const { open } = useEditState()
  return (
    <button
      type="button"
      data-bar-item
      aria-expanded={open === id}
      aria-controls="edit-panel"
      aria-label={face ? label : undefined}
      title={face ? label : undefined}
      data-testid={`bar-${id}`}
      data-opens={id}
      onClick={() => setOpen(open === id ? null : id)}
      className={BAR_BUTTON}
    >
      {icon}
      {face ?? label}
    </button>
  )
}

/** The text's size on the bar: smaller, the size as a field to type into, bigger. */
function SizeStepper({ target }: { target: Target }) {
  const t = useMessages()
  const { style, setStyle, shiftStyle } = textStyle(target)
  const size = style('fontSize') as number | 'mixed'
  const shown = size === 'mixed' ? '' : String(Math.round(size * 10) / 10)
  // What is being typed, until Enter, leaving the field or Esc; the size shows otherwise.
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (text: string) => {
    const n = Number(text)
    if (text.trim() !== '' && Number.isFinite(n) && n >= 1) setStyle('fontSize', Math.round(n * 10) / 10)
    setDraft(null)
  }
  return (
    <div role="group" aria-label={t.editor.props.fontSize} data-testid="bar-size" className="flex h-[30px] shrink-0 items-center rounded-row border border-line">
      <button type="button" data-bar-item aria-label={t.editor.bar.smaller} title={t.editor.bar.smaller} onClick={() => shiftStyle('fontSize', -1, 1)} className="grid h-full w-6 cursor-pointer place-items-center rounded-s-row text-muted hover:bg-hover hover:text-text">
        <MinusIcon size={12} aria-hidden />
      </button>
      <input
        name="font-size"
        aria-label={t.editor.props.fontSize}
        value={draft ?? shown}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="--"
        inputMode="decimal"
        data-testid="bar-size-field"
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          event.stopPropagation()
          // Undo and redo are the design's while nothing is being typed, as in the panels' fields.
          const action = shortcutFor(event.nativeEvent)
          if (draft === null && (action === 'undo' || action === 'redo')) {
            event.preventDefault()
            target.editor.perform(action)
            return
          }
          if (event.key === 'Enter') commit(event.currentTarget.value)
          if (event.key === 'Escape') setDraft(null)
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            setDraft(null)
            shiftStyle('fontSize', (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1), 1)
          }
        }}
        onBlur={(event) => draft !== null && commit(event.currentTarget.value)}
        className={cn('h-full w-10 bg-transparent text-center font-mono text-[12px] tabular-nums text-text outline-none', FOCUS_RING)}
      />
      <button type="button" data-bar-item aria-label={t.editor.bar.bigger} title={t.editor.bar.bigger} onClick={() => shiftStyle('fontSize', 1, 1)} className="grid h-full w-6 cursor-pointer place-items-center rounded-e-row text-muted hover:bg-hover hover:text-text">
        <PlusIcon size={12} aria-hidden />
      </button>
    </div>
  )
}

/** The items of the top bar for the selection, in order. */
function useItems(target: Target, design: Design, brandId: string): Item[] {
  const t = useMessages()
  const p = t.editor.props
  const b = t.editor.bar
  const a = t.editor.arrange
  const { open } = useEditState()
  const { catalog } = useFontCatalog(brandId)
  const kind = kindOf(target)
  const facts = factsOf(target, design)
  const several = target.ids.length > 1
  const items: Item[] = []
  const add = (key: string, node: ReactNode) => items.push({ key, node })
  const divider = () => add(`divider-${items.length}`, <span aria-hidden className={BAR_DIVIDER} />)
  const pop = (id: string, label: string, children: ReactNode, look: { face?: ReactNode; icon?: ReactNode; testId?: string; className?: string } = {}) =>
    add(id, (
      <BarPopover id={id} open={open} onOpen={setOpen} label={label} face={look.face} icon={look.icon} testId={look.testId ?? id} className={look.className ?? 'w-auto'}>
        {children}
      </BarPopover>
    ))
  const popup = (id: string) => <PopupContent popup={id} target={target} design={design} />

  if (Object.keys(design.formats).length > 1) {
    add('scope', <ScopeChip target={target} design={design} open={open === 'scope'} onOpen={(to) => setOpen(to ? 'scope' : null)} />)
    divider()
  }

  // Text: its font, size and colour, its styles, and its paragraph's alignment, list, case and spacing.
  const texts = kind === 'text' ? textStyle(target).styles : target.props.flatMap((pr, i) => (target.types[i] === 'text' ? [pr.style as Style] : []))
  if (texts.length > 0) {
    const family = shared(texts.map((s) => s.fontFamily))
    add('font', <PanelButton id="font" label={b.font} face={<span className="max-w-28 truncate">{family === 'mixed' ? t.editor.fonts.mixed : family}</span>} />)
  }
  if (kind === 'text') {
    const color = shared(texts.map((s) => s.color))
    const align = shared(target.props.map((pr) => (pr.align ?? 'start') as keyof typeof ALIGN_ICON))
    const list = shared(target.props.map((pr) => (pr.list ?? 'none') as string))
    const bolds = texts.map((s) => s.fontWeight >= BOLD)
    const bold = bolds.every(Boolean) ? true : bolds.some(Boolean) ? 'mixed' : false
    const italics = texts.map((s) => s.fontStyle === 'italic')
    const italic = italics.every(Boolean) ? true : italics.some(Boolean) ? 'mixed' : false
    // Bold on is each family's weight nearest Bold; off, its weight nearest Regular.
    const weightFor = (fontFamily: string, on: boolean) => {
      const weights = weightsOf(catalog.find((f) => f.family === fontFamily)).filter((w) => (on ? w >= BOLD : w < BOLD))
      return weights.length > 0 ? nearest(weights, on ? 700 : 400) : null
    }
    const canBold = texts.every((s) => weightFor(s.fontFamily, bold !== true) !== null)
    const toggleBold = () => {
      if (target.range) {
        const fontWeight = weightFor(target.range[0]?.fontFamily ?? '', bold !== true)
        if (fontWeight !== null) target.editor.styleTextSelection({ fontWeight })
        return
      }
      set(target, (now) => {
        const style = now.style as Style
        const fontWeight = weightFor(style.fontFamily, bold !== true)
        return fontWeight === null ? null : { style: { ...style, fontWeight } }
      })
    }
    const flag = (key: 'underline' | 'strikethrough') => textFlag(target, key)
    add('size', <SizeStepper target={target} />)
    add('colour', <PanelButton id="colour" label={p.textColour} face={<span aria-hidden className="flex flex-col items-center font-display text-[13px] leading-none font-bold">{COLOUR_MARK}<span className="mt-0.5 h-[3px] w-3.5 rounded-full" style={{ background: color === 'mixed' ? MIXED_COLOUR : color.slice(0, 7) }} /></span>} />)
    add('bold', <button type="button" data-bar-item aria-label={b.bold} title={b.bold} aria-pressed={bold} disabled={!canBold} onClick={toggleBold} data-testid="bar-bold" className={BAR_TOGGLE}><TextBIcon size={16} weight="bold" aria-hidden /></button>)
    add('italic', <button type="button" data-bar-item aria-label={b.italic} title={b.italic} aria-pressed={italic} onClick={() => textStyle(target).setStyle('fontStyle', italic === true ? 'normal' : 'italic')} data-testid="bar-italic" className={BAR_TOGGLE}><TextItalicIcon size={16} weight="bold" aria-hidden /></button>)
    add('underline', <button type="button" data-bar-item aria-label={b.underline} title={b.underline} aria-pressed={flag('underline')} onClick={() => setTextFlag(target, 'underline', flag('underline') !== true)} data-testid="bar-underline" className={BAR_TOGGLE}><TextUnderlineIcon size={16} weight="bold" aria-hidden /></button>)
    add('strikethrough', <button type="button" data-bar-item aria-label={b.strikethrough} title={b.strikethrough} aria-pressed={flag('strikethrough')} onClick={() => setTextFlag(target, 'strikethrough', flag('strikethrough') !== true)} data-testid="bar-strikethrough" className={BAR_TOGGLE}><TextStrikethroughIcon size={16} weight="bold" aria-hidden /></button>)
    pop('align', b.align, popup('align'), { face: ALIGN_ICON[align === 'mixed' ? 'start' : align] })
    pop('list', b.list, popup('list'), { face: list === 'number' ? <ListNumbersIcon size={16} aria-hidden /> : <ListBulletsIcon size={16} aria-hidden /> })
    pop('case', b.textCase, popup('case'), { face: <span aria-hidden className="text-[13px] font-semibold">{CASE_MARK}</span> })
    add('spacing', <PanelButton id="spacing" label={b.spacing} icon={<TextAaIcon size={16} aria-hidden />} />)
  }

  // A photo: its look and fit, replacing and cropping it, its corners and outline.
  const photo = kind === 'photo' ? imageFillOf(target) : null
  if (photo) {
    add('edit', <PanelButton id="edit" label={b.edit} icon={<FadersIcon size={15} aria-hidden />} />)
    add('replace', (
      <ImagePickerButton
        brandId={brandId}
        title={p.replaceImageTitle}
        testId="bar-replace"
        below
        open={open === 'replace'}
        onOpen={(to) => setOpen(to ? 'replace' : null)}
        className={BAR_BUTTON}
        onPick={(asset) => set(target, (now) => ({ fills: withImage((now.fills ?? []) as Paint[], asset.id) }))}
      >
        <ArrowsClockwiseIcon size={15} aria-hidden />
        <span aria-hidden>{b.replace}</span>
      </ImagePickerButton>
    ))
    if (!several) add('crop', <button type="button" data-bar-item data-testid="bar-crop" onClick={() => target.editor.perform('editPoints')} className={BAR_BUTTON}><CropIcon size={15} aria-hidden />{b.crop}</button>)
    // A photo in a box keeps the box's own settings, whose Box pop-up holds its corners.
    if (!facts.frames && facts.ownShape === 'rect') pop('corners', b.corners, popup('corners'), { icon: <CornersOutIcon size={16} aria-hidden />, className: 'w-72 p-2.5' })
    if (facts.frames) {
      add('stack', <PanelButton id="stack" label={b.autoLayout} icon={<RowsIcon size={15} aria-hidden />} />)
      pop('box', b.box, popup('box'), { icon: <FrameCornersIcon size={15} aria-hidden />, className: 'w-72 p-2.5' })
    }
    add('outline', <PanelButton id="outline" label={b.outline} />)
  }

  // Shapes and boxes together keep their colour and outline.
  if (kind === 'mixed' && target.types.every((type) => type === 'graphic' || type === 'frame' || type === 'boolean')) {
    add('colour', <PanelButton id="colour" label={b.fill} face={<Dot colour="mixed" />} />)
    add('outline', <PanelButton id="outline" label={b.outline} />)
  }

  // A shape or a box: its colour, outline, and its shape's or box's own settings.
  if (kind === 'shape' || kind === 'box') {
    const colour = shared(target.props.map((pr) => {
      const fills = (pr.fills ?? []) as Paint[]
      const fill = fills[boundFillIndex(fills)]
      return fill?.type === 'solid' ? fill.color.slice(0, 7) : null
    }))
    if (!facts.lines) add('colour', <PanelButton id="colour" label={b.fill} face={<Dot colour={colour} />} />)
    add('outline', <PanelButton id="outline" label={b.outline} />)
    if (kind === 'shape' && facts.booleans && !several) pop('combine', p.combine, popup('combine'), { icon: <UniteSquareIcon size={15} aria-hidden />, className: 'w-72 p-2.5', testId: 'combine-op' })
    else if (kind === 'shape' && facts.ownShape) pop('shape', b.shape, popup('shape'), { icon: <StarIcon size={15} aria-hidden />, className: 'w-72 p-2.5' })
    if (kind === 'box') {
      add('stack', <PanelButton id="stack" label={b.autoLayout} icon={<RowsIcon size={15} aria-hidden />} />)
      pop('box', b.box, popup('box'), { icon: <FrameCornersIcon size={15} aria-hidden />, className: 'w-72 p-2.5' })
    }
  }

  if (facts.masks) pop('mask', b.mask, popup('mask'), { icon: <MaskHappyIcon size={15} aria-hidden />, className: 'w-72 p-2.5' })

  // Every selection: its effects, how much it shows through, and where it is.
  divider()
  add('effects', <PanelButton id="effects" label={p.effects} icon={<SparkleIcon size={15} aria-hidden />} />)
  pop('transparency', b.transparency, popup('transparency'), { face: <CircleHalfIcon size={17} aria-hidden />, className: 'w-72 p-2.5' })
  add('position', <PanelButton id="position" label={b.position} />)

  // Several layers: lining them up and spreading them, combining shapes, and stacking them.
  if (several) {
    const act = (action: ShortcutAction) => target.editor.perform(action)
    divider()
    pop('line-up', b.lineUp, (
      <>
        <AlignRow editor={target.editor} />
        <div className={MENU_DIVIDER} />
        {DISTRIBUTE.map(({ action }) => (
          <button key={action} type="button" data-action={action} disabled={target.ids.length < 3} onClick={() => act(action)} className={MENU_ITEM}>
            {a[action]}
            <kbd className={MENU_KEY}>{keyOf(action)}</kbd>
          </button>
        ))}
      </>
    ), { icon: <AlignLeftIcon size={15} aria-hidden />, className: 'min-w-56' })
    if (kind === 'shape') {
      pop('combine', b.combine, (
        <>
          {COMBINE.map(({ action, icon: Icon }) => (
            <button key={action} type="button" data-action={action} onClick={() => act(action)} className={MENU_ITEM}>
              <span className="flex items-center gap-2"><Icon size={16} aria-hidden />{a[action]}</span>
              <kbd className={MENU_KEY}>{keyOf(action)}</kbd>
            </button>
          ))}
        </>
      ), { icon: <UniteSquareIcon size={15} aria-hidden />, className: 'min-w-56' })
    }
    add('autoLayout', <button type="button" data-bar-item data-action="autoLayout" onClick={() => act('autoLayout')} className={BAR_BUTTON}><RowsIcon size={15} aria-hidden />{kind === 'box' ? b.stackTogether : b.autoLayout}</button>)
  }
  return items
}


/**
 * How many of the items fit on the bar's row; the rest go in the second row behind ⋯. Every item
 * is drawn in one of the two rows at all times, so each one's width can be read.
 */
function useFit(row: HTMLElement | null, extra: HTMLElement | null, keys: string, off: boolean) {
  const [fit, setFit] = useState(Infinity)
  useLayoutEffect(() => {
    if (!row || !extra || off) {
      setFit(Infinity)
      return
    }
    const wrapper = row.parentElement
    const measure = () => {
      // The bar's own padding and border take 8 px; each item has 2 px of gap after it; ⋯ is 34 px.
      const room = (wrapper?.clientWidth ?? window.innerWidth) - SIDE * 2 - 8
      // Each item's wrapper draws nothing of its own (display: contents); its button has the width.
      const widths = [...row.children, ...extra.children].filter((el) => el instanceof HTMLElement && el.dataset.item !== undefined).map((el) => ((el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) + 2)
      const total = widths.reduce((sum, w) => sum + w, 0)
      if (total <= room) return setFit(Infinity)
      const more = 34
      let used = 0
      let n = 0
      for (const w of widths) {
        if (used + w > room - more) break
        used += w
        n++
      }
      setFit(n)
    }
    measure()
    const watch = new ResizeObserver(measure)
    if (wrapper) watch.observe(wrapper)
    for (const el of [...row.children, ...extra.children]) watch.observe(el.firstElementChild ?? el)
    return () => watch.disconnect()
  }, [row, extra, keys, off])
  return fit
}

export function TopBar({ editor, brandId }: { editor: Editor; brandId: string }) {
  const ids = useSelection(editor)
  const selected = useTarget(editor, ids)
  // A pop-up or panel belongs to the selection it was opened for.
  const opened = useRef(ids)
  useLayoutEffect(() => {
    if (opened.current === ids) return
    opened.current = ids
    setOpen(null)
  }, [ids])
  // Once nothing is selected, changes go to the format shown again.
  useEffect(() => {
    if (ids.length === 0) setEveryFormat(false)
  }, [ids.length])
  useEffect(() => () => {
    setBar(false)
    setOpen(null)
  }, [])
  if (!selected) return <BarGone />
  return <Bar target={selected.target} design={selected.design} brandId={brandId} />
}

/** With nothing selected there is no bar. */
function BarGone() {
  useLayoutEffect(() => setBar(false), [])
  return null
}

function Bar({ target, design, brandId }: { target: Target; design: Design; brandId: string }) {
  const t = useMessages()
  const items = useItems(target, design, brandId)
  const { open, flyoutEnd } = useEditState()
  const phone = usePhone()
  // Beside an open rail flyout, the bar is centred in the room left at the end side.
  const startAt = !phone && flyoutEnd !== null ? flyoutEnd + 12 : 0
  const [bar, setBarEl] = useState<HTMLDivElement | null>(null)
  const [row, setRow] = useState<HTMLDivElement | null>(null)
  const [extra, setExtra] = useState<HTMLDivElement | null>(null)
  const keys = items.map((item) => item.key).join(' ')
  const fit = useFit(row, extra, keys, phone)
  // A divider never ends the first row or starts the second.
  let shown = Math.min(fit, items.length)
  while (shown > 0 && items[shown - 1]?.key.startsWith('divider')) shown--
  const first = items.slice(0, shown)
  const rest = items.slice(shown).filter((item, i) => !(i === 0 && item.key.startsWith('divider')))
  const overflowing = rest.length > 0
  // The second row is its own: opening it leaves an open panel, which moves down under it.
  const [rowOpen, setRowOpen] = useState(false)
  const overflowOpen = overflowing && (rowOpen || rest.some((item) => item.key === open))
  const focused = useRovingTab(bar)
  // The bar's bottom edge, under the second row when it is open, for what sits under the bar.
  const reported = useRef(-1)
  useLayoutEffect(() => {
    const measure = () => {
      if (!row) return
      const bottom = Math.round((overflowOpen && extra ? extra.offsetTop + extra.offsetHeight : 0) || row.offsetTop + row.offsetHeight) + (bar?.offsetTop ?? 0)
      if (bottom === reported.current) return
      reported.current = bottom
      setBar(true, bottom)
    }
    measure()
    const watch = new ResizeObserver(measure)
    if (bar) watch.observe(bar)
    return () => watch.disconnect()
  }, [bar, row, extra, overflowOpen])
  useLayoutEffect(() => () => setBar(false), [])
  // Each selection's bar starts at its first item, on a phone too, where the bar scrolls sideways.
  const selectionKey = target.ids.join(' ')
  useLayoutEffect(() => {
    if (row) row.scrollLeft = 0
    setRowOpen(false)
  }, [row, selectionKey])
  // A panel whose item has left the bar closes, as a shape's Colour does once it holds a photo.
  useLayoutEffect(() => {
    if (isPanel(open) && !items.some((item) => item.key === open)) setOpen(null)
  }, [open, keys])
  // A pop-up hangs from its item: once the window changes size the item may have moved, so it closes.
  useEffect(() => {
    const onResize = () => {
      const now = editState().open
      if (now !== null && !isPanel(now)) setOpen(null)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Esc closes the bar's second row before anything else, so it never also clears the selection.
  useEffect(() => {
    if (!rowOpen) return
    const onKey = (event: KeyboardEvent) => {
      // A pop-up or panel open from the row closes first, on its own Esc.
      if (event.key !== 'Escape' || editState().open !== null) return
      event.stopImmediatePropagation()
      setRowOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [rowOpen])
  const item = ({ key, node }: Item) => <span key={key} data-item={key} className="contents [&>*]:shrink-0">{node}</span>
  return (
    <div
      ref={setBarEl}
      role="toolbar"
      aria-label={t.editor.bar.topBar}
      data-testid="top-bar"
      data-selection={target.ids.join(' ')}
      onKeyDown={arrowAlong}
      onFocus={focused}
      style={{ insetInlineStart: startAt }}
      className={cn('pointer-events-none absolute end-0 z-20 flex flex-col items-center gap-1.5 px-4 max-sm:px-2', BAR_ROW)}
    >
      <div ref={setRow} className={cn(TOP_BAR, 'pointer-events-auto max-w-full', phone && 'no-scrollbar overflow-x-auto')} data-testid="top-bar-row">
        {first.map(item)}
        {overflowing && (
          <button
            type="button"
            data-bar-item
            aria-label={t.editor.bar.overflow}
            title={t.editor.bar.overflow}
            aria-expanded={overflowOpen}
            data-testid="bar-overflow"
            onClick={() => setRowOpen(!overflowOpen)}
            className={cn(BAR_BUTTON, 'px-1.5')}
          >
            <DotsThreeIcon size={18} weight="bold" aria-hidden />
          </button>
        )}
      </div>
      <div ref={setExtra} data-testid="top-bar-overflow" className={cn(TOP_BAR, 'pointer-events-auto max-w-full flex-wrap justify-center', !overflowOpen && 'invisible absolute', !overflowing && 'hidden')}>
        {rest.map(item)}
      </div>
    </div>
  )
}

