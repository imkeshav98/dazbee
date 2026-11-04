'use client'

// The brand's asset library, in the Assets flyout: upload several images at once and watch each
// one's progress, name and tag them, find them by either, place one on the design by dragging it
// onto a format or by clicking it, and delete one nothing uses. Thumbnails are small copies the API made and stored;
// the design itself draws the original, decoded by CanvasKit.
import { MagnifyingGlassIcon, PencilSimpleIcon, TrashIcon, UploadSimpleIcon, XIcon } from '@phosphor-icons/react'
import { type DragEvent, useCallback, useEffect, useState } from 'react'

import type { Editor } from '@dazbee/editor'
import { AssetSummary, imageAssetIds } from '@dazbee/schema'

import { carryAsset } from '@/components/editor/asset-drag.ts'
import { ASSET_TILE } from '@/components/editor/styles.ts'
import { DASHED_BUTTON } from '@/components/ui/looks.ts'
import { overlayScroll } from '@/components/ui/overlay-scroll.ts'
import { brandPath } from '@/lib/brand-routes.ts'
import { cn } from '@/lib/cn.ts'
import { placeAsset } from '@/lib/editor/place-asset.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'
import { ASSET_ACCEPT as ACCEPT, sendAsset as send } from '@/lib/upload-asset.ts'

import { AssetDetails } from './asset-details.tsx'

interface Upload {
  key: string
  name: string
  progress: number
  error?: string
}

/** How long typing pauses before the library searches. */
const SEARCH_DELAY_MS = 150

