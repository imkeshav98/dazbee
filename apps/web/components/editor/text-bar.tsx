'use client'

// The bar's own buttons for text, as in the mock: the font, the size, the colour, bold, the align
// popover and the effects. Each opens a popover under the bar, but bold, which turns on or off.
import { SparkleIcon, TextAlignLeftIcon, TextBIcon } from '@phosphor-icons/react'
import { useMessages } from '../../lib/i18n/client.tsx'
import { BarPopover } from './bar-popover.tsx'
import { FontChooser, nearest, useFontCatalog, weightsOf } from './font-panel.tsx'
import { EffectsBody, TextAlignBody, TextColourBody, TextSizeField, type Target } from './selection-cards.tsx'
import { BAR_DIVIDER, BAR_TOGGLE } from './styles.ts'

type TextStyle = { fontFamily: string; fontWeight: number; fontSize: number; color: string }

/** The value every layer shares, or null where they differ. */
const same = <T,>(values: T[]) => (values.every((v) => v === values[0]) ? values[0] ?? null : null)

/** Bold from this weight up, as type designers name their weights. */
const BOLD = 600

export function TextBar({ target, brandId, open, onOpen }: { target: Target; brandId: string; open: string | null; onOpen: (id: string | null) => void }) {
  const t = useMessages()
  const p = t.editor.props
  const b = t.editor.bar
  const { catalog } = useFontCatalog(brandId)
  const styles = target.props.map((pr) => pr.style as TextStyle)
  const family = same(styles.map((s) => s.fontFamily))
  const size = same(styles.map((s) => s.fontSize))
  const color = same(styles.map((s) => s.color))
  const bold = styles.every((s) => s.fontWeight >= BOLD)
  const weights = weightsOf(catalog.find((f) => f.family === family))
  const canBold = family !== null && weights.some((w) => w >= BOLD) && weights.some((w) => w < BOLD)
  const done = () => onOpen(null)
  return (
    <>
      <BarPopover id="font" open={open} onOpen={onOpen} label={b.font} face={<span className="max-w-28 truncate">{family ?? t.editor.fonts.mixed}</span>} testId="font" className="w-auto">
        <FontChooser editor={target.editor} brandId={brandId} onDone={done} />
      </BarPopover>
      <BarPopover id="size" open={open} onOpen={onOpen} label={p.fontSize} face={<span className="tabular-nums">{size === null ? t.editor.fonts.mixed : Math.round(size * 10) / 10}</span>} testId="size" className="w-48">
        <TextSizeField target={target} p={p} />
      </BarPopover>
      <BarPopover id="colour" open={open} onOpen={onOpen} label={p.textColour} face={<span aria-hidden className="size-4 rounded-full border border-line-strong" style={{ background: color ? color.slice(0, 7) : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }} />} testId="colour" className="w-auto">
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
        onClick={() => family && target.editor.setFont(family, nearest(weights, bold ? 400 : 700))}
        data-testid="bar-bold"
        className={BAR_TOGGLE}
      >
        <TextBIcon size={16} weight="bold" aria-hidden />
      </button>
      <BarPopover id="align" open={open} onOpen={onOpen} label={b.align} face={<TextAlignLeftIcon size={16} aria-hidden />} testId="align" className="w-auto">
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
