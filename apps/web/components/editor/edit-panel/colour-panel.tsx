'use client'

// The Colour panel: the brand kit's and the design's colours, any paint by +, and every fill under
// Advanced; its colour choices are the picked frame's Background panel's too.
import { ImageSquareIcon, PlusIcon } from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'

import { withImage } from '@dazbee/editor'
import {
  boundFillIndex,
  brandRef,
  changeFill,
  type Design,
  type Paint,
  paintColour,
  showingFillIndex,
} from '@dazbee/schema'

import { useBrandKit } from '@/components/brand-kit/use-brand-kit.ts'
import { ImagePickerButton } from '@/components/editor/image-tool.tsx'
import { PaintEditor, PaintRow } from '@/components/editor/paint-stack.tsx'
import { ListBody } from '@/components/editor/reorder-list.tsx'
import { PANEL_BUTTON, PICKED_RING, SWATCH, SWATCHES } from '@/components/editor/styles.ts'
import { FOCUS_RING } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { hexChange, hexOf } from '@/lib/colour.ts'
import { designColours } from '@/lib/editor/design-colours.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format, type Messages } from '@/lib/i18n/index.ts'

import { ColorField, PanelPart } from './fields.tsx'
import { kindOf, type P, type PanelProps, set, shared, type Style, type Target, textStyle } from './target.ts'

export const NEW_FILL: Paint = { type: 'solid', color: '#D9D9D9FF' }

/** A fill + adds over others: a see-through wash, so what was there still shows through it. */
export const FILL_ON_TOP: Paint = { type: 'solid', color: '#00000033' }

/** The Colour panel: text's colour for text, else the colour of the fill that shows. */
export function ColourPanel({ target, design, brandId }: PanelProps) {
  const t = useMessages()
  const p = t.editor.props
  return kindOf(target) === 'text' ? (
    <TextColourPanel target={target} design={design} brandId={brandId} p={p} b={t.editor.bar} />
  ) : (
    <FillColourPanel target={target} design={design} brandId={brandId} p={p} b={t.editor.bar} />
  )
}

/** The fills, under Advanced with + in its heading: the Colour panel's, and a photo's in its Edit image panel. */
export function FillsCard({
  target,
  brandId,
  p,
  b,
  children,
}: {
  target: Target
  brandId: string
  p: P
  b: Messages['editor']['bar']
  children?: ReactNode
}) {
  return (
    <PanelPart id="fill-card" title={b.advanced} strong>
      {children}
      <FillBody target={target} brandId={brandId} p={p} title={b.colourPanel.fills} />
    </PanelPart>
  )
}

/**
 * The colours to pick from, simple first: the brand kit's, which `onBrand` binds to (paint without
 * it), and the colours already in the design, with + first, which opens `picker` under them: any
 * colour, or for shapes, boxes and a frame's background a gradient or an image too.
 */
export function ColourChoices({
  design,
  brandId,
  p,
  b,
  current,
  paint,
  onBrand,
  picker,
}: {
  design: Design
  brandId: string
  p: P
  b: Messages['editor']['bar']
  current: string | 'mixed' | undefined
  paint: (hex: string) => void
  onBrand?: (token: string, hex: string) => void
  picker: ReactNode
}) {
  const [picking, setPicking] = useState(false)
  const kit = (useBrandKit(brandId)?.colors.length ?? 0) > 0
  const now = current && current !== 'mixed' ? hexOf(current).toUpperCase() : null
  return (
    <>
      <PanelPart id="brand-colours" title={kit ? b.colourPanel.brandKit : p.colours}>
        <Swatches brandId={brandId} p={p} current={current} paint={paint} onBrand={onBrand} />
      </PanelPart>
      <PanelPart id="design-colours" title={b.colourPanel.inDesign}>
        <div role="group" aria-label={b.colourPanel.inDesign} className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-label={b.colourPanel.pick}
            title={b.colourPanel.pick}
            aria-pressed={picking}
            data-testid="colour-pick"
            onClick={() => setPicking(!picking)}
            className={cn(
              'grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-full border border-dashed border-line-strong text-muted transition-colors hover:border-accent hover:text-text aria-pressed:border-accent aria-pressed:text-accent-text',
              FOCUS_RING,
            )}
          >
            <PlusIcon size={12} weight="bold" aria-hidden />
          </button>
          {designColours(design).map((hex) => (
            <Swatch key={hex} color={hex} label={hex} on={now === hex} onPick={() => paint(hex)} />
          ))}
        </div>
        {picking && (
          <div className="rounded-[12px] border border-line" data-testid="colour-picker">
            {picker}
          </div>
        )}
      </PanelPart>
    </>
  )
}

/** The Colour panel of text: the kit's and the design's colours, and + with any colour by its hex and how much shows. */
function TextColourPanel({
  target,
  design,
  brandId,
  p,
  b,
}: {
  target: Target
  design: Design
  brandId: string
  p: P
  b: Messages['editor']['bar']
}) {
  const { style, setStyle } = textStyle(target)
  const color = style('color') as string | 'mixed'
  // A range's colour builds on its first character's, as a layer's on its own.
  const first = (target.range?.[0]?.color as string | undefined) ?? ''
  const paint = (hex: string) =>
    target.range
      ? setStyle('color', hexChange(hex)(first))
      : set(target, (now) => ({
          style: { ...(now.style as Style), color: hexChange(hex)((now.style as Style).color) },
        }))
  return (
    <ColourChoices
      design={design}
      brandId={brandId}
      p={p}
      b={b}
      current={color}
      paint={paint}
      onBrand={(token, hex) => (target.range ? paint(hex) : target.editor.bindSelection('color', brandRef(token)))}
      picker={
        <div className="p-3">
          <ColorField
            name={p.textColour}
            value={color}
            onSet={(to) =>
              target.range
                ? setStyle('color', to(first))
                : set(target, (now) => ({ style: { ...(now.style as Style), color: to((now.style as Style).color) } }))
            }
          />
        </div>
      }
    />
  )
}

