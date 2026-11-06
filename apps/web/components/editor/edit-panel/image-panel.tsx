'use client'

// The Edit image panel of a photo: its filters, its adjustments and how much of it shows, then under
// Advanced how it fits and every fill.
import { type ImageAdjust, ImageFilter, type Paint } from '@dazbee/schema'

import { assetThumbnail } from '@/components/editor/paint/paint-stack.tsx'
import { PANEL_HEADING } from '@/components/editor/styles.ts'
import { TOUCH_GAP } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { tidy } from '@/lib/editor/size.ts'
import { useMessages } from '@/lib/i18n/client.tsx'

import { FillsCard } from './colour-panel.tsx'
import { clamp, NumberField, PanelPart, Segments } from './fields.tsx'
import { type ImageFill, imageFillOf, type P, type PanelProps, set, type Target } from './target.ts'

const ADJUSTMENTS = ['exposure', 'contrast', 'saturation', 'temperature', 'tint'] as const

/** Each filter's tile: the image's picture with a CSS look near the one the renderer draws. */
const FILTER_LOOK: Record<ImageFilter, string> = {
  none: 'none',
  mono: 'grayscale(1)',
  sepia: 'sepia(0.85)',
  vivid: 'saturate(1.7) contrast(1.1)',
  fade: 'contrast(0.75) brightness(1.12) saturate(0.75)',
  warm: 'sepia(0.3) saturate(1.35) hue-rotate(-12deg)',
  cool: 'saturate(0.9) hue-rotate(18deg) brightness(1.04)',
}

/** Changes the image fill at `index` of every selected layer. */
const setImage = (target: Target, index: number, change: (now: ImageFill) => Partial<ImageFill>) =>
  set(target, (now) => {
    const fills = (now.fills ?? []) as Paint[]
    const at = fills[index]
    if (at?.type !== 'image') return null
    return { fills: fills.map((f, i) => (i === index ? { ...at, ...change(at) } : f)) }
  })

/** The Edit image panel, for layers whose fill that shows is a photo: its filters, adjustments and fit; Replace is on the bar. */
export function ImagePanel({ target, brandId }: PanelProps) {
  const t = useMessages()
  const p = t.editor.props
  const imageFill = imageFillOf(target)
  if (!imageFill) return null
  return (
    <>
      <PanelPart id="look-card" title={t.editor.bar.filters}>
        <PhotoLookBody target={target} p={p} brandId={brandId} index={imageFill.index} paint={imageFill.paint} />
      </PanelPart>
      <AdjustCard target={target} p={p} index={imageFill.index} paint={imageFill.paint} />
      <FillsCard target={target} brandId={brandId} p={p} b={t.editor.bar}>
        <span className={PANEL_HEADING}>{p.fit}</span>
        <FitRow target={target} p={p} index={imageFill.index} paint={imageFill.paint} />
      </FillsCard>
    </>
  )
}

/** The bar's Look popover for a photo: each filter as the photo with it. */
function PhotoLookBody({
  target,
  p,
  brandId,
  index,
  paint,
}: {
  target: Target
  p: P
  brandId: string
  index: number
  paint: ImageFill
}) {
  const picture = assetThumbnail(brandId, paint.assetId)
  const filter = paint.filter ?? 'none'
  return (
    <div role="radiogroup" aria-label={p.filter} className="grid grid-cols-4 gap-1.5">
      {ImageFilter.options.map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={filter === name}
          onClick={() => setImage(target, index, () => ({ filter: name === 'none' ? undefined : name }))}
          className="group flex min-w-0 cursor-pointer flex-col items-center gap-1 text-[10px] font-semibold text-muted aria-checked:text-text"
        >
          <span className="block aspect-square w-full overflow-hidden rounded-[8px] border border-line group-aria-checked:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]">
            <img
              src={picture}
              alt=""
              draggable={false}
              loading="lazy"
              style={{ filter: FILTER_LOOK[name] }}
              className="size-full object-cover"
            />
          </span>
          <span className="w-full truncate text-center">{p.filters[name]}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * The photo's adjustments as slider fields, one to a row, each filling from 0 either way: its light,
 * contrast, saturation, warmth and tint; then how much of the image shows.
 */
function AdjustCard({ target, p, index, paint }: { target: Target; p: P; index: number; paint: ImageFill }) {
  const setPaint = (change: (now: ImageFill) => Partial<ImageFill>) => setImage(target, index, change)
  const setAdjust = (key: keyof ImageAdjust, to: (n: number) => number) =>
    setPaint((now) => {
      const adjust = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, ...now.adjust }
      return { adjust: { ...adjust, [key]: Math.round(clamp(to(adjust[key]), -100, 100)) } }
    })
  return (
    <PanelPart id="adjust-card" title={p.adjustTitle}>
      <div className={cn('grid gap-1.5', TOUCH_GAP)}>
        {ADJUSTMENTS.map((key) => (
          <NumberField
            key={key}
            label={p.adjust[key]}
            name={p.adjust[key]}
            value={paint.adjust?.[key] ?? 0}
            min={-100}
            max={100}
            editor={target.editor}
            onSet={(v) => setAdjust(key, () => v)}
            onShift={(by) => setAdjust(key, (n) => n + by)}
          />
        ))}
        <NumberField
          label={p.imageOpacity}
          unit="%"
          name={p.imageOpacity}
          value={paint.opacity}
          scale={100}
          min={0}
          max={1}
          editor={target.editor}
          onSet={(v) => setPaint(() => ({ opacity: tidy(v) }))}
          onShift={(by) => setPaint((now) => ({ opacity: tidy(clamp(now.opacity + by, 0, 1)) }))}
        />
      </div>
    </PanelPart>
  )
}

/** How the photo fits its layer, as a row under the header card's box: fill it, crop it, fit inside it, or tile it. */
function FitRow({ target, p, index, paint }: { target: Target; p: P; index: number; paint: ImageFill }) {
  return (
    <Segments
      name={p.fit}
      value={paint.fit}
      options={['fill', 'crop', 'fit', 'tile'] as const}
      labels={p.fits}
      onSet={(fit) => setImage(target, index, () => ({ fit }))}
    />
  )
}
