'use client'

// The bar by the selection: a frosted pill above the selected layers that follows them as the stage
// pans and zooms and they move, below them when there is no room above, and out of the way while a
// gesture runs or they are off the stage. It holds what people change most; ⋯ More, and a
// right-click on a layer, hold the layers' own actions.
import * as Popover from '@radix-ui/react-popover'
import { BoundingBoxIcon, DotsThreeIcon, RowsIcon, SelectionPlusIcon } from '@phosphor-icons/react'
import type { Editor, ShortcutAction } from '@dazbee/editor'
import { useEffect, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { cn } from '../../lib/cn.ts'
import { useMessages } from '../../lib/i18n/client.tsx'
import { format } from '../../lib/i18n/index.ts'
import { ALIGN, COMBINE, DISTRIBUTE, keyOf, useSelection } from './arrange-panel.tsx'
import { BarPopover, keepFocus } from './bar-popover.tsx'
import { Choice } from './fields.tsx'
import { RotationField, set, useTarget } from './selection-cards.tsx'
import { BAR, BAR_BUTTON, BAR_DIVIDER, ICON_BUTTON, MENU_DIVIDER, MENU_ITEM, MENU_KEY, POPOVER } from './styles.ts'
import { ShapeBar } from './shape-bar.tsx'
import { TextBar } from './text-bar.tsx'

/** Pixels between the selection and the bar, clear of the turn handles round its corners, and kept clear at the stage's edges. */
const GAP = 28
const EDGE = 8
/** Room kept at the stage's top for the islands that float there, and at its bottom for the tool dock. */
const TOP = 64
const BOTTOM = 72

type Place = { left: number; top: number }

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high))

/** Where the bar goes, or null while it keeps out of the way: nothing selected, a gesture running, the selection off the stage. */
function usePlace(editor: Editor, bar: HTMLElement | null): Place | null {
  const [place, setPlace] = useState<Place | null>(null)
  useEffect(() => {
    if (!bar) {
      setPlace(null)
      return
    }
    let frame = 0
    const update = () => {
      const rect = editor.selectionRect()
      const stage = bar.offsetParent as HTMLElement | null
      if (!rect || editor.busy() || !stage) return setPlace(null)
      const room = { width: stage.clientWidth, height: stage.clientHeight }
      if (rect.x + rect.width < 0 || rect.x > room.width || rect.y + rect.height < 0 || rect.y > room.height) return setPlace(null)
      const width = bar.offsetWidth
      const height = bar.offsetHeight
      const left = Math.round(clamp(rect.x + rect.width / 2 - width / 2, EDGE, room.width - width - EDGE))
      // Above, else below, else, with the selection filling the stage, at the stage's top over it.
      const above = rect.y - height - GAP
      const below = rect.y + rect.height + GAP
      const top = Math.round(above >= TOP ? Math.min(above, room.height - height - BOTTOM) : below + height <= room.height - BOTTOM ? Math.max(below, TOP) : TOP)
      setPlace((now) => (now?.left === left && now.top === top ? now : { left, top }))
    }
    // On the next frame, once the bar shows the buttons for the new selection.
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    const stop = editor.onDraw(update)
    const stopSelection = editor.onSelection(later)
    const resize = new ResizeObserver(later)
    resize.observe(bar)
    // A gesture or a text range can end with nothing drawn again: look once the pointer or a key is let go.
    window.addEventListener('pointerup', later)
    window.addEventListener('keyup', later)
    return () => {
      cancelAnimationFrame(frame)
      stop()
      stopSelection()
      resize.disconnect()
      window.removeEventListener('pointerup', later)
      window.removeEventListener('keyup', later)
    }
  }, [editor, bar])
  return place
}

/** The six ways to line up the selection, as icons: left, centre, right, top, middle, bottom. */
function AlignRow({ editor }: { editor: Editor }) {
  const t = useMessages()
  return (
    <div dir="ltr" role="group" aria-label={t.editor.arrange.align} className="grid grid-cols-6 gap-0.5">
      {ALIGN.map(({ action, icon: Icon }) => (
        <button key={action} type="button" aria-label={t.editor.arrange[action]} title={format(t.editor.arrange.withKey, { label: t.editor.arrange[action], key: keyOf(action) })} data-action={action} onClick={() => editor.perform(action)} className={ICON_BUTTON}>
          <Icon size={16} aria-hidden />
        </button>
      ))}
    </div>
  )
}

/**
 * The layers' own actions, for ⋯ More and the right-click menu: for one layer its line up, then
 * duplicate, order, group and ungroup, put in a box, lock, hide, use as mask, the turn,
 * and for text where it sits up and down in its box.
 */