/**
 * The Colour panel of shapes and boxes: the kit's and the design's colours, which paint the fill
 * that shows, + with any paint for it, Add image for layers without one, then every fill under
 * Advanced.
 */
function FillColourPanel({
  target,
  design,
  brandId,
  p,
  b,
}: {
  target: Target
  design: Design
  brandId: string
  p: P
  b: Messages['editor']['bar']
}) {
  // The fill a colour paints: the topmost solid one that shows.
  const shown = shared(
    target.props.map((pr) => {
      const fills = (pr.fills ?? []) as Paint[]
      const fill = fills[boundFillIndex(fills)]
      return fill?.type === 'solid' ? fill.color : undefined
    }),
  )
  const paint = (hex: string) =>
    set(target, (now) => {
      const fills = (now.fills ?? []) as Paint[]
      return { fills: changeFill(fills, boundFillIndex(fills), paintColour(hex), NEW_FILL) }
    })
  // The picker edits the topmost fill that shows, whatever its type, so a gradient picked stays the one it shows.
  const pickFill = (to: (now: Paint) => Paint) =>
    set(target, (now) => {
      const fills = (now.fills ?? []) as Paint[]
      return { fills: changeFill(fills, showingFillIndex(fills), to, NEW_FILL) }
    })
  // A picture goes into layers that have none; one that has a picture changes it with Replace on the bar.
  const pictureless = target.props.every((pr) => !((pr.fills ?? []) as Paint[]).some((f) => f.type === 'image'))
  const firstFills = (target.props[0]?.fills ?? []) as Paint[]
  const first = firstFills[showingFillIndex(firstFills)] ?? NEW_FILL
  return (
    <>
      <ColourChoices
        design={design}
        brandId={brandId}
        p={p}
        b={b}
        current={shown}
        paint={paint}
        onBrand={(token) => target.editor.bindSelection('color', brandRef(token))}
        picker={<PaintEditor paint={first} brandId={brandId} editor={target.editor} p={p} onSet={pickFill} />}
      />
      {pictureless && (
        <ImagePickerButton
          brandId={brandId}
          title={p.addImageTitle}
          testId="add-image"
          className={PANEL_BUTTON}
          onPick={(asset) => set(target, (now) => ({ fills: withImage((now.fills ?? []) as Paint[], asset.id) }))}
        >
          <ImageSquareIcon size={14} aria-hidden className="shrink-0" />
          <span aria-hidden>{p.addImage}</span>
        </ImagePickerButton>
      )}
      <FillsCard target={target} brandId={brandId} p={p} b={b} />
    </>
  )
}

/**
 * The colours a look card offers: the brand's own, which the layers then follow (change the colour
 * in the kit and they change too), or, with no kit colours, a fixed set painted as it is.
 */
function Swatches({
  brandId,
  p,
  current,
  paint,
  onBrand,
}: {
  brandId: string
  p: P
  current: string | 'mixed' | undefined
  paint: (hex: string) => void
  onBrand?: ((token: string, hex: string) => void) | undefined
}) {
  const kit = useBrandKit(brandId)
  const now = current && current !== 'mixed' ? hexOf(current).toUpperCase() : null
  const colors = kit?.colors ?? []
  // The colour it has now leads the row when the row does not hold it, as in the mock.
  const offered = colors.length > 0 ? colors.map((c) => hexOf(c.value).toUpperCase()) : [...SWATCHES]
  return (
    <div
      role="group"
      aria-label={colors.length > 0 ? p.brandColours : p.colours}
      className="flex flex-wrap items-center gap-1.5"
    >
      {now && !offered.includes(now) && (
        <Swatch color={now} label={format(p.currentColour, { hex: now })} on onPick={() => undefined} />
      )}
      {colors.length > 0
        ? colors.map((c) => (
            <Swatch
              key={c.token}
              color={hexOf(c.value)}
              label={c.name}
              on={now === hexOf(c.value).toUpperCase()}
              onPick={() => (onBrand ? onBrand(c.token, hexOf(c.value)) : paint(hexOf(c.value)))}
            />
          ))
        : SWATCHES.map((hex) => (
            <Swatch key={hex} color={hex} label={hex} on={now === hex} onPick={() => paint(hex)} />
          ))}
    </div>
  )
}

/** A swatch of the look cards: round, ringed while it is the colour. */
function Swatch({ color, label, on, onPick }: { color: string; label: string; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={onPick}
      style={{ backgroundColor: color }}
      className={cn(SWATCH, 'size-[22px]', on && PICKED_RING)}
    />
  )
}

/** The fill list, under a heading with +, each fill with its editor. */
function FillBody({ target, brandId, p, title }: { target: Target; brandId: string; p: P; title: string }) {
  return (
    <ListBody<Paint>
      title={title}
      p={p}
      target={target}
      field="fills"
      fresh={NEW_FILL}
      onTop={FILL_ON_TOP}
      topFirst
      item={p.fill}
      testId="fill-list"
      render={(paint, n, change) => (
        <PaintRow
          paint={paint}
          name={format(p.colour, { n })}
          brandId={brandId}
          editor={target.editor}
          p={p}
          onSet={change}
        />
      )}
    />
  )
}
