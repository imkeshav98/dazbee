'use client'

// The font of the selected text (#50): a family from the brand's uploads, the Google Fonts we copied
// into our storage, or the fonts we ship, and its weight. Each family shows as a picture of its name
// drawn in it, so the browser never decodes a design font; its files load in the editor only once a
// layer uses it. A brand can upload a TrueType or OpenType file from the same list.
import { MagnifyingGlassIcon, UploadSimpleIcon } from '@phosphor-icons/react'
import type { Editor } from '@dazbee/editor'
import { FONT_FACES } from '@dazbee/fonts'
import { FontFace, FontFamily, type Design } from '@dazbee/schema'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { format } from '../../lib/i18n/index.ts'
import { useOverlayScroll } from '../ui/overlay-scroll.ts'
import { Select } from '../ui/select.tsx'
import { useEditorDesign } from './formats-panel.tsx'

/** The fonts we ship, as catalog families; they have no stored preview. */
const SHIPPED: FontFamily[] = [...new Set(FONT_FACES.map((f) => f.family))].map((family) => ({
  family, source: 'builtin', category: null,
  faces: FONT_FACES.filter((f) => f.family === family).map((f) => ({ id: `builtin-${f.file.replace(/\.\w+$/, '')}`, family, weight: f.weight, style: f.style, source: 'builtin', byteSize: 1 })),
}))

/** The brand's catalog, with the shipped fonts last; `refresh` fetches it again after an upload. */
export function useFontCatalog(brandId: string) {
  const [catalog, setCatalog] = useState<FontFamily[]>(SHIPPED)
  const refresh = useCallback(async () => {
    // Offline, the list keeps what it had; it is fetched again each time it opens.
    const response = await fetch(`/brands/${encodeURIComponent(brandId)}/fonts`).catch(() => null)
    if (!response?.ok) return
    const families = FontFamily.array().parse(await response.json())
    // A brand's upload of a shipped family's name is the one it sees.
    setCatalog([...families, ...SHIPPED.filter((s) => !families.some((f) => f.family === s.family))])
  }, [brandId])
  useEffect(() => {
    void refresh()
  }, [refresh])
  return { catalog, refresh }
}

/** The selected layers, kept current. */
function useSelection(editor: Editor) {
  const [ids, setIds] = useState(() => editor.selection())
  useEffect(() => {
    const stop = editor.onSelection(setIds)
    return () => {
      stop()
    }
  }, [editor])
  return ids
}

/**
 * The base style of the selected text layers: their family and weight, or null where they differ;
 * and the size they are shown at in the format shown, for the card's note.
 */
/** The one value every entry has, or null. */
const same = <T,>(values: T[]) => (values.every((v) => v === values[0]) ? values[0] ?? null : null)

function selectedFont(design: Design, ids: string[], formatId: string) {
  const texts = ids.flatMap((id) => {
    const node = design.nodes[id]
    return node?.type === 'text' ? [{ id, style: node.props.style }] : []
  })
  if (texts.length === 0) return null
  const sizes = texts.map(({ id, style }) => (design.overrides[`format:${formatId}`]?.[id]?.style as Partial<typeof style> | undefined)?.fontSize ?? style.fontSize)
  return { family: same(texts.map(({ style }) => style.fontFamily)), weight: same(texts.map(({ style }) => style.fontWeight)), size: same(sizes) }
}

/** The face that previews a family: upright and nearest Regular. */
const previewFace = (family: FontFamily) =>
  [...family.faces].sort((a, b) => (a.style === b.style ? Math.abs(a.weight - 400) - Math.abs(b.weight - 400) : a.style === 'normal' ? -1 : 1))[0]

/** The family's upright weights, or every weight when it has no upright face. */
export const weightsOf = (family: FontFamily | undefined) => {
  const upright = family?.faces.filter((f) => f.style === 'normal') ?? []
  return [...new Set((upright.length > 0 ? upright : family?.faces ?? []).map((f) => f.weight))].sort((a, b) => a - b)
}

/** The weight a family is set in: the one it had when the family has it, otherwise the nearest. */
export const nearest = (weights: number[], wanted: number) =>
  weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), weights[0] ?? wanted)

/** A family's name drawn in its own face. */
export function FontPreview({ brandId, family, className, big = false }: { brandId: string; family: FontFamily; className?: string; big?: boolean }) {
  const face = previewFace(family)
  if (family.source === 'builtin' || !face) return <span className={cn('block truncate', big ? 'text-[24px] leading-8 font-semibold tracking-tight' : 'text-[13px]', className)}>{family.family}</span>
  return (
    // The family's name drawn in its own face by the API, at twice the size it shows.
    <img
      src={`/brands/${encodeURIComponent(brandId)}/fonts/${encodeURIComponent(face.id)}/preview`}
      alt={family.family}
      loading="lazy"
      draggable={false}
      className={cn(big ? 'h-8' : 'h-6', 'max-w-full object-contain object-left dark:invert rtl:object-right', className)}
    />
  )
}

/**
 * The font of the selected text, for the bar's font popover: the list of families to search and pick
 * from, and the weight. The catalog is fetched again each time it opens, so a brand's new upload shows.
 */
