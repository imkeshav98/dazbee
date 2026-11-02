'use client'

// The bar's own buttons for text, as in the mock: the font, the size, the colour, bold, italic, the
// align popover and the effects. Each opens a popover under the bar, but bold and italic, which turn
// on or off. With a range of the text being edited selected, they style that range. With text and
// other layers selected together, the bar offers the text's font only.
import { SparkleIcon, TextAlignCenterIcon, TextAlignJustifyIcon, TextAlignLeftIcon, TextAlignRightIcon, TextBIcon, TextItalicIcon } from '@phosphor-icons/react'
import { useMessages } from '../../lib/i18n/client.tsx'
import { BarPopover } from './bar-popover.tsx'
import { FontChooser, nearest, useFontCatalog, weightsOf } from './font-panel.tsx'
import { EffectsBody, set, shared, TextAlignBody, TextColourBody, textStyle, TextSizeField, type Style, type Target } from './selection-cards.tsx'
import { BAR_DIVIDER, BAR_TOGGLE, MIXED_COLOUR } from './styles.ts'

/** Bold from this weight up, as type designers name their weights. */
const BOLD = 600

/** The Align button shows the alignment the text has, mirrored where the language runs right to left. */
const ALIGN_ICON = {
  start: <TextAlignLeftIcon size={16} aria-hidden className="rtl:-scale-x-100" />,
  center: <TextAlignCenterIcon size={16} aria-hidden />,
  end: <TextAlignRightIcon size={16} aria-hidden className="rtl:-scale-x-100" />,
  justify: <TextAlignJustifyIcon size={16} aria-hidden />,
}

export function TextBar({ target, brandId, open, onOpen }: { target: Target; brandId: string; open: string | null; onOpen: (id: string | null) => void }) {
  const t = useMessages()
  const p = t.editor.props
  const b = t.editor.bar
  const { catalog, refresh } = useFontCatalog(brandId)
  const onlyText = target.types.every((type) => type === 'text')
  const texts = onlyText ? textStyle(target).styles : target.props.flatMap((pr, i) => (target.types[i] === 'text' ? [pr.style as Style] : []))
  const family = shared(texts.map((s) => s.fontFamily))
  const size = shared(texts.map((s) => s.fontSize))
  const color = shared(texts.map((s) => s.color))
  const align = shared(target.props.map((pr) => (pr.align ?? 'start') as keyof typeof ALIGN_ICON))
  const bolds = texts.map((s) => s.fontWeight >= BOLD)
  const bold = bolds.every(Boolean) ? true : bolds.some(Boolean) ? 'mixed' : false
  // Bold on is each family's weight nearest Bold; off, its weight nearest Regular.
  const weightFor = (fontFamily: string, on: boolean) => {
    const weights = weightsOf(catalog.find((f) => f.family === fontFamily)).filter((w) => (on ? w >= BOLD : w < BOLD))
    return weights.length > 0 ? nearest(weights, on ? 700 : 400) : null
  }
  const canBold = texts.every((s) => weightFor(s.fontFamily, bold !== true) !== null)
  const italics = texts.map((s) => s.fontStyle === 'italic')
  const italic = italics.every(Boolean) ? true : italics.some(Boolean) ? 'mixed' : false
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
  const toggleItalic = () => textStyle(target).setStyle('fontStyle', italic === true ? 'normal' : 'italic')
  const done = () => onOpen(null)
  const font = (
    <BarPopover id="font" open={open} onOpen={onOpen} label={b.font} face={<span className="max-w-28 truncate">{family === 'mixed' ? t.editor.fonts.mixed : family}</span>} testId="font" className="w-auto">
      <FontChooser editor={target.editor} brandId={brandId} catalog={catalog} refresh={refresh} onDone={done} />
    </BarPopover>
  )
  if (!onlyText) return <>{font}<span aria-hidden className={BAR_DIVIDER} /></>
  return (
    <>
      {font}
      <BarPopover id="size" open={open} onOpen={onOpen} label={p.fontSize} face={<span className="tabular-nums">{size === 'mixed' ? t.editor.fonts.mixed : Math.round(size * 10) / 10}</span>} testId="size" className="w-48">
        <TextSizeField target={target} p={p} />
      </BarPopover>
      <BarPopover id="colour" open={open} onOpen={onOpen} label={p.textColour} face={<span aria-hidden className="size-4 rounded-full border border-line-strong" style={{ background: color === 'mixed' ? MIXED_COLOUR : color.slice(0, 7) }} />} testId="colour" className="w-auto">
        <TextColourBody target={target} brandId={brandId} p={p} />
      </BarPopover>
      <span aria-hidden className={BAR_DIVIDER} />
      <button
        type="button"
        data-bar-item
        aria-label={b.bold}
        title={b.bold}
        aria-pressed={bold}
        disabled={!canBold}
        onClick={toggleBold}
        data-testid="bar-bold"
        className={BAR_TOGGLE}
      >
        <TextBIcon size={16} weight="bold" aria-hidden />
      </button>
      <button type="button" data-bar-item aria-label={b.italic} title={b.italic} aria-pressed={italic} onClick={toggleItalic} data-testid="bar-italic" className={BAR_TOGGLE}>
        <TextItalicIcon size={16} weight="bold" aria-hidden />
      </button>
      <BarPopover id="align" open={open} onOpen={onOpen} label={b.align} face={ALIGN_ICON[align === 'mixed' ? 'start' : align]} testId="align" className="w-auto">
        <TextAlignBody target={target} p={p} />
      </BarPopover>
      <span aria-hidden className={BAR_DIVIDER} />
      <BarPopover id="effects" open={open} onOpen={onOpen} label={p.effects} icon={<SparkleIcon size={15} aria-hidden />} testId="effects" className="w-80 pt-4">
        <EffectsBody target={target} p={p} />
      </BarPopover>
      <span aria-hidden className={BAR_DIVIDER} />
    </>
  )
}
