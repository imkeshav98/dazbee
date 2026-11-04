'use client'

import { TrashIcon, XIcon } from '@phosphor-icons/react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'

import { AssetInUse, AssetSummary, AssetUse, type UpdateAsset } from '@dazbee/schema'

import { QUIET_BUTTON } from '@/components/editor/styles.ts'
import { DANGER_SOLID } from '@/components/ui/looks.ts'
import { brandPath, readJson, RouteError } from '@/lib/brand-routes.ts'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

async function save(brandId: string, id: string, update: UpdateAsset): Promise<AssetSummary> {
  const response = await fetch(brandPath(brandId, 'assets', id), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update),
  })
  return AssetSummary.parse(await readJson(response))
}

/** What of the brand shows the asset. */
async function usesOf(brandId: string, id: string): Promise<AssetUse[]> {
  const response = await fetch(brandPath(brandId, 'assets', id, 'uses'))
  return AssetUse.array().parse(await readJson(response))
}

/** Deletes the brand's asset; what still uses it when the API refuses. */
async function remove(brandId: string, id: string): Promise<AssetUse[] | null> {
  const response = await fetch(brandPath(brandId, 'assets', id), { method: 'DELETE' })
  if (response.status === 204) return null
  const body: unknown = await response.json().catch(() => null)
  const used = AssetInUse.safeParse(body)
  if (response.status === 409 && used.success) return used.data.usedIn
  throw RouteError.fromBody(response.status, body)
}

/**
 * An asset's name and tags, saved as they change: the name on Enter or leaving the field, each tag
 * as it is added or removed. Delete asks first; an image the open design, another design, a
 * template or the logo uses stays, and the panel says where it is used.
 */