export function FontChooser({ editor, brandId, catalog, refresh, onDone }: { editor: Editor; brandId: string; catalog: FontFamily[]; refresh: () => Promise<void>; onDone: () => void }) {
  const t = useMessages()
  const { design } = useEditorDesign(editor)
  const selected = useSelection(editor)
  useEffect(() => {
    void refresh()
  }, [refresh])
  const listId = useId()
  const [, frameFormat] = editor.selectedFrame()?.split('/') ?? []
  // With a range of the text being edited selected, its font is the range's.
  const range = editor.textSelectionStyles()
  const current = range
    ? { family: same(range.map((s) => s.fontFamily)), weight: same(range.map((s) => s.fontWeight)) }
    : selectedFont(design, selected, frameFormat && design.formats[frameFormat] ? frameFormat : design.meta.primaryFormatId)
  if (!current) return null
  const weights = weightsOf(catalog.find((f) => f.family === current.family))
  const pick = (picked: FontFamily) => {
    const available = weightsOf(picked)
    editor.setFont(picked.family, available.length > 0 ? nearest(available, current.weight ?? 400) : undefined)
    onDone()
  }
  return (
    <div className="flex w-72 flex-col" data-testid="font-chooser">
      <FontList
        id={listId}
        brandId={brandId}
        catalog={catalog}
        current={current.family}
        onPick={pick}
        onClose={onDone}
        onUploaded={async (face) => {
          await refresh()
          editor.setFont(face.family, face.weight)
          onDone()
        }}
      />
      <label className="flex items-center justify-between gap-3 border-t border-line px-2 pt-2 pb-0.5">
        <span className="text-xs text-muted">{t.editor.fonts.weight}</span>
        <Select
          name="font-weight"
          label={t.editor.fonts.weight}
          value={current.weight === null ? '' : String(current.weight)}
          placeholder={t.editor.fonts.mixed}
          options={(weights.length > 0 ? weights : current.weight === null ? [] : [current.weight]).map((w) => ({
            value: String(w),
            label: t.editor.fonts.weights[w as keyof typeof t.editor.fonts.weights] ?? String(w),
          }))}
          onChange={(w) => current.family && editor.setFont(current.family, Number(w))}
          disabled={!current.family || weights.length < 2}
          testId="font-weight"
          className="h-8 flex-1 bg-transparent px-2 text-[13px]"
        />
      </label>
    </div>
  )
}

const GROUPS = ['upload', 'google', 'builtin'] as const

function FontList({ id, brandId, catalog, current, onPick, onClose, onUploaded }: {
  id: string
  brandId: string
  catalog: FontFamily[]
  current: string | null
  onPick: (family: FontFamily) => void
  onClose: () => void
  onUploaded: (face: FontFace) => Promise<void>
}) {
  const t = useMessages()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const listRef = useOverlayScroll(list)

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const matches = catalog.filter((f) => words.every((w) => f.family.toLowerCase().includes(w)))
    return GROUPS.flatMap((source) => matches.filter((f) => f.source === source))
  }, [catalog, query])

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((i) => Math.min(Math.max(i + step, 0), Math.max(shown.length - 1, 0)))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const picked = shown[active]
      if (picked) onPick(picked)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  const upload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const response = await fetch(`/brands/${encodeURIComponent(brandId)}/fonts`, { method: 'POST', body: form })
      const json: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error((json as { error?: string } | null)?.error ?? String(response.status))
      await onUploaded(FontFace.parse(json))
    } catch (reason) {
      setError(format(t.editor.fonts.uploadFailed, { reason: reason instanceof Error ? reason.message : String(reason) }))
    } finally {
      setUploading(false)
    }
  }

  const label = { upload: t.editor.fonts.brand, google: t.editor.fonts.google, builtin: t.editor.fonts.builtin }
  return (
    <div className="flex max-h-[min(26rem,55vh)] min-h-0 flex-col" data-testid="font-list">
      <div className="flex items-center gap-2 border-b border-line px-3">
        <MagnifyingGlassIcon size={14} aria-hidden className="shrink-0 text-subtle" />
        <input
          name="font-search"
          // The list opens to be searched.
          autoFocus
          type="search"
          role="combobox"
          aria-expanded
          aria-controls={id}
          aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
          aria-label={t.editor.fonts.search}
          placeholder={t.editor.fonts.search}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKey}
          data-testid="font-search"
          className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
        />
      </div>
      <div ref={listRef} id={id} role="listbox" aria-label={t.editor.fonts.title} className="min-h-0 flex-1 overflow-y-auto py-1">
        {shown.length === 0 && <p className="px-3 py-4 text-xs text-muted">{format(t.editor.fonts.none, { query: query.trim() })}</p>}
        {/* Each source is a group of options, so a screen reader reads the group, then each family by name. */}
        {GROUPS.map((source) => {
          const options = shown.flatMap((family, i) => (family.source === source ? [{ family, i }] : []))
          if (options.length === 0) return null
          return (
            <div key={source} role="group" aria-labelledby={`${id}-${source}`}>
              <div id={`${id}-${source}`} className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle">{label[source]}</div>
              {options.map(({ family, i }) => (
                <div
                  key={family.family}
                  id={`${id}-${i}`}
                  role="option"
                  aria-label={family.family}
                  aria-selected={family.family === current}
                  data-index={i}
                  data-family={family.family}
                  data-active={i === active ? '' : undefined}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => onPick(family)}
                  className="mx-1 flex h-9 cursor-pointer items-center rounded-row px-2 data-[active]:bg-hover aria-selected:bg-accent-soft"
                >
                  <FontPreview brandId={brandId} family={family} />
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <div className="border-t border-line p-2">
        <label className={cn('flex h-8 cursor-pointer items-center justify-center gap-2 rounded-row text-[13px] font-medium text-muted hover:bg-hover hover:text-text', uploading && 'pointer-events-none opacity-60')}>
          <UploadSimpleIcon size={14} aria-hidden />
          {uploading ? t.editor.fonts.uploading : t.editor.fonts.upload}
          <input
            name="font-file"
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            className="sr-only"
            data-testid="font-upload"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void upload(file)
            }}
          />
        </label>
        {error && <p role="alert" className="px-1 pt-1.5 text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}
