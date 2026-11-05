'use client'

// Picking an image: a panel of the brand's images with an upload from the computer, shown by the
// image tool in the tool dock (its button, or I), by the Image card's Replace and by a fill's Add
// image. The tool places the image picked where the next click or drag on a frame lands; closing
// its picker without a pick goes back to the select tool.
import { ImageIcon, UploadSimpleIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { AssetSummary, isVectorAsset } from '@dazbee/schema'

import { useBesidePanel } from '@/components/editor/beside-panel.ts'
import { useMenuFocus } from '@/components/editor/top-bar/bar-popover.tsx'
import { DASHED_BUTTON, FOCUS_RING, TOUCH_GAP } from '@/components/ui/looks.ts'
import { overlayScroll } from '@/components/ui/overlay-scroll.ts'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { brandPath } from '@/lib/brand-routes.ts'
import { cn } from '@/lib/cn.ts'
import type { Placeable } from '@/lib/editor/place-asset.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'
import { ASSET_ACCEPT, IMAGE_ACCEPT, sendAsset } from '@/lib/upload-asset.ts'

import { ASSET_TILE, dockTool, POPOVER } from './styles.ts'

const PANEL = cn(POPOVER, 'flex max-h-[min(26rem,60dvh)] w-72 flex-col')

/** The image tool's dock button and its picker, open while the tool waits for an image. */
export function ImageTool({
  brandId,
  active,
  open,
  onPress,
  onPick,
  onClose,
}: {
  brandId: string
  /** The image tool is the one in use. */
  active: boolean
  /** The picker shows: the tool is in use and has no image to place yet. */
  open: boolean
  onPress: () => void
  onPick: (asset: Placeable) => void
  onClose: () => void
}) {
  const t = useMessages().editor
  const label = t.toolImage
  return (
    <Popover.Root open={open} onOpenChange={(next) => (next ? onPress() : onClose())}>
      <Tooltip label={`${label} · I`}>
        <Popover.Trigger asChild>
          <button type="button" aria-label={label} aria-pressed={active} data-tool="image" className={dockTool(active)}>
            <ImageIcon size={20} weight={active ? 'fill' : 'regular'} aria-hidden />
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={10}
          aria-label={t.imageTool.title}
          data-testid="image-picker"
          onKeyDown={(e) => e.stopPropagation()}
          className={PANEL}
        >
          <ImagePickerPanel
            brandId={brandId}
            open={open}
            title={t.imageTool.title}
            hint={t.imageTool.hint}
            vectors
            onPick={onPick}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** A button in a card that opens the picker beside it; the image picked goes to `onPick` and the picker closes. */
export function ImagePickerButton({
  brandId,
  title,
  testId,
  className,
  children,
  onPick,
  below = false,
  open: shown,
  onOpen,
}: {
  brandId: string
  /** Opens under the button and is one of the bar's buttons, for the bar by the selection. */
  below?: boolean
  /** Whether it is open, when its owner keeps that, as the bar does for its popovers. */
  open?: boolean
  onOpen?: (open: boolean) => void
  /** The picker's heading, and the button's name. */
  title: string
  testId: string
  className: string
  children: ReactNode
  onPick: (asset: Placeable) => void
}) {
  const [own, setOwn] = useState(false)
  const open = shown ?? own
  const focus = useMenuFocus()
  // The cards sit at the stage's end, so the picker opens towards its middle, clear of the card.
  const beside = useBesidePanel()
  const setOpen = (to: boolean) => {
    if (to) beside.measure(focus.button.current)
    if (onOpen) onOpen(to)
    else setOwn(to)
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={focus.button}
          type="button"
          aria-label={title}
          data-testid={testId}
          data-bar-item={below || undefined}
          className={className}
        >
          {children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={below ? 'bottom' : beside.side}
          align="start"
          sideOffset={below ? 12 : beside.sideOffset}
          collisionPadding={12}
          aria-label={title}
          data-testid={`${testId}-picker`}
          onKeyDown={(e) => e.stopPropagation()}
          {...focus.content}
          className={PANEL}
        >
          {focus.back}
          <ImagePickerPanel
            brandId={brandId}
            open={open}
            title={title}
            onPick={(asset) => {
              setOpen(false)
              onPick(asset)
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * The picker's own content: an upload and the brand's images, fetched while it shows. An upload
 * that ends after the picker closed picks nothing.
 */
/** The brand's images to pick from, and an upload. SVG files are offered only with `vectors`, where they are placed as layers; a fill takes images alone. */
function ImagePickerPanel({
  brandId,
  open,
  title,
  hint,
  vectors = false,
  onPick,
}: {
  brandId: string
  open: boolean
  title: string
  hint?: string
  vectors?: boolean
  onPick: (asset: Placeable) => void
}) {
  const t = useMessages().editor
  const [assets, setAssets] = useState<AssetSummary[] | null>(null)
  const [upload, setUpload] = useState<{ name: string; progress: number; error?: string; notice?: string } | null>(null)
  const showing = useRef(open)
  useEffect(() => {
    showing.current = open
    return () => {
      showing.current = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const ask = new AbortController()
    fetch(brandPath(brandId, 'assets'), { signal: ask.signal })
      .then(async (response) => {
        if (response.ok)
          setAssets(
            AssetSummary.array()
              .parse(await response.json())
              .filter((asset) => vectors || !isVectorAsset(asset)),
          )
      })
      // Offline: the picker keeps what it had, and an upload still works once back.
      .catch(() => undefined)
    return () => ask.abort()
  }, [brandId, open, vectors])

  const send = (file: File) => {
    setUpload({ name: file.name, progress: 0 })
    sendAsset(brandId, file, (progress) => setUpload({ name: file.name, progress }))
      .then((asset) => {
        // An SVG file can't be a fill; it stays in the library to place as layers.
        if (!vectors && isVectorAsset(asset)) {
          setUpload({ name: file.name, progress: 0, notice: format(t.imageTool.svgNotFill, { name: file.name }) })
          return
        }
        setUpload(null)
        if (showing.current) onPick(asset)
      })
      .catch((error: unknown) =>
        setUpload({ name: file.name, progress: 0, error: error instanceof Error ? error.message : String(error) }),
      )
  }

  return (
    <>
      {/* On a phone or a touch screen the upload is TOUCH_GAP from the first image. */}
      <div className="flex shrink-0 flex-col gap-2 p-3 pb-2 max-sm:pb-[8px] [@media(hover:none)]:pb-[8px]">
        <p className="font-display text-[13px] font-bold">{title}</p>
        <label className={DASHED_BUTTON}>
          <UploadSimpleIcon size={14} aria-hidden />
          {t.imageTool.upload}
          <input
            name="image-picker-upload"
            type="file"
            accept={vectors ? ASSET_ACCEPT : IMAGE_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) send(file)
            }}
          />
        </label>
        {upload &&
          (upload.notice || upload.error ? (
            <p role="alert" className="text-xs text-danger">
              {upload.notice ?? format(t.imageTool.failed, { name: upload.name, reason: upload.error ?? '' })}
            </p>
          ) : (
            <div
              role="progressbar"
              aria-label={format(t.imageTool.uploading, { name: upload.name })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(upload.progress * 100)}
              className="h-1 overflow-hidden rounded-full bg-well"
            >
              <div
                className={cn(
                  'h-full rounded-full bg-accent-solid transition-[width]',
                  upload.progress >= 1 && 'animate-pulse',
                )}
                style={{ width: `${Math.max(4, upload.progress * 100)}%` }}
              />
            </div>
          ))}
        {hint && <p className="text-[11px] text-subtle">{hint}</p>}
      </div>
      <div ref={overlayScroll} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {assets && assets.length === 0 && <p className="text-[13px] text-muted">{t.imageTool.empty}</p>}
        {assets && assets.length > 0 && (
          <ul aria-label={t.imageTool.brand} className={cn('grid grid-cols-3 gap-2', TOUCH_GAP)}>
            {assets.map((asset) => {
              const name = asset.name || t.assetLibrary.untitled
              return (
                <li key={asset.id} data-asset={asset.id}>
                  <button
                    type="button"
                    aria-label={format(t.imageTool.pick, { name })}
                    title={name}
                    onClick={() => onPick(asset)}
                    className={cn(ASSET_TILE, FOCUS_RING, 'w-full cursor-pointer hover:border-accent')}
                  >
                    <img
                      src={brandPath(brandId, 'assets', asset.id, 'thumbnail')}
                      alt=""
                      width={asset.width}
                      height={asset.height}
                      draggable={false}
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