export function AssetDetails({
  asset,
  brandId,
  usedHere,
  openDesign,
  askNow,
  onSaved,
  onDeleted,
  onDone,
}: {
  asset: AssetSummary
  brandId: string
  usedHere: () => boolean
  /** The open design's id, which the panel calls "this design". */
  openDesign: string
  /** Asks to delete as it opens. */
  askNow: boolean
  onSaved: (asset: AssetSummary) => void
  onDeleted: () => void
  onDone: () => void
}) {
  const t = useMessages().editor.assetLibrary
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [usedIn, setUsedIn] = useState<string[] | null>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const where = (use: AssetUse) =>
    use.kind === 'logo'
      ? t.logo
      : use.kind === 'design' && use.id === openDesign
        ? t.thisDesign
        : use.name || (use.kind === 'template' ? t.untitledTemplate : t.untitledDesign)
  /** Shows where the asset is used, the open design first and once. */
  const showUses = (uses: AssetUse[]) => {
    const places = [...new Set([...(usedHere() ? [t.thisDesign] : []), ...uses.map(where)])]
    setUsedIn(places.length > 0 ? places : null)
    return places.length > 0
  }
  /** Asks the API what uses the asset (and the open design, whose latest edits the API may not have yet); confirms only when nothing does. */
  const askToDelete = () => {
    setDeleteError(null)
    setUsedIn(null)
    setBusy(true)
    usesOf(brandId, asset.id)
      .then((uses) => setAsking(!showUses(uses)))
      .catch((e: unknown) => setDeleteError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false))
  }
  /** Keeps the asset: the question goes, and the focus goes back to Delete. */
  const keep = () => {
    setAsking(false)
    setTimeout(() => deleteButton.current?.focus())
  }
  const confirmDelete = () => {
    setAsking(false)
    setBusy(true)
    remove(brandId, asset.id)
      .then((uses) => (uses ? showUses(uses) : onDeleted()))
      .catch((e: unknown) => setDeleteError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        setBusy(false)
        deleteButton.current?.focus()
      })
  }
  useEffect(() => {
    if (askNow) askToDelete()
    // Only as the details open.
  }, [])
  const [name, setName] = useState(asset.name)
  const [tag, setTag] = useState('')
  const nameField = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!askNow) nameField.current?.focus()
  }, [askNow])

  const commit = (update: UpdateAsset) => {
    setError(null)
    save(brandId, asset.id, update)
      .then(onSaved)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  const saveName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== asset.name) commit({ name: trimmed })
    else setName(asset.name)
  }
  const addTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== ',') return
    e.preventDefault()
    const word = tag.trim().toLowerCase()
    if (!word) return
    setTag('')
    if (!asset.tags.includes(word)) commit({ tags: [...asset.tags, word] })
  }

  return (
    <section
      aria-label={format(t.editing, { name: asset.name || t.untitled })}
      data-testid="asset-details"
      className="mx-[18px] mb-3 flex shrink-0 flex-col gap-2 rounded-[12px] border border-line bg-bg/40 p-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">{t.name}</span>
        <input
          name="asset-name"
          ref={nameField}
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="h-8 rounded-row border border-line bg-raised px-2 text-[13px]"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span id={`tags-${asset.id}`} className="text-xs text-muted">
          {t.tags}
        </span>
        {asset.tags.length > 0 && (
          <ul aria-labelledby={`tags-${asset.id}`} className="flex flex-wrap gap-1">
            {asset.tags.map((x) => (
              <li
                key={x}
                className="flex h-6 items-center gap-0.5 rounded-full bg-accent-soft ps-2 pe-0.5 text-xs text-text"
              >
                {x}
                <button
                  type="button"
                  aria-label={format(t.removeTag, { tag: x })}
                  onClick={() => commit({ tags: asset.tags.filter((y) => y !== x) })}
                  className="grid size-5 cursor-pointer place-items-center rounded-full hover:bg-hover active:bg-pressed"
                >
                  <XIcon size={10} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          name="asset-tag"
          value={tag}
          maxLength={40}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={addTag}
          aria-label={t.addTag}
          placeholder={t.addTag}
          className="h-8 rounded-row border border-line bg-raised px-2 text-[13px] placeholder:text-subtle"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {format(t.saveFailed, { reason: error })}
        </p>
      )}
      {deleteError && (
        <p role="alert" className="text-xs text-danger">
          {format(t.deleteFailed, { reason: deleteError })}
        </p>
      )}
      {usedIn && (
        <p role="alert" data-testid="asset-in-use" className="text-xs text-danger">
          {format(usedIn.length === 1 ? t.inUseOnce : t.inUse, { n: usedIn.length, places: usedIn.join(', ') })}
        </p>
      )}
      {asking && (
        <p
          id={`delete-ask-${asset.id}`}
          data-testid="asset-delete-ask"
          className="text-[13px] leading-snug break-words"
        >
          {format(t.deleteConfirm, { name: asset.name || t.untitled })}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {asking ? (
          // The question opens with the focus on Keep, so a key pressed by habit keeps the asset; Esc keeps it too.
          <span
            className="flex items-center gap-1"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.stopPropagation()
              event.preventDefault()
              keep()
            }}
          >
            <button
              type="button"
              aria-describedby={`delete-ask-${asset.id}`}
              onClick={confirmDelete}
              data-testid="asset-delete-confirm"
              className={cn(QUIET_BUTTON, DANGER_SOLID, 'whitespace-nowrap')}
            >
              {t.delete}
            </button>
            <button type="button" autoFocus onClick={keep} className={QUIET_BUTTON}>
              {t.keep}
            </button>
          </span>
        ) : (
          <button
            type="button"
            ref={deleteButton}
            disabled={busy}
            aria-busy={busy}
            onClick={askToDelete}
            data-testid="asset-delete"
            className={QUIET_BUTTON}
          >
            <TrashIcon size={13} aria-hidden />
            {t.delete}
          </button>
        )}
        <button type="button" onClick={onDone} className={QUIET_BUTTON}>
          {t.done}
        </button>
      </div>
    </section>
  )
}