export function LayerActions({ editor, ids, onDone }: { editor: Editor; ids: string[]; onDone: () => void }) {
  const t = useMessages()
  const p = t.editor.props
  const b = t.editor.bar
  const selected = useTarget(editor, ids)
  if (!selected) return null
  const { target, design } = selected
  const run = (action: ShortcutAction) => {
    editor.perform(action)
    onDone()
  }
  const row = (action: ShortcutAction, label: string, pressed?: boolean) => (
    <button key={action} type="button" data-action={action} aria-pressed={pressed} onClick={() => run(action)} className={MENU_ITEM}>
      {label}
      <kbd className={MENU_KEY}>{keyOf(action)}</kbd>
    </button>
  )
  const nodes = target.ids.map((id) => design.nodes[id])
  const locked = nodes.every((node) => node?.lock && Object.values(node.lock).some(Boolean))
  const hidden = target.props.every((pr) => pr.visible === false)
  const masks = target.props.every((pr) => Boolean(pr.mask))
  const sized = target.types.every((type) => type !== 'group' && type !== 'boolean')
  const text = target.types.every((type) => type === 'text')
  const aligns = new Set(target.props.map((pr) => (pr.verticalAlign ?? 'top') as 'top' | 'middle' | 'bottom'))
  return (
    <>
      {ids.length === 1 && (
        <>
          <div className="px-1 pb-1"><AlignRow editor={editor} /></div>
          <div className={MENU_DIVIDER} />
        </>
      )}
      {row('duplicate', t.editor.arrange.duplicate)}
      <div className={MENU_DIVIDER} />
      {(['bringToFront', 'bringForward', 'sendBackward', 'sendToBack'] as const).map((action) => row(action, t.editor.arrange[action]))}
      <div className={MENU_DIVIDER} />
      {ids.length > 1 && row('group', t.editor.arrange.group)}
      {target.types.some((type) => type === 'group') && row('ungroup', t.editor.arrange.ungroup)}
      {row('frameSelection', b.box)}
      <button type="button" onClick={() => { editor.setLocked(target.ids, !locked); onDone() }} className={MENU_ITEM}>{locked ? b.unlock : b.lock}</button>
      <button type="button" onClick={() => { editor.setHidden(target.ids, !hidden, target.pageId, target.formatId); onDone() }} className={MENU_ITEM}>{hidden ? b.show : b.hide}</button>
      {row('mask', t.editor.arrange.mask, masks)}
      {sized && (
        <>
          <div className={MENU_DIVIDER} />
          <div className="px-1.5 py-1"><RotationField target={target} p={p} /></div>
        </>
      )}
      {text && (
        <div className="px-1.5 pt-1 pb-1">
          <Choice
            name={b.upDown}
            value={aligns.size === 1 ? [...aligns][0] : 'mixed'}
            options={['top', 'middle', 'bottom']}
            labels={p.verticalAligns}
            onSet={(verticalAlign) => set(target, () => ({ verticalAlign }))}
          />
        </div>
      )}
    </>
  )
}

/** The bar's buttons that can be used, in order. */
const itemsOf = (bar: HTMLElement) => [...bar.querySelectorAll<HTMLElement>('[data-bar-item]:not(:disabled)')]

/** Moves focus along the bar's buttons with the arrow keys, as a toolbar does. */
function arrowAlong(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
  const items = itemsOf(event.currentTarget)
  const at = items.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  event.preventDefault()
  const forward = (event.key === 'ArrowRight') !== (getComputedStyle(event.currentTarget).direction === 'rtl')
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (forward ? 1 : -1) + items.length) % items.length
  items[next]?.focus()
}