/** `changed` counts uploads made elsewhere, such as files dropped on the stage; each change lists the assets again. */
export function AssetLibrary({ editor, brandId, changed = 0 }: { editor: Editor; brandId: string; changed?: number }) {
  const t = useMessages().editor.assetLibrary
  const [query, setQuery] = useState('')
  const [assets, setAssets] = useState<AssetSummary[] | null>(null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  // Whether the details were opened by the tile's Delete, which asks at once.
  const [deletingFromTile, setDeletingFromTile] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    const ask = new AbortController()
    const timer = setTimeout(
      () => {
        const q = query.trim()
        fetch(`${brandPath(brandId, 'assets')}${q ? `?q=${encodeURIComponent(q)}` : ''}`, { signal: ask.signal })
          .then(async (response) => {
            if (response.ok) setAssets(AssetSummary.array().parse(await response.json()))
          })
          // Offline, or a newer search took over: the list keeps what it had.
          .catch(() => undefined)
      },
      version === 0 && !query ? 0 : SEARCH_DELAY_MS,
    )
    return () => {
      clearTimeout(timer)
      ask.abort()
    }
  }, [brandId, query, version, changed])

  const upload = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const key = `${file.name}-${file.size}-${Math.random()}`
        const change = (patch: Partial<Upload>) =>
          setUploads((all) => all.map((u) => (u.key === key ? { ...u, ...patch } : u)))
        setUploads((all) => [...all, { key, name: file.name, progress: 0 }])
        send(brandId, file, (progress) => change({ progress }))
          .then(() => {
            setUploads((all) => all.filter((u) => u.key !== key))
            refresh()
          })
          .catch((error: unknown) => change({ error: error instanceof Error ? error.message : String(error) }))
      }
    },
    [brandId, refresh],
  )

  const replace = (asset: AssetSummary) => setAssets((all) => all?.map((a) => (a.id === asset.id ? asset : a)) ?? null)
  const edited = assets?.find((a) => a.id === editing)
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')

  return (
    <div
      data-testid="asset-library"
      className={cn('flex min-h-0 flex-1 flex-col', dropping && 'bg-accent-soft')}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDropping(false)
        upload([...e.dataTransfer.files])
      }}
    >
      <div className="flex shrink-0 flex-col gap-2 px-[18px] pb-3">
        <label className="flex h-9 items-center gap-2 rounded-[10px] border border-line bg-bg/40 px-2.5 focus-within:border-accent">
          <MagnifyingGlassIcon size={14} aria-hidden className="shrink-0 text-subtle" />
          <input
            name="asset-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t.search}
            placeholder={t.search}
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
          />
        </label>
        <label className={DASHED_BUTTON}>
          <UploadSimpleIcon size={14} aria-hidden />
          {dropping ? t.dropHere : t.upload}
          <input
            name="images"
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => {
              upload([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
        </label>
        {uploads.length > 0 && (
          <ul aria-label={t.upload} className="flex flex-col gap-1.5" data-testid="asset-uploads">
            {uploads.map((u) => (
              <li key={u.key} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={cn('min-w-0 flex-1 truncate', u.error ? 'text-danger' : 'text-muted')}
                    role={u.error ? 'alert' : undefined}
                  >
                    {u.error
                      ? format(t.uploadFailed, { name: u.name, reason: u.error })
                      : format(t.uploading, { name: u.name })}
                  </span>
                  {u.error && (
                    <button
                      type="button"
                      aria-label={t.done}
                      onClick={() => setUploads((all) => all.filter((x) => x.key !== u.key))}
                      className="grid size-5 cursor-pointer place-items-center rounded-row text-subtle hover:bg-hover hover:text-text"
                    >
                      <XIcon size={12} aria-hidden />
                    </button>
                  )}
                </div>
                {!u.error && (
                  <div
                    role="progressbar"
                    aria-label={format(t.uploading, { name: u.name })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(u.progress * 100)}
                    className="h-1 overflow-hidden rounded-full bg-hover"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full bg-accent-solid transition-[width]',
                        u.progress >= 1 && 'animate-pulse',
                      )}
                      style={{ width: `${Math.max(4, u.progress * 100)}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {edited && (
        <AssetDetails
          key={edited.id}
          asset={edited}
          brandId={brandId}
          usedHere={() => imageAssetIds(editor.session.design()).includes(edited.id)}
          openDesign={editor.session.design().meta.designId}
          askNow={deletingFromTile}
          onSaved={replace}
          onDeleted={() => {
            setEditing(null)
            setAssets((now) => now && now.filter((a) => a.id !== edited.id))
          }}
          onDone={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}

      <div ref={overlayScroll} className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-1 pb-4">
        {assets && assets.length === 0 && (
          <p className="text-[13px] text-muted">{query.trim() ? format(t.none, { query: query.trim() }) : t.empty}</p>
        )}
        {assets && assets.length > 0 && (
          <ul aria-label={t.images} className="grid grid-cols-3 gap-2">
            {assets.map((asset) => {
              const name = asset.name || t.untitled
              return (
                <li key={asset.id} data-asset={asset.id} className="group relative flex min-w-0 flex-col gap-1">
                  <button
                    type="button"
                    draggable
                    aria-label={format(t.place, { name })}
                    title={t.placeHint}
                    onClick={() => placeAsset(editor, brandId, asset)}
                    onDragStart={(e) => {
                      carryAsset(e, asset)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    className={cn(
                      ASSET_TILE,
                      'cursor-grab hover:border-line-strong active:cursor-grabbing',
                      editing === asset.id && 'border-accent',
                    )}
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
                  {/* Name and tags open from the tile's corner, shown on hover or focus, and while open. */}
                  <button
                    type="button"
                    aria-label={`${t.edit}: ${name}`}
                    aria-pressed={editing === asset.id}
                    onClick={() => {
                      setDeletingFromTile(false)
                      setEditing(editing === asset.id ? null : asset.id)
                    }}
                    className="absolute end-1 top-1 grid size-6 cursor-pointer place-items-center rounded-full surface-frost text-muted opacity-0 transition-opacity duration-[var(--chrome-fast)] group-hover:opacity-100 hover:text-text focus-visible:opacity-100 aria-pressed:text-accent-text aria-pressed:opacity-100"
                  >
                    <PencilSimpleIcon size={12} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${t.delete}: ${name}`}
                    data-testid="asset-tile-delete"
                    onClick={() => {
                      setDeletingFromTile(true)
                      setEditing(asset.id)
                    }}
                    className="absolute start-1 top-1 grid size-6 cursor-pointer place-items-center rounded-full surface-frost text-muted opacity-0 transition-opacity duration-[var(--chrome-fast)] group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
                  >
                    <TrashIcon size={12} aria-hidden />
                  </button>
                  <span
                    className={cn(
                      'min-w-0 truncate text-[11px] font-medium',
                      asset.name ? 'text-muted' : 'text-subtle',
                    )}
                    title={name}
                  >
                    {name}
                  </span>
                  {asset.tags.length > 0 && (
                    <p className="-mt-0.5 truncate text-[10px] text-subtle">{asset.tags.join(' · ')}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
