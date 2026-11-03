'use client'

import { withImage } from '@dazbee/editor'
import { type ImageAdjust, ImageFilter, type Paint } from '@dazbee/schema'

import { ImagePickerButton } from '@/components/editor/image-tool.tsx'
import { assetThumbnail } from '@/components/editor/paint-stack.tsx'
import { CHIP } from '@/components/editor/styles.ts'
import { FOCUS_RING } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { tidy } from '@/lib/editor/size.ts'
import { type Messages } from '@/lib/i18n/index.ts'

import { Card, clamp, NumberField, Segments } from './fields.tsx'
import { type ImageFill, type P, set, type Target } from './target.ts'

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

/** The bar's Look popover for a photo: each filter as the photo with it. */
export function PhotoLookBody({
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

/** How the photo fits its layer, as a row under the header card's box: fill it, crop it, fit inside it, or tile it. */
export function FitRow({ target, p, index, paint }: { target: Target; p: P; index: number; paint: ImageFill }) {
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

/**
 * The photo's adjustments as slider fields, one to a row, each filling from 0 either way: its light,
 * contrast, saturation, warmth and tint; then how much of the image shows.
 */
export function AdjustCard({ target, p, index, paint }: { target: Target; p: P; index: number; paint: ImageFill }) {
  const setPaint = (change: (now: ImageFill) => Partial<ImageFill>) => setImage(target, index, change)
  const setAdjust = (key: keyof ImageAdjust, to: (n: number) => number) =>
    setPaint((now) => {
      const adjust = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, ...now.adjust }
      return { adjust: { ...adjust, [key]: Math.round(clamp(to(adjust[key]), -100, 100)) } }
    })
  return (
    <Card id="adjust-card" title={p.adjustTitle}>
      <div className="grid gap-1.5">
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
    </Card>
  )
}

/** Several photos with the same picture: Replace and the filters, which one photo has on its bar. */
export function PhotosCard({
  target,
  p,
  b,
  brandId,
  index,
  paint,
}: {
  target: Target
  p: P
  b: Messages['editor']['bar']
  brandId: string
  index: number
  paint: ImageFill
}) {
  return (
    <Card
      id="photos-card"
      title={b.filters}
      action={
        <ImagePickerButton
          brandId={brandId}
          title={p.replaceImageTitle}
          testId="replace-image"
          className={cn(CHIP, FOCUS_RING, 'shrink-0')}
          onPick={(asset) => set(target, (now) => ({ fills: withImage((now.fills ?? []) as Paint[], asset.id) }))}
        >
          <span aria-hidden>{p.replaceImage}</span>
        </ImagePickerButton>
      }
    >
      <PhotoLookBody target={target} p={p} brandId={brandId} index={index} paint={paint} />
    </Card>
  )
}
