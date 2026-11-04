'use client'

// Paints as the cards edit them (#219): each row's swatch opens a paint editor that switches it
// between a solid colour, a linear, radial or angular gradient and an image, and edits a gradient's
// stops (add, move, remove, colour and opacity, brand colours too) and its angle or centre. A row
// hides its paint without deleting it, and a gradient or image has its own opacity.
import { EyeIcon, EyeSlashIcon, ImageIcon, MinusIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { useState } from 'react'

import type { Editor } from '@dazbee/editor'
import { type Paint, withAlpha } from '@dazbee/schema'

import { useBrandKit } from '@/components/brand-kit/use-brand-kit.ts'
import { Choice, clamp, ColorField, NumberField } from '@/components/editor/edit-panel/fields.tsx'
import type { P } from '@/components/editor/edit-panel/target.ts'
import { useMenuFocus } from '@/components/editor/top-bar/bar-popover.tsx'
import { FOCUS_RING, SEGMENT, SEGMENTS } from '@/components/ui/looks.ts'
import { brandPath } from '@/lib/brand-routes.ts'
import { cn } from '@/lib/cn.ts'
import { hexOf } from '@/lib/colour.ts'
import { tidy } from '@/lib/editor/size.ts'
import { useLocale } from '@/lib/i18n/client.tsx'
import { dirOf, format } from '@/lib/i18n/index.ts'

import { angleOf, type Gradient, GradientBar, linearAt, type Stop, stopsCss } from './gradient-bar.tsx'
import { ImagePickerButton } from './image-tool.tsx'
import { CHIP, ICON_BUTTON, KNOBS, POPOVER, SWATCH } from './styles.ts'

/** An image asset's small picture, as the API serves it. */
export const assetThumbnail = (brandId: string, assetId: string) => brandPath(brandId, 'assets', assetId, 'thumbnail')
const PAINT_TYPES = ['solid', 'linear', 'radial', 'angular', 'image'] as const
type PaintType = (typeof PAINT_TYPES)[number]

const isGradient = (paint: Paint): paint is Gradient =>
  paint.type === 'linear' || paint.type === 'radial' || paint.type === 'angular'
/** What a paint keeps whatever its kind: its own opacity and whether it shows. */
const keepOf = (paint: Paint) => ({
  ...(paint.opacity === undefined ? {} : { opacity: paint.opacity }),
  ...(paint.visible === undefined ? {} : { visible: paint.visible }),
})
/** A paint as a CSS background, close to what the renderer draws in the layer's box. */
function paintBackground(paint: Paint, brandId: string): string {
  switch (paint.type) {
    case 'solid':
      return `linear-gradient(${paint.color}, ${paint.color})`
    case 'linear':
      return `linear-gradient(${angleOf(paint) + 90}deg, ${stopsCss(paint.stops, 'percent')})`
    case 'radial':
      return `radial-gradient(${tidy(paint.radius * 100)}% ${tidy(paint.radius * 100)}% at ${tidy(paint.center.x * 100)}% ${tidy(paint.center.y * 100)}%, ${stopsCss(paint.stops, 'percent')})`
    case 'angular':
      return `conic-gradient(from ${paint.angle + 90}deg at ${tidy(paint.center.x * 100)}% ${tidy(paint.center.y * 100)}%, ${stopsCss(paint.stops, 'degrees')})`
    case 'image':
      return `url("${assetThumbnail(brandId, paint.assetId)}") center / cover no-repeat`
  }
}

/**
 * The paint a row turns into when its type is switched: the colours carried over where they can
 * be. A solid holds its opacity in its colour, where its row edits it.
 */
function convert(now: Paint, type: Exclude<PaintType, 'image'>): Paint {
  const keep = keepOf(now)
  const stops: Stop[] =
    now.type === 'solid'
      ? [
          { offset: 0, color: now.color },
          { offset: 1, color: withAlpha(now.color, 0) },
        ]
      : now.type === 'image'
        ? [
            { offset: 0, color: '#000000FF' },
            { offset: 1, color: '#FFFFFFFF' },
          ]
        : now.stops
  switch (type) {
    case 'solid': {
      const color =
        now.type === 'solid' ? now.color : now.type === 'image' ? '#D9D9D9FF' : (stops[0]?.color ?? '#D9D9D9FF')
      const alpha = Math.round(Number.parseInt(color.slice(7, 9) || 'FF', 16) * (now.opacity ?? 1))
      return {
        type,
        color: `${hexOf(color)}${alpha.toString(16).padStart(2, '0').toUpperCase()}`,
        ...(now.visible === undefined ? {} : { visible: now.visible }),
      }
    }
    case 'linear':
      return { type, ...linearAt(90), stops, ...keep }
    case 'radial':
      return { type, center: { x: 0.5, y: 0.5 }, radius: 0.5, stops, ...keep }
    case 'angular':
      return { type, center: { x: 0.5, y: 0.5 }, angle: 0, stops, ...keep }
  }
}

/**
 * One paint in a list: its swatch, which opens its editor, then a solid's colour, or a gradient's
 * or image's name and opacity, and a button that hides it or shows it again.
 */
export function PaintRow({
  paint,
  name,
  brandId,
  editor,
  p,
  onSet,
}: {
  paint: Paint
  name: string
  brandId: string
  editor: Editor
  p: P
  onSet: (to: (now: Paint) => Paint) => void
}) {
  const side = dirOf(useLocale()) === 'rtl' ? 'right' : 'left'
  const hidden = paint.visible === false
  const focus = useMenuFocus()
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-1', hidden && 'opacity-50')} data-paint={paint.type}>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            ref={focus.button}
            type="button"
            aria-label={format(p.editPaint, { name })}
            data-testid="paint-swatch"
            className={cn('shrink-0 cursor-pointer rounded-[7px]', FOCUS_RING)}
          >
            <PaintSwatch paint={paint} brandId={brandId} className="size-7" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side={side}
            align="start"
            sideOffset={12}
            collisionPadding={12}
            aria-label={format(p.editPaint, { name })}
            {...focus.content}
            className={cn(POPOVER, 'w-80')}
          >
            {focus.back}
            <PaintEditor paint={paint} brandId={brandId} editor={editor} p={p} onSet={onSet} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {paint.type === 'solid' ? (
        <ColorField
          name={name}
          value={paint.color}
          swatch={false}
          onSet={(to) => onSet((now) => (now.type === 'solid' ? { ...now, color: to(now.color) } : now))}
        />
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">{p.paint[paint.type]}</span>
          <div className="w-[4.5rem] shrink-0">
            <NumberField
              label="%"
              name={format(p.alpha, { name })}
              value={paint.opacity ?? 1}
              scale={100}
              min={0}
              max={1}
              editor={editor}
              onSet={(v) => onSet((now) => ({ ...now, opacity: tidy(v) }))}
              onShift={(by) => onSet((now) => ({ ...now, opacity: tidy(clamp((now.opacity ?? 1) + by, 0, 1)) }))}
            />
          </div>
        </>
      )}
      <button
        type="button"
        aria-label={format(hidden ? p.showPaint : p.hidePaint, { name })}
        title={format(hidden ? p.showPaint : p.hidePaint, { name })}
        data-testid="paint-visible"
        onClick={() =>
          onSet((now) => {
            if (now.visible !== false) return { ...now, visible: false }
            const shown: Paint = { ...now }
            delete shown.visible
            return shown
          })
        }
        className={ICON_BUTTON}
      >
        {hidden ? <EyeSlashIcon size={14} aria-hidden /> : <EyeIcon size={14} aria-hidden />}
      </button>
    </div>
  )
}

