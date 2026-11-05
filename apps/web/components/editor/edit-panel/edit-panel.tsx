'use client'

// The edit panel: the one panel a top bar item opens, floating at the stage's end side under the
// bar, only as tall as what it holds and scrolling past the room above the bottom controls. On a
// phone it is a sheet at the bottom. It closes on ✕, Esc, another selection or a pop-up opening,
// and gives the focus back to its bar item when closed from inside it.
import { XIcon } from '@phosphor-icons/react'
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { Editor } from '@dazbee/editor'

import { useFontCatalog } from '@/components/brand-kit/font-catalog.ts'
import {
  isLayerPanel,
  type LayerPanelId,
  overPanel,
  type PanelId,
  setOpen,
  setSheetTop,
  useEditState,
  usePhone,
} from '@/components/editor/edit-store.ts'
import { useSelection } from '@/components/editor/editor-hooks.ts'
import { FontChooser } from '@/components/editor/flyouts/font-panel.tsx'
import { inPopUp } from '@/components/ui/menu-close.ts'
import { useOverlayScroll } from '@/components/ui/overlay-scroll.ts'
import { useScrollEdges } from '@/components/ui/scroll-edges.ts'
import { cn } from '@/lib/cn.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format } from '@/lib/i18n/index.ts'

import { AutoLayoutPanel } from './auto-layout-panel.tsx'
import { ColourPanel } from './colour-panel.tsx'
import { EffectsPanel } from './effects-panel.tsx'
import { typingIn } from './fields.tsx'
import { ImagePanel } from './image-panel.tsx'
import { StrokePanel } from './outline-panel.tsx'
import { PositionPanel } from './position-panel.tsx'
import { SpacingPanel } from './spacing-panel.tsx'
import { type PanelProps, useTarget } from './target.ts'

/** What each layer panel holds for the selection, by the panel's id. */
const PANELS: Record<LayerPanelId, (props: PanelProps) => ReactNode> = {
  font: FontPanel,
  colour: ColourPanel,
  spacing: SpacingPanel,
  effects: EffectsPanel,
  position: PositionPanel,
  edit: ImagePanel,
  outline: StrokePanel,
  stack: AutoLayoutPanel,
}

/** The item that opened panel `id`: the one that had the focus as it opened, else the first that opens it. */
const openerOf = (id: PanelId, opener: Element | null) =>
  opener instanceof HTMLElement && opener.isConnected && opener.dataset.opens === id
    ? opener
    : document.querySelector<HTMLElement>(`[data-opens="${id}"]`)

/**
 * Closes the open panel; with `back`, the focus goes back to the item that opened it at once,
 * before the panel goes: later, it could take the focus from whatever the next click or key opened.
 */
function closePanel(id: PanelId, back: boolean, opener: Element | null = null) {
  if (back) openerOf(id, opener)?.focus()
  setOpen(null)
}

export function EditPanel({ editor, brandId }: { editor: Editor; brandId: string }) {
  const { open } = useEditState()
  const ids = useSelection(editor)
  const selected = useTarget(editor, ids)
  if (!isLayerPanel(open) || !selected) return null
  return <Panel key={open} id={open} target={selected.target} design={selected.design} brandId={brandId} />
}

/**
 * The edit panel's frame, for a layer's panels and the design's own (Pages): its title, up to two
 * lines, a note and an action beside it, ✕, and a body that scrolls. It floats at the stage's end
 * side under the top bar's row, only as tall as what it holds; on a phone it is a sheet at the
 * bottom. Esc or ✕ closes it, and the focus goes back to the item that opened it when closed from
 * inside it. It takes the focus as it opens unless `focus` is false.
 */
