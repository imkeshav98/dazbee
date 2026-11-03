'use client'

// The Colour panel: the brand kit's and the design's colours, any paint by +, and every fill under
// Advanced; and the page's Background panel, built the same way.
import { ImageSquareIcon, PlusIcon } from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'

import { type Editor, withImage } from '@dazbee/editor'
import { boundFillIndex, brandRef, type Design, type Paint } from '@dazbee/schema'

import { useBrandKit } from '@/components/brand-kit/use-brand-kit.ts'
import { ImagePickerButton } from '@/components/editor/image-tool.tsx'
import { AddButton, PaintEditor, PaintRow, Stack } from '@/components/editor/paint-stack.tsx'
import { ListBody } from '@/components/editor/reorder-list.tsx'
import { FIELD_LABEL, PANEL_BUTTON, PICKED_RING, SWATCH, SWATCHES } from '@/components/editor/styles.ts'
import { FOCUS_RING } from '@/components/ui/looks.ts'
import { cn } from '@/lib/cn.ts'
import { designColours } from '@/lib/editor/design-colours.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format, type Messages } from '@/lib/i18n/index.ts'

import { ColorField, PanelPart } from './fields.tsx'
import { kindOf, type P, type PanelProps, set, shared, type Style, type Target, textStyle } from './target.ts'

const NEW_FILL: Paint = { type: 'solid', color: '#D9D9D9FF' }

/** A fill + adds over others: a see-through wash, so what was there still shows through it. */
const FILL_ON_TOP: Paint = { type: 'solid', color: '#00000033' }

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

/**
 * The picked page's Background panel: the kit's and the design's colours, which paint its top fill
 * that shows, + with any paint for it, then its background layers under Advanced. It changes the
 * page in every size, and has no brand binding: a kit colour paints as it is.
 */
export function BackgroundBody({
  editor,
  design,
  pageId,
  brandId,
}: {
  editor: Editor
  design: Design
  pageId: string
  brandId: string
}) {
  const t = useMessages()
  const p = t.editor.props
  const b = t.editor.bar
  const g = t.editor.page
  const fills = design.pages[pageId]?.fills ?? []
  // Each change runs on the page's fills as the document holds them then.
  const writeFills = (to: (now: Paint[]) => Paint[]) =>
    editor.session.run('page.update', { id: pageId, fills: to(editor.design().pages[pageId]?.fills ?? []) })
  const bound = fills[boundFillIndex(fills)]
  const paint = (hex: string) =>
    writeFills((now) => {
      const i = boundFillIndex(now)
      const solid: Paint = { type: 'solid', color: `${hex.toUpperCase()}FF` }
      return i < 0
        ? [...now, solid]
        : now.map((f, j) => (j === i ? (f.type === 'solid' ? { ...f, color: solid.color } : solid) : f))
    })
  // The picker edits the topmost fill that shows, whatever its type, as the Colour panel's does.
  const showing = (now: Paint[]) => now.findLastIndex((f) => f.visible !== false)
  const pickFill = (to: (now: Paint) => Paint) =>
    writeFills((now) => {
      const i = showing(now)
      return i < 0 ? [...now, to(NEW_FILL)] : now.map((f, j) => (j === i ? to(f) : f))
    })
  return (
    <>
      <ColourChoices
        design={design}
        brandId={brandId}
        p={p}
        b={b}
        current={bound?.type === 'solid' ? bound.color : undefined}
        paint={paint}
        picker={
          <PaintEditor
            paint={fills[showing(fills)] ?? NEW_FILL}
            brandId={brandId}
            editor={editor}
            p={p}
            onSet={pickFill}
          />
        }
      />
      <PanelPart id="background-card" title={b.advanced} strong>
        <div className="flex flex-col gap-2" data-testid="page-fills">
          <div className={cn('flex items-center justify-between', FIELD_LABEL)}>
            {g.layers}
            <AddButton
              label={g.addLayer}
              onClick={() =>
                writeFills((now) => [...now, now.length === 0 ? { type: 'solid', color: '#FFFFFFFF' } : FILL_ON_TOP])
              }
            />
          </div>
          <Stack
            items={fills}
            field="fills"
            topFirst
            removeLabel={(n) => format(p.remove, { name: g.layer, n })}
            onWrite={writeFills}
            render={(item, n, change) => (
              <PaintRow
                paint={item}
                name={format(g.layerName, { n })}
                brandId={brandId}
                editor={editor}
                p={p}
                onSet={change}
              />
            )}
          />
        </div>
      </PanelPart>
    </>
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
      ? setStyle('color', `${hex}${first.slice(7, 9) || 'FF'}`)
      : set(target, (now) => ({
          style: { ...(now.style as Style), color: `${hex}${((now.style as Style).color ?? '').slice(7, 9) || 'FF'}` },
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
  // The fill a colour paints: the topmost one that shows.
  const bound = (fills: Paint[]) => fills[boundFillIndex(fills)]
  const shown = shared(
    target.props.map((pr) => {
      const fill = bound((pr.fills ?? []) as Paint[])
      return fill?.type === 'solid' ? fill.color : undefined
    }),
  )
  const paintFill = (to: (now: Paint) => Paint) =>
    set(target, (now) => {
      const fills = (now.fills ?? []) as Paint[]
      const i = boundFillIndex(fills)
      return { fills: i < 0 ? [...fills, to(NEW_FILL)] : fills.map((f, j) => (j === i ? to(f) : f)) }
    })
  const paint = (hex: string) =>
    paintFill((now) => (now.type === 'solid' ? { ...now, color: `${hex}FF` } : { type: 'solid', color: `${hex}FF` }))
  // The picker edits the topmost fill that shows, whatever its type, so a gradient picked stays the one it shows.
  const showing = (fills: Paint[]) => fills.findLastIndex((f) => f.visible !== false)
  const pickFill = (to: (now: Paint) => Paint) =>
    set(target, (now) => {
      const fills = (now.fills ?? []) as Paint[]
      const i = showing(fills)
      return { fills: i < 0 ? [...fills, to(NEW_FILL)] : fills.map((f, j) => (j === i ? to(f) : f)) }
    })
  // A picture goes into layers that have none; one that has a picture changes it with Replace on the bar.
  const pictureless = target.props.every((pr) => !((pr.fills ?? []) as Paint[]).some((f) => f.type === 'image'))
  const firstFills = (target.props[0]?.fills ?? []) as Paint[]
  const first = firstFills[showing(firstFills)] ?? NEW_FILL
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
 * The colours to pick from, simple first: the brand kit's, which `onBrand` binds to (paint without
 * it), and the colours already in the design, with + first, which opens `picker` under them: any
 * colour, or for shapes, boxes and the page a gradient or an image too.
 */
function ColourChoices({
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
  const now = current && current !== 'mixed' ? current.slice(0, 7).toUpperCase() : null
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
  const now = current && current !== 'mixed' ? current.slice(0, 7).toUpperCase() : null
  const colors = kit?.colors ?? []
  // The colour it has now leads the row when the row does not hold it, as in the mock.
  const offered = colors.length > 0 ? colors.map((c) => c.value.slice(0, 7).toUpperCase()) : [...SWATCHES]
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
              color={c.value.slice(0, 7)}
              label={c.name}
              on={now === c.value.slice(0, 7).toUpperCase()}
              onPick={() => (onBrand ? onBrand(c.token, c.value.slice(0, 7)) : paint(c.value.slice(0, 7)))}
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