/** One paint's editor: its type, then a solid's colour, a gradient's stops and shape, or an image. */
export function PaintEditor({
  paint,
  brandId,
  editor,
  p,
  onSet,
}: {
  paint: Paint
  brandId: string
  editor: Editor
  p: P
  onSet: (to: (now: Paint) => Paint) => void
}) {
  const [picked, setPicked] = useState(0)
  const stop = isGradient(paint) ? paint.stops[Math.min(picked, paint.stops.length - 1)] : undefined
  const setGradient = (to: (now: Gradient) => Gradient) => onSet((now) => (isGradient(now) ? to(now) : now))
  const setStopColour = (color: (now: string | undefined) => string) =>
    setGradient((now) => ({
      ...now,
      stops: now.stops.map((s, j) =>
        j === Math.min(picked, now.stops.length - 1) ? { ...s, color: color(s.color) } : s,
      ),
    }))
  const pct = (n: number) => tidy(n * 100)
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="paint-editor">
      <div role="radiogroup" aria-label={p.paintType} className={SEGMENTS}>
        {PAINT_TYPES.map((type) => {
          const on = paint.type === type
          const label = type === 'solid' ? p.solid : p.paint[type]
          if (type === 'image' && !on) {
            return (
              <ImagePickerButton
                key={type}
                brandId={brandId}
                title={p.paint.image}
                testId="paint-image"
                className={SEGMENT}
                onPick={(asset) =>
                  onSet((now) => ({ type: 'image', assetId: asset.id, fit: 'fill', opacity: 1, ...keepOf(now) }))
                }
              >
                <span aria-hidden>{p.paintShort.image}</span>
              </ImagePickerButton>
            )
          }
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={label}
              data-paint-type={type}
              onClick={() => type !== 'image' && !on && onSet((now) => convert(now, type))}
              className={SEGMENT}
            >
              <span aria-hidden>{p.paintShort[type]}</span>
            </button>
          )
        })}
      </div>
      {paint.type === 'solid' && (
        <>
          <ColorField
            name={p.paintColour}
            value={paint.color}
            onSet={(to) => onSet((now) => (now.type === 'solid' ? { ...now, color: to(now.color) } : now))}
          />
          <BrandColours
            brandId={brandId}
            label={p.brandColours}
            onPick={(color) => onSet((now) => (now.type === 'solid' ? { ...now, color } : now))}
          />
        </>
      )}
      {isGradient(paint) && (
        <>
          <GradientBar paint={paint} picked={picked} onPick={setPicked} editor={editor} p={p} onSet={setGradient} />
          <div className="flex items-center gap-1">
            <ColorField
              name={format(p.stopColour, { n: Math.min(picked, paint.stops.length - 1) + 1 })}
              value={stop?.color}
              onSet={setStopColour}
            />
            <button
              type="button"
              aria-label={p.removeStop}
              title={p.removeStop}
              disabled={paint.stops.length <= 2}
              onClick={() => {
                setGradient((now) => ({
                  ...now,
                  stops: now.stops.filter((_, j) => j !== Math.min(picked, now.stops.length - 1)),
                }))
                setPicked(Math.max(0, picked - 1))
              }}
              className={ICON_BUTTON}
            >
              <MinusIcon size={14} aria-hidden />
            </button>
          </div>
          <BrandColours brandId={brandId} label={p.brandColours} onPick={(color) => setStopColour(() => color)} />
          <div className={KNOBS}>
            {paint.type === 'linear' && (
              <NumberField
                label="∠"
                name={p.gradientAngle}
                value={angleOf(paint)}
                unit="°"
                editor={editor}
                onSet={(v) => setGradient((now) => ({ ...now, ...linearAt(v) }))}
                onShift={(by) =>
                  setGradient((now) => (now.type === 'linear' ? { ...now, ...linearAt(angleOf(now) + by) } : now))
                }
              />
            )}
            {(paint.type === 'radial' || paint.type === 'angular') && (
              <>
                <NumberField
                  label="X"
                  name={p.gradientX}
                  value={pct(paint.center.x)}
                  min={0}
                  max={100}
                  unit="%"
                  editor={editor}
                  onSet={(v) =>
                    setGradient((now) =>
                      now.type === 'linear' ? now : { ...now, center: { ...now.center, x: tidy(v / 100) } },
                    )
                  }
                  onShift={(by) =>
                    setGradient((now) =>
                      now.type === 'linear'
                        ? now
                        : { ...now, center: { ...now.center, x: tidy(clamp(now.center.x + by / 100, 0, 1)) } },
                    )
                  }
                />
                <NumberField
                  label="Y"
                  name={p.gradientY}
                  value={pct(paint.center.y)}
                  min={0}
                  max={100}
                  unit="%"
                  editor={editor}
                  onSet={(v) =>
                    setGradient((now) =>
                      now.type === 'linear' ? now : { ...now, center: { ...now.center, y: tidy(v / 100) } },
                    )
                  }
                  onShift={(by) =>
                    setGradient((now) =>
                      now.type === 'linear'
                        ? now
                        : { ...now, center: { ...now.center, y: tidy(clamp(now.center.y + by / 100, 0, 1)) } },
                    )
                  }
                />
              </>
            )}
            {paint.type === 'radial' && (
              <NumberField
                label="R"
                name={p.gradientSize}
                value={pct(paint.radius)}
                min={1}
                unit="%"
                editor={editor}
                onSet={(v) =>
                  setGradient((now) => (now.type === 'radial' ? { ...now, radius: tidy(Math.max(1, v) / 100) } : now))
                }
                onShift={(by) =>
                  setGradient((now) =>
                    now.type === 'radial' ? { ...now, radius: tidy(Math.max(0.01, now.radius + by / 100)) } : now,
                  )
                }
              />
            )}
            {paint.type === 'angular' && (
              <NumberField
                label="∠"
                name={p.gradientAngle}
                value={paint.angle}
                unit="°"
                editor={editor}
                onSet={(v) => setGradient((now) => (now.type === 'angular' ? { ...now, angle: v } : now))}
                onShift={(by) =>
                  setGradient((now) => (now.type === 'angular' ? { ...now, angle: now.angle + by } : now))
                }
              />
            )}
          </div>
        </>
      )}
      {paint.type === 'image' && (
        <div className="flex items-center gap-2">
          <PaintSwatch paint={paint} brandId={brandId} className="size-12 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <ImagePickerButton
              brandId={brandId}
              title={p.replaceImageTitle}
              testId="paint-replace-image"
              className={cn(CHIP, FOCUS_RING, 'self-start')}
              onPick={(asset) => onSet((now) => (now.type === 'image' ? { ...now, assetId: asset.id } : now))}
            >
              <ImageIcon size={12} aria-hidden />
              <span aria-hidden>{p.replaceImage}</span>
            </ImagePickerButton>
            <Choice
              name={p.fit}
              value={paint.fit}
              options={['fill', 'fit', 'crop', 'tile'] as const}
              labels={p.fits}
              onSet={(fit) => onSet((now) => (now.type === 'image' ? { ...now, fit } : now))}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** A paint's swatch over a checkerboard, so a see-through paint shows as one. */
function PaintSwatch({ paint, brandId, className }: { paint: Paint; brandId: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('checker relative block overflow-hidden rounded-row border border-line-strong', className)}
    >
      <span
        className="absolute inset-0"
        style={{ background: paintBackground(paint, brandId), opacity: paint.opacity ?? 1 }}
      />
    </span>
  )
}

/** The brand's colours as small round buttons that pick one. */
function BrandColours({ brandId, label, onPick }: { brandId: string; label: string; onPick: (color: string) => void }) {
  const colors = useBrandKit(brandId)?.colors ?? []
  if (colors.length === 0) return null
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {colors.map((c) => (
        <button
          key={c.token}
          type="button"
          aria-label={`${c.name} ${hexOf(c.value)}`}
          title={c.name}
          onClick={() => onPick(c.value)}
          style={{ backgroundColor: c.value }}
          className={cn(SWATCH, 'size-6', FOCUS_RING)}
        />
      ))}
    </div>
  )
}
