'use client'

// The edit panel: the one panel a top bar item opens, floating at the stage's end side under the
// bar, only as tall as what it holds and scrolling past the room above the bottom controls. On a
// phone it is a sheet at the bottom. It closes on ✕, Esc, another selection or a pop-up opening,
// and gives the focus back to its bar item when closed from inside it.
import {
  AlignBottomIcon, AlignCenterHorizontalIcon, AlignCenterVerticalIcon, AlignLeftIcon, AlignRightIcon, AlignTopIcon,
  ArrowDownIcon, ArrowLineDownIcon, ArrowLineUpIcon, ArrowsOutLineHorizontalIcon, ArrowsOutLineVerticalIcon, ArrowUpIcon, XIcon, type Icon,
} from '@phosphor-icons/react'
import type { Editor, ShortcutAction } from '@dazbee/editor'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { format } from '../../lib/i18n/index.ts'
import { ALIGN, keyOf, useSelection } from './arrange-panel.tsx'
import { isPanel, setOpen, setSheetTop, useEditState, usePhone, type PanelId } from './edit-store.ts'
import { FontChooser, useFontCatalog } from './font-panel.tsx'
import { ORDER } from './layer-actions.tsx'
import { PanelContent, useTarget, type Target } from './selection-cards.tsx'
import { PANEL_BUTTON, PANEL_HEADING, PANEL_PART } from './styles.ts'
import { useOverlayScroll } from '../ui/overlay-scroll.ts'

/** The four moves along the stack, two to a row: a step forward and back, then all the way. */
const MOVES: { action: (typeof ORDER)[number]; icon: Icon }[] = [
  { action: 'bringForward', icon: ArrowUpIcon },
  { action: 'sendBackward', icon: ArrowDownIcon },
  { action: 'bringToFront', icon: ArrowLineUpIcon },
  { action: 'sendToBack', icon: ArrowLineDownIcon },
]
/** One layer lines up with its size by these, two to a row: each up-down one beside its across one. */
const SIZE_ALIGN = [
  { action: 'alignTop', icon: AlignTopIcon },
  { action: 'alignLeft', icon: AlignLeftIcon },
  { action: 'alignMiddle', icon: AlignCenterVerticalIcon },
  { action: 'alignCentre', icon: AlignCenterHorizontalIcon },
  { action: 'alignBottom', icon: AlignBottomIcon },
  { action: 'alignRight', icon: AlignRightIcon },
] as const satisfies readonly { action: ShortcutAction; icon: Icon }[]
/** Three or more layers spread out evenly, across or down. */
const SPREAD = [
  { action: 'distributeHorizontal', icon: ArrowsOutLineHorizontalIcon },
  { action: 'distributeVertical', icon: ArrowsOutLineVerticalIcon },
] as const satisfies readonly { action: ShortcutAction; icon: Icon }[]

/**
 * The Position panel's simple choices: the four moves along the stack, then lining up. One layer
 * lines up with its size, by name; several line up with each other, by icon, and three or more
 * spread out evenly. Each button runs its shortcut's action, and its tooltip names the shortcut.
 */
