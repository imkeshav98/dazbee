'use client'

// The font of the selected text (#50): a family from the brand's uploads, the Google Fonts we copied
// into our storage, or the fonts we ship, and its weight. Each family shows as a picture of its name
// drawn in it, so the browser never decodes a design font; its files load in the editor only once a
// layer uses it. A brand can upload a TrueType or OpenType file from the same list.
import { MagnifyingGlassIcon, UploadSimpleIcon } from '@phosphor-icons/react'
import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'

import type { Editor } from '@dazbee/editor'
import { type Design, FontFace, FontFamily } from '@dazbee/schema'

import { nearest, previewFace, weightsOf } from '@/components/brand-kit/font-catalog.ts'
import { useEditorDesign, useSelection } from '@/components/editor/editor-hooks.ts'
import { PANEL_BUTTON, PANEL_HEADING } from '@/components/editor/styles.ts'
import { useOverlayScroll } from '@/components/ui/overlay-scroll.ts'
import { Select } from '@/components/ui/select.tsx'
import { brandPath, readJson } from '@/lib/brand-routes.ts'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

const GROUPS = ['upload', 'google', 'builtin'] as const

/** The one value every entry has, or null. */
const same = <T,>(values: T[]) => (values.every((v) => v === values[0]) ? (values[0] ?? null) : null)

/**
 * The base style of the selected text layers: their family, weight and size, each null where they
 * differ; the size is for the card's note.
 */
function selectedFont(design: Design, ids: string[]) {
  const styles = ids.flatMap((id) => {
    const node = design.nodes[id]
    return node?.type === 'text' ? [node.props.style] : []
  })
  if (styles.length === 0) return null
  return {
    family: same(styles.map((style) => style.fontFamily)),
    weight: same(styles.map((style) => style.fontWeight)),
    size: same(styles.map((style) => style.fontSize)),
  }
}

/** A family's name drawn in its own face. */
export function FontPreview({
  brandId,
  family,
  className,
  big = false,
}: {
  brandId: string
  family: FontFamily
  className?: string
  big?: boolean
}) {
  const face = previewFace(family)
  if (family.source === 'builtin' || !face)
    return (
      <span
        className={cn(
          'block truncate',
          big ? 'text-[24px] leading-8 font-semibold tracking-tight' : 'text-[13px]',
          className,
        )}
      >
        {family.family}
      </span>
    )
  return (
    // The family's name drawn in its own face by the API, at twice the size it shows.
    <img
      src={brandPath(brandId, 'fonts', face.id, 'preview')}
      alt={family.family}
      loading="lazy"
      draggable={false}
      className={cn(
        big ? 'h-8' : 'h-6',
        'max-w-full object-contain object-left dark:invert rtl:object-right',
        className,
      )}
    />
  )
}

/**
 * The font of the selected text, for the Font panel: a search, the weight, then the families in
 * their groups to pick from, and an upload. The catalog is fetched again each time it opens, so a
 * brand's new upload shows. A pick or an upload sets the font and leaves the panel open, to try
 * another or set the weight.
 */
export function FontChooser({
  editor,
  brandId,
  catalog,
  refresh,
  onDone,
}: {
  editor: Editor
  brandId: string
  catalog: FontFamily[]
  refresh: () => Promise<void>
  onDone: () => void
}) {
  const t = useMessages()
  const { design } = useEditorDesign(editor)
  const selected = useSelection(editor)
  useEffect(() => {
    void refresh()
  }, [refresh])
  const listId = useId()
  // With a range of the text being edited selected, its font is the range's.
  const range = editor.textSelectionStyles()
  const current = range
    ? { family: same(range.map((s) => s.fontFamily)), weight: same(range.map((s) => s.fontWeight)) }
    : selectedFont(design, selected)
  if (!current) return null
  const weights = weightsOf(catalog.find((f) => f.family === current.family))
  const pick = (picked: FontFamily) => {
    const available = weightsOf(picked)
    editor.setFont(picked.family, available.length > 0 ? nearest(available, current.weight ?? 400) : undefined)
  }
  return (
    <div className="flex min-w-0 flex-col" data-testid="font-chooser">
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
        }}
        weight={
          <label className="flex flex-col gap-1.5">
            <span className={PANEL_HEADING}>{t.editor.fonts.weight}</span>
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
              className="h-[34px] w-full rounded-row border border-line bg-surface px-2.5 text-[13px]"
            />
          </label>
        }
      />
    </div>
  )
}

function FontList({
  id,
  brandId,
  catalog,
  current,
  onPick,
  onClose,
  onUploaded,
  weight,
}: {
  id: string
  /** Shown between the search and the list. */
  weight: ReactNode
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
      const response = await fetch(brandPath(brandId, 'fonts'), { method: 'POST', body: form })
      await onUploaded(FontFace.parse(await readJson(response)))
    } catch (reason) {
      setError(
        format(t.editor.fonts.uploadFailed, { reason: reason instanceof Error ? reason.message : String(reason) }),
      )
    } finally {
      setUploading(false)
    }
  }

  const label = { upload: t.editor.fonts.brand, google: t.editor.fonts.google, builtin: t.editor.fonts.builtin }
  return (
    <div className="flex min-h-0 flex-col gap-3" data-testid="font-list">
      <div className="flex h-[34px] items-center gap-2 rounded-row border border-line bg-surface px-2.5 focus-within:border-accent">
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
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
        />
      </div>
      {weight}
      <div
        ref={listRef}
        id={id}
        role="listbox"
        aria-label={t.editor.fonts.title}
        className="-mx-1 max-h-[min(20rem,40vh)] min-h-0 overflow-y-auto"
      >
        {shown.length === 0 && (
          <p className="px-3 py-4 text-xs text-muted">{format(t.editor.fonts.none, { query: query.trim() })}</p>
        )}
        {/* Each source is a group of options, so a screen reader reads the group, then each family by name. */}
        {GROUPS.map((source) => {
          const options = shown.flatMap((family, i) => (family.source === source ? [{ family, i }] : []))
          if (options.length === 0) return null
          return (
            <div key={source} role="group" aria-labelledby={`${id}-${source}`} className="pb-2">
              <div id={`${id}-${source}`} className={cn(PANEL_HEADING, 'px-1 pb-1')}>
                {label[source]}
              </div>
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
                  className="mx-1 flex h-9 cursor-pointer items-center rounded-row px-2 data-[active]:not-aria-selected:bg-hover data-[active]:lit aria-selected:bg-accent-soft aria-selected:lit"
                >
                  <FontPreview brandId={brandId} family={family} />
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <div>
        <label
          className={cn(
            PANEL_BUTTON,
            'focus-within:outline-2 focus-within:outline-accent',
            uploading && 'pointer-events-none opacity-60',
          )}
        >
          <UploadSimpleIcon size={14} aria-hidden className="shrink-0" />
          <span>{uploading ? t.editor.fonts.uploading : t.editor.fonts.upload}</span>
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
        {error && (
          <p role="alert" className="px-1 pt-1.5 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