export function PanelFrame({
  id,
  title,
  note,
  action,
  focus = true,
  children,
}: {
  id: PanelId
  title: string
  note?: string
  action?: ReactNode
  /** Whether the panel takes the focus as it opens; false leaves it where it is, as on the stage. */
  focus?: boolean
  children: ReactNode
}) {
  const t = useMessages()
  const { barBottom } = useEditState()
  const phone = usePhone()
  // On a phone the edit panel is a sheet at the bottom; Pages drops under its button instead, the dock still showing.
  const sheet = phone && id !== 'pages'
  const panel = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  // On a phone the sheet's bar stays shown while there is more to scroll to: no pointer hovers to show it.
  const bodyRef = useOverlayScroll(body, { shown: phone })
  const scroll = useScrollEdges(body)
  // The focus goes back to what opened it: a top bar item, or Pages by the zoom pill.
  const [opener] = useState(() => document.activeElement)
  // Under the top bar while it shows; with nothing selected, under the row kept for it.
  const [rowBottom, setRowBottom] = useState(0)
  useLayoutEffect(() => {
    const row = document.querySelector<HTMLElement>('[data-bar-row]')
    if (!row) return
    const measure = () => setRowBottom(row.offsetTop + row.offsetHeight)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(row)
    return () => watch.disconnect()
  }, [])
  // Esc closes the panel before it clears the selection, wherever the focus is. A number field with
  // something typed in it stands over the panel: it takes the key alone, throwing away what was
  // typed and keeping the focus, so the next Esc closes the panel. In another field of the panel
  // the field still takes the key and the panel closes with it; the focus goes back to the item
  // that opened it once the field has let it go. A field outside the panel, as the design's name or
  // the bar's size, stands over it: it takes the key alone, throwing away what was typed, and the
  // focus leaves it, so the next Esc closes the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // What stands over the panel, as Keyboard shortcuts or the Share menu, closes first, on its own Esc.
      if (overPanel()) return
      const at = document.activeElement
      // A list of the panel's own, a select's or a pop-up's, closes first.
      if (inPopUp(at) || at?.getAttribute('aria-expanded') === 'true') return
      if (typingIn(at)) return
      if (
        at instanceof HTMLElement &&
        (at.tagName === 'INPUT' || at.tagName === 'TEXTAREA' || at.tagName === 'SELECT')
      ) {
        if (!panel.current?.contains(at)) {
          // Once the field has thrown away what was typed, so leaving it keeps nothing.
          requestAnimationFrame(() => document.activeElement === at && at.blur())
          return
        }
        setOpen(null)
        requestAnimationFrame(() => {
          if (document.activeElement === document.body || document.activeElement === null) openerOf(id, opener)?.focus()
        })
        return
      }
      event.stopImmediatePropagation()
      event.preventDefault()
      closePanel(id, panel.current?.contains(at) ?? false, opener)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  // The focus moves into the panel as it opens, onto the panel itself: Tab goes on to its
  // controls, and no field takes the focus, so a phone's keyboard stays down. `focus` is set once,
  // as the panel opens.
  useEffect(() => {
    if (focus) panel.current?.focus({ preventScroll: true })
  }, [focus])
  // On a phone the sheet's top edge is known, so what sits at the bottom start can stand above it.
  useLayoutEffect(() => {
    if (!sheet || !panel.current) {
      setSheetTop(null)
      return
    }
    const el = panel.current
    const measure = () => setSheetTop(el.offsetTop)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => {
      watch.disconnect()
      setSheetTop(null)
    }
  }, [sheet])
  // A long title, as a frame's long name in Add a size to, wraps onto a second line and then ends
  // in an ellipsis, with the whole title as its tooltip.
  const heading = useRef<HTMLHeadingElement>(null)
  const [titleCut, setTitleCut] = useState(false)
  useLayoutEffect(() => {
    const el = heading.current
    if (!el) return
    const measure = () => setTitleCut(el.scrollHeight > el.clientHeight + 1)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [title])
  const top = (barBottom || rowBottom) + 10
  return (
    <section
      ref={panel}
      id="edit-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="edit-panel-title"
      tabIndex={-1}
      data-testid={`bar-${id}-menu`}
      data-panel={id}
      // The panel takes the focus as it opens but is no control itself, so it shows no focus ring.
      style={{ outline: 'none', ...(phone ? {} : ({ top, '--panel-top': `${top}px` } as CSSProperties)) }}
      className={cn(
        'pop-in absolute z-20 flex flex-col overflow-hidden rounded-[16px] surface-frost outline-none',
        // Clear of the zoom pill below it, and on a tablet of Pages stacked over the zoom pill too.
        'end-3 w-[300px] max-h-[calc(100%-var(--panel-top)-4.5rem)] sm:max-lg:max-h-[calc(100%-var(--panel-top)-7.5rem)]',
        'max-sm:inset-x-2 max-sm:end-2 max-sm:w-auto max-sm:rounded-[22px]',
        // Under the Pages button at the top start (5rem down, 2.25rem tall), clear of the dock and the tab bar.
        sheet
          ? 'max-sm:top-auto max-sm:bottom-2 max-sm:max-h-[46%]'
          : 'max-sm:top-[7.75rem] max-sm:bottom-auto max-sm:max-h-[calc(100%-17.5rem)]',
      )}
    >
      <div
        className={cn(
          'flex min-h-12 shrink-0 items-center gap-2 border-b py-1.5 ps-4 pe-2 transition-colors',
          scroll.down ? 'border-line' : 'border-transparent',
        )}
      >
        <h2
          ref={heading}
          id="edit-panel-title"
          title={titleCut ? title : undefined}
          className="line-clamp-2 min-w-0 flex-1 font-display text-[15px] leading-[1.3] font-bold tracking-tight break-words"
        >
          {title}
        </h2>
        {note && (
          <span
            data-testid="edit-panel-note"
            className="min-w-0 max-w-[50%] shrink-0 truncate pe-0.5 text-[11px] font-medium text-muted"
          >
            {note}
          </span>
        )}
        {action}
        <button
          type="button"
          aria-label={t.editor.closePanel}
          data-testid="edit-panel-close"
          onClick={() => closePanel(id, true, opener)}
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-subtle hover:bg-hover hover:text-text active:bg-pressed"
        >
          <XIcon size={14} aria-hidden />
        </button>
      </div>
      {/* A field scrolled into view stops above the faded edge, past its 28 px. */}
      <div
        ref={bodyRef}
        onScroll={scroll.measure}
        className={cn(
          'flex min-h-0 scroll-pb-[28px] flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 [&>*]:shrink-0',
          scroll.more && '[mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]',
        )}
      >
        {children}
      </div>
    </section>
  )
}

function Panel({ id, ...props }: PanelProps & { id: LayerPanelId }) {
  const t = useMessages()
  const { target } = props
  const Content = PANELS[id]
  const note =
    target.ids.length > 1
      ? format(t.editor.props.layers, { n: target.ids.length })
      : target.names[0] || t.editor.props.layer
  return (
    <PanelFrame id={id} title={t.editor.bar.panels[id]} note={note}>
      <Content {...props} />
    </PanelFrame>
  )
}

/** The Font panel: the brand's fonts to pick from; picking one closes the panel. */
function FontPanel({ target, brandId }: PanelProps) {
  const { catalog, refresh } = useFontCatalog(brandId)
  return (
    <FontChooser
      editor={target.editor}
      brandId={brandId}
      catalog={catalog}
      refresh={refresh}
      onDone={() => closePanel('font', true)}
    />
  )
}