function ArrangePart({ target }: { target: Target }) {
  const t = useMessages()
  const a = t.editor.arrange
  const placing = t.editor.bar.placing
  const run = (action: ShortcutAction) => target.editor.perform(action)
  const tip = (label: string, action: ShortcutAction) => format(a.withKey, { label, key: keyOf(action) })
  const several = target.ids.length > 1
  // Spreading needs a layer between the two at the ends.
  const spreads = target.ids.length >= 3
  return (
    <section aria-labelledby="arrange-part-title" className={PANEL_PART} data-testid="arrange-part">
      <h3 id="arrange-part-title" className={PANEL_HEADING}>{placing.arrange}</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {MOVES.map(({ action, icon: Icon }) => (
          <button key={action} type="button" data-action={action} title={tip(a[action], action)} onClick={() => run(action)} className={PANEL_BUTTON}>
            <Icon size={14} aria-hidden className="shrink-0" />
            <span>{placing[action]}</span>
          </button>
        ))}
      </div>
      {several
        ? (
          <>
            <h3 className={PANEL_HEADING}>{placing.lineUpSelection}</h3>
            <div dir="ltr" className="grid grid-cols-3 gap-1.5">
              {ALIGN.map(({ action, icon: Icon }) => (
                <button key={action} type="button" data-action={action} aria-label={a[action]} title={tip(a[action], action)} onClick={() => run(action)} className={cn(PANEL_BUTTON, 'justify-center')}>
                  <Icon size={16} aria-hidden />
                </button>
              ))}
            </div>
            <div className="grid gap-1.5">
              {SPREAD.map(({ action, icon: Icon }) => (
                <button key={action} type="button" data-action={action} disabled={!spreads} title={spreads ? tip(a[action], action) : placing.needsThree} onClick={() => run(action)} className={PANEL_BUTTON}>
                  <Icon size={14} aria-hidden className="shrink-0" />
                  <span>{placing[action]}</span>
                </button>
              ))}
            </div>
          </>
        )
        : (
          <>
            <h3 className={PANEL_HEADING}>{placing.lineUpSize}</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {SIZE_ALIGN.map(({ action, icon: Icon }) => (
                <button key={action} type="button" data-action={action} title={tip(a[action], action)} onClick={() => run(action)} className={PANEL_BUTTON}>
                  <Icon size={15} aria-hidden className="shrink-0" />
                  <span>{placing[action]}</span>
                </button>
              ))}
            </div>
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
  // The focus goes back to the bar item at once, before the panel goes: later, it could take the
  // focus from whatever the next click or key opened.
  const close = (back: boolean) => {
    if (back) document.querySelector<HTMLElement>(`[data-opens="${id}"]`)?.focus()
    setOpen(null)
  }
  // Esc closes the panel before it clears the selection, wherever the focus is. In a field of the
  // panel the field still takes the key, throwing away what was typed, and the panel closes with
  // it; the focus goes back to the bar item once the field has let it go.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const at = document.activeElement
      // A pop-up of the panel's own, such as a select's list, closes first.
      if (at instanceof Element && at.closest('[data-radix-popper-content-wrapper]')) return
      if (at instanceof HTMLElement && panel.current?.contains(at) && (at.tagName === 'INPUT' || at.tagName === 'TEXTAREA' || at.tagName === 'SELECT')) {
        setOpen(null)
        requestAnimationFrame(() => {
          if (document.activeElement === document.body || document.activeElement === null) document.querySelector<HTMLElement>(`[data-opens="${id}"]`)?.focus()
        })
        return
      }
      event.stopImmediatePropagation()
      event.preventDefault()
      close(panel.current?.contains(at) ?? false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
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
      style={phone ? undefined : { top, maxHeight: `calc(100% - ${top}px - 4.5rem)` }}
      className={cn(
        'pop-in absolute z-20 flex flex-col overflow-hidden rounded-[16px] surface-frost outline-none',
        'end-3 w-[300px]',
        'max-sm:inset-x-2 max-sm:end-2 max-sm:top-auto max-sm:bottom-2 max-sm:max-h-[46%] max-sm:w-auto max-sm:rounded-[22px]',
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 ps-4 pe-2">
        <h2 id="edit-panel-title" className="min-w-0 flex-1 truncate font-display text-[15px] font-bold tracking-tight">{b.panels[id]}</h2>
        <span data-testid="edit-panel-note" className="min-w-0 max-w-[50%] shrink-0 truncate text-[11px] font-medium text-muted">{note}</span>
        <button type="button" aria-label={t.editor.closePanel} data-testid="edit-panel-close" onClick={() => close(true)} className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-subtle hover:bg-hover hover:text-text">
          <XIcon size={14} aria-hidden />
        </button>
      </div>
      <div ref={bodyRef} className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 [&>*]:shrink-0">
        {id === 'font'
          ? <FontChooser editor={target.editor} brandId={brandId} catalog={catalog} refresh={refresh} onDone={() => close(true)} />
          : (
            <>
              {id === 'position' && <ArrangePart target={target} />}
              <PanelContent panel={id} target={target} design={design} brandId={brandId} />
            </>
          )}
      </div>
    </section>
  )
}
