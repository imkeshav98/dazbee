'use client'

// The edit panel: the one panel a top bar item opens, floating at the stage's end side under the
// bar, only as tall as what it holds and scrolling past the room above the bottom controls. On a
// phone it is a sheet at the bottom. It closes on ✕, Esc, another selection or a pop-up opening,
// and gives the focus back to its bar item when closed from inside it.
import { XIcon } from '@phosphor-icons/react'
import type { Editor, ShortcutAction } from '@dazbee/editor'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { format } from '../../lib/i18n/index.ts'
import { keyOf, useSelection } from './arrange-panel.tsx'
import { isPanel, setOpen, setSheetTop, useEditState, usePhone, type PanelId } from './edit-store.ts'
import { FontChooser, useFontCatalog } from './font-panel.tsx'
import { AlignRow, ORDER } from './layer-actions.tsx'
import { PanelContent, useTarget, type Target } from './selection-cards.tsx'
import { MENU_ITEM, MENU_KEY, PANEL_PART } from './styles.ts'
import { useOverlayScroll } from '../ui/overlay-scroll.ts'

/** The Position panel's arrange part: the moves along the stack, and lining one layer up with its size. */
function ArrangePart({ target }: { target: Target }) {
  const t = useMessages()
  const run = (action: ShortcutAction) => target.editor.perform(action)
  return (
    <section aria-labelledby="arrange-part-title" className={PANEL_PART} data-testid="arrange-part">
      <h3 id="arrange-part-title" className="flex h-8 items-center text-[13px] font-semibold text-text">{t.editor.bar.order}</h3>
      <div className="flex flex-col">
        {ORDER.map((action) => (
          <button key={action} type="button" data-action={action} onClick={() => run(action)} className={cn(MENU_ITEM, 'h-8 px-2')}>
            {t.editor.arrange[action]}
            <kbd className={MENU_KEY}>{keyOf(action)}</kbd>
          </button>
        ))}
      </div>
      {target.ids.length === 1 && (
        <>
          <span className="text-xs font-semibold text-muted">{t.editor.bar.lineUp}</span>
          <AlignRow editor={target.editor} />
        </>
      )}
    </section>
  )
}


export function EditPanel({ editor, brandId }: { editor: Editor; brandId: string }) {
  const { open } = useEditState()
  const ids = useSelection(editor)
  const selected = useTarget(editor, ids)
  if (!isPanel(open) || !selected) return null
  return <Panel key={open} id={open} target={selected.target} design={selected.design} brandId={brandId} />
}

function Panel({ id, target, design, brandId }: { id: PanelId; target: Target; design: Parameters<typeof PanelContent>[0]['design']; brandId: string }) {
  const t = useMessages()
  const b = t.editor.bar
  const { barBottom } = useEditState()
  const phone = usePhone()
  const { catalog, refresh } = useFontCatalog(brandId)
  const panel = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const bodyRef = useOverlayScroll(body)
  const note = target.ids.length > 1 ? format(t.editor.props.layers, { n: target.ids.length }) : target.names[0] || t.editor.props.layer
  const close = (back: boolean) => {
    setOpen(null)
    if (back) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="bar-${id}"]`)?.focus())
  }
  // The focus moves into the panel as it opens, onto the panel itself: Tab goes on to its
  // controls, and no field takes the focus, so a phone's keyboard stays down.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
  }, [])
  // On a phone the sheet's top edge is known, so what sits at the bottom start can stand above it.
  useLayoutEffect(() => {
    if (!phone || !panel.current) {
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
  }, [phone])
  const top = barBottom + 10
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
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        event.stopPropagation()
        close(true)
      }}
      style={phone ? undefined : { top, maxHeight: `calc(100% - ${top}px - 4.5rem)` }}
      className={cn(
        'pop-in absolute z-20 flex flex-col overflow-hidden rounded-[16px] surface-frost outline-none',
        'end-3 w-[300px]',
        'max-sm:inset-x-2 max-sm:end-2 max-sm:top-auto max-sm:bottom-2 max-sm:max-h-[46%] max-sm:w-auto max-sm:rounded-[22px]',
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 ps-4 pe-2">
        <h2 id="edit-panel-title" className="min-w-0 flex-1 truncate font-display text-[15px] font-bold tracking-tight">{b.panels[id]}</h2>
        <span data-testid="edit-panel-note" className="min-w-0 max-w-[50%] truncate text-[11px] font-medium text-muted">{note}</span>
        <button type="button" aria-label={t.editor.closePanel} data-testid="edit-panel-close" onClick={() => close(true)} className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-subtle hover:bg-hover hover:text-text">
          <XIcon size={14} aria-hidden />
        </button>
      </div>
      <div ref={bodyRef} className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 [&>*]:shrink-0">
        {id === 'font'
          ? <FontChooser editor={target.editor} brandId={brandId} catalog={catalog} refresh={refresh} onDone={() => close(true)} />
          : (
            <>
              <PanelContent panel={id} target={target} design={design} brandId={brandId} />
              {id === 'position' && <ArrangePart target={target} />}
            </>
          )}
      </div>
    </section>
  )
}
