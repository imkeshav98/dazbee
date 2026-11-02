'use client'

// The bar's own buttons for everything but text, as in the mock. A photo gets Replace, Crop and Look,
// its fills and strokes being cards in the panel and Use as mask in ⋯ More; other shapes, frames and booleans get Colour
// (the fills), shapes and booleans Outline (the strokes); and every selection that is not all text
// gets ✦ Effects.
import { ArrowsClockwiseIcon, CropIcon, SparkleIcon } from '@phosphor-icons/react'
import { withImage } from '@dazbee/editor'
import { boundFillIndex, type Paint } from '@dazbee/schema'
import { useMessages } from '../../lib/i18n/client.tsx'
import { BarPopover } from './bar-popover.tsx'
import { ImagePickerButton } from './image-tool.tsx'
import { EffectsBody, FillBody, imageFillOf, OutlineBody, PhotoLookBody, set, shared, type Target } from './selection-cards.tsx'
import { BAR_BUTTON, BAR_DIVIDER, BAR_PANEL, MIXED_COLOUR } from './styles.ts'

export function ShapeBar({ target, brandId, open, onOpen }: { target: Target; brandId: string; open: string | null; onOpen: (id: string | null) => void }) {
  const t = useMessages()
  const p = t.editor.props
  const b = t.editor.bar
  const filled = target.types.every((type) => type === 'graphic' || type === 'frame' || type === 'boolean')
  const stroked = target.types.every((type) => type === 'graphic' || type === 'boolean')
  const photo = filled ? imageFillOf(target) : null
  const one = target.ids.length === 1
  // A line has no brand swatches: its look is its stroke.
  const lines = target.props.every((pr) => (pr.shape as { kind?: string } | undefined)?.kind === 'line')
  // The colour the brand swatches paint: the topmost solid fill that shows.
  const colour = shared(target.props.map((pr) => {
    const fills = (pr.fills ?? []) as Paint[]
    const fill = fills[boundFillIndex(fills)]
    return fill?.type === 'solid' ? fill.color.slice(0, 7) : null
  }))
  return (
    <>
      {photo && (
        <>
          <ImagePickerButton
            brandId={brandId}
            title={p.replaceImageTitle}
            testId="bar-replace"
            below
            open={open === 'replace'}
            onOpen={(to) => onOpen(to ? 'replace' : null)}
            className={BAR_BUTTON}
            onPick={(asset) => set(target, (now) => ({ fills: withImage((now.fills ?? []) as Paint[], asset.id) }))}
          >
            <ArrowsClockwiseIcon size={15} aria-hidden />
            <span aria-hidden>{p.replaceImage}</span>
          </ImagePickerButton>
          {one && (
            <button type="button" data-bar-item data-testid="bar-crop" onClick={() => target.editor.perform('editPoints')} className={BAR_BUTTON}>
              <CropIcon size={15} aria-hidden />
              {b.crop}
            </button>
          )}
          <BarPopover id="look" open={open} onOpen={onOpen} label={b.look} testId="look" className="w-auto">
            <PhotoLookBody target={target} p={p} brandId={brandId} index={photo.index} paint={photo.paint} />
          </BarPopover>
          <span aria-hidden className={BAR_DIVIDER} />
        </>
      )}
      {filled && !photo && (
        <BarPopover
          id="colour"
          open={open}
          onOpen={onOpen}
          label={b.fill}
          icon={<span aria-hidden className="size-4 rounded-full border border-line-strong" style={{ background: colour === 'mixed' || colour === null ? MIXED_COLOUR : colour }} />}
          testId="colour"
          className="w-auto"
        >
          <div className={BAR_PANEL}><FillBody target={target} brandId={brandId} p={p} swatches={!lines} /></div>
        </BarPopover>
      )}
      {stroked && !photo && (
        <BarPopover id="outline" open={open} onOpen={onOpen} label={b.outline} testId="outline" className="w-auto">
          <div className={BAR_PANEL}><OutlineBody target={target} brandId={brandId} p={p} /></div>
        </BarPopover>
      )}
      {filled && !photo && <span aria-hidden className={BAR_DIVIDER} />}
      <BarPopover id="effects" open={open} onOpen={onOpen} label={p.effects} icon={<SparkleIcon size={15} aria-hidden />} testId="effects" className="w-80 pt-4">
        <EffectsBody target={target} p={p} />
      </BarPopover>
      <span aria-hidden className={BAR_DIVIDER} />
    </>
  )
}