export function SelectionBar({ editor, brandId }: { editor: Editor; brandId: string }) {
  const t = useMessages()
  const b = t.editor.bar
  const ids = useSelection(editor)
  const selected = useTarget(editor, ids)
  const [bar, setBar] = useState<HTMLDivElement | null>(null)
  const place = usePlace(editor, bar)
  const [open, setOpen] = useState<string | null>(null)
  // A popover belongs to the selection it was opened for.
  const [openFor, setOpenFor] = useState(ids)
  if (openFor !== ids) {
    setOpenFor(ids)
    setOpen(null)
  }
  // Tab reaches the bar once, at the button last focused; the arrows move along it.
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    if (!bar) return
    const items = itemsOf(bar)
    const at = Math.min(current, items.length - 1)
    items.forEach((item, i) => {
      item.tabIndex = i === at ? 0 : -1
    })
  })
  if (ids.length === 0) return null
  const several = ids.length > 1
  const act = (action: ShortcutAction) => editor.perform(action)
  const focused = (event: FocusEvent<HTMLDivElement>) => {
    const at = itemsOf(event.currentTarget).indexOf(event.target)
    if (at >= 0) setCurrent(at)
  }
  return (
    <div
      ref={setBar}
      role="toolbar"
      aria-label={b.label}
      data-testid="selection-bar"
      onKeyDown={arrowAlong}
      onFocus={focused}
      style={place ? { left: place.left, top: place.top } : undefined}
      className={cn(BAR, place ? 'visible' : 'invisible')}
    >
      {selected && selected.target.types.some((type) => type === 'text') && <TextBar target={selected.target} brandId={brandId} open={open} onOpen={setOpen} />}
      {/* One layer's own buttons; several layers have the actions that act on them together, and their look in the panel. */}
      {selected && !several && !selected.target.types.every((type) => type === 'text') && <ShapeBar target={selected.target} brandId={brandId} open={open} onOpen={setOpen} />}
      {several && (
      <BarPopover id="line-up" open={open} onOpen={setOpen} label={b.lineUp} testId="line-up">
        <AlignRow editor={editor} />
        <div className={MENU_DIVIDER} />
        {DISTRIBUTE.map(({ action }) => (
          <button key={action} type="button" data-action={action} disabled={ids.length < 3} onClick={() => act(action)} className={MENU_ITEM}>
            {t.editor.arrange[action]}
            <kbd className={MENU_KEY}>{keyOf(action)}</kbd>
          </button>
        ))}
      </BarPopover>
      )}
      {several && (
        <>
          <BarPopover id="combine" open={open} onOpen={setOpen} label={b.combine} testId="combine">
            {COMBINE.map(({ action, icon: Icon }) => (
              <button key={action} type="button" data-action={action} onClick={() => act(action)} className={MENU_ITEM}>
                <span className="flex items-center gap-2"><Icon size={16} aria-hidden />{t.editor.arrange[action]}</span>
                <kbd className={MENU_KEY}>{keyOf(action)}</kbd>
              </button>
            ))}
          </BarPopover>
          <span aria-hidden className={BAR_DIVIDER} />
          <button type="button" data-bar-item data-action="group" onClick={() => act('group')} className={BAR_BUTTON}><SelectionPlusIcon size={16} aria-hidden />{t.editor.arrange.group}</button>
          <button type="button" data-bar-item data-action="frameSelection" onClick={() => act('frameSelection')} className={BAR_BUTTON}><BoundingBoxIcon size={16} aria-hidden />{b.box}</button>
          <button type="button" data-bar-item data-action="autoLayout" onClick={() => act('autoLayout')} className={BAR_BUTTON}><RowsIcon size={16} aria-hidden />{b.autoLayout}</button>
          <span aria-hidden className={BAR_DIVIDER} />
        </>
      )}
      <Popover.Root open={open === 'more'} onOpenChange={(to) => setOpen(to ? 'more' : null)}>
        <Popover.Trigger asChild>
          <button type="button" data-bar-item aria-label={b.more} title={b.more} data-testid="bar-more" className={cn(BAR_BUTTON, 'px-1.5')}>
            <DotsThreeIcon size={18} weight="bold" aria-hidden />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="bottom" align="end" sideOffset={8} collisionPadding={12} onCloseAutoFocus={(event) => keepFocus(event, open, 'more')} aria-label={b.more} data-testid="bar-more-menu" className={cn(POPOVER, 'flex w-60 flex-col p-1.5')}>
            <LayerActions editor={editor} ids={ids} onDone={() => setOpen(null)} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}

/** The layer actions at a right-click on the stage, for what it picked; it closes once the selection changes. */
export function StageMenu({ editor, at, onClose }: { editor: Editor; at: { x: number; y: number }; onClose: () => void }) {
  const t = useMessages()
  const ids = useSelection(editor)
  const [openedFor] = useState(ids)
  useEffect(() => {
    if (ids !== openedFor) onClose()
  }, [ids, openedFor, onClose])
  return (
    <Popover.Root open onOpenChange={(to) => !to && onClose()}>
      <Popover.Anchor asChild>
        <span aria-hidden className="pointer-events-none absolute size-0" style={{ left: at.x, top: at.y }} />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={2}
          collisionPadding={12}
          // A click elsewhere or Esc closes it; focus given back to a button that just closed does not.
          onFocusOutside={(event) => event.preventDefault()}
          aria-label={t.editor.bar.actions}
          data-testid="stage-menu" className={cn(POPOVER, 'flex w-60 flex-col p-1.5')}>
          <LayerActions editor={editor} ids={ids} onDone={onClose} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
