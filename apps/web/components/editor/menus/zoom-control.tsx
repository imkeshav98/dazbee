'use client'

// The zoom pill at the stage's bottom corner (#36): out, the zoom, in, and the keyboard shortcuts.
// The zoom opens a menu with every zoom and how the stage is shown: rulers and snapping. The same
// zooms are on Ctrl/Cmd+=, Ctrl/Cmd+-, Shift+1, Shift+2 and Ctrl/Cmd+0, the rulers on Shift+R. On
// phones it moves to the top corner, since the capsule takes the bottom (#82).
import { MinusIcon, PlusIcon } from '@phosphor-icons/react'
import * as Popover from '@radix-ui/react-popover'
import { useEffect, useMemo, useState } from 'react'

import type { Editor } from '@dazbee/editor'

import { MENU_DIVIDER, MENU_ITEM, MENU_KEY, POPOVER, SWITCH } from '@/components/editor/styles.ts'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { cn } from '@/lib/cn.ts'
import { useLocale, useMessages } from '@/lib/i18n/client.tsx'

import { ShortcutsButton } from './shortcuts-dialog.tsx'

const BUTTON =
  'grid h-8 min-w-8 cursor-pointer place-items-center rounded-row px-1.5 text-muted transition-colors duration-[var(--chrome-fast)] hover:bg-hover hover:text-text active:bg-pressed disabled:cursor-default disabled:opacity-40'

const viewOf = (editor: Editor | null) => ({ rulers: editor?.rulers() ?? false, snapping: editor?.snapping() ?? true })

/** Whether the rulers and snapping are on, following Shift+R and the menu. */
function useView(editor: Editor | null) {
  const [view, setView] = useState(() => viewOf(editor))
  useEffect(() => {
    setView(viewOf(editor))
    if (!editor) return
    const stop = editor.onView(() => setView(viewOf(editor)))
    return () => {
      stop()
    }
  }, [editor])
  return view
}

export function ZoomControl({ zoom, editor }: { zoom: number | null; editor: Editor | null }) {
  const t = useMessages()
  const locale = useLocale()
  const percent = useMemo(() => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }), [locale])
  const [open, setOpen] = useState(false)
  const view = useView(editor)
  const off = zoom === null || editor === null
  const zooms = [
    { label: t.editor.zoomIn, key: t.editor.zoomInKey, run: () => editor?.zoomIn() },
    { label: t.editor.zoomOut, key: t.editor.zoomOutKey, run: () => editor?.zoomOut() },
    { label: t.editor.zoomFit, key: t.editor.zoomFitKey, run: () => editor?.fitAll() },
    { label: t.editor.zoomSelection, key: t.editor.zoomSelectionKey, run: () => editor?.fitSelection() },
    { label: t.editor.zoom100, key: t.editor.zoom100Key, run: () => editor?.zoomTo(1) },
  ]
  const toggles = [
    {
      label: t.editor.view.rulers,
      key: t.editor.view.rulersKey,
      on: view.rulers,
      flip: () => editor?.perform('toggleRulers'),
    },
    { label: t.editor.view.snap, on: view.snapping, flip: () => editor?.setSnapping(!view.snapping) },
  ] satisfies { label: string; key?: string; on: boolean; flip: () => void }[]
  return (
    <div
      role="group"
      aria-label={t.editor.zoom}
      data-zoom
      className="absolute end-4 bottom-4 z-10 flex max-sm:top-20 max-sm:bottom-auto max-sm:group-data-[bar]/stage:hidden items-center gap-0.5 rounded-card surface-frost p-1"
    >
      <Tooltip label={`${t.editor.zoomOut} · ${t.editor.zoomOutKey}`}>
        <button
          type="button"
          aria-label={t.editor.zoomOut}
          disabled={off}
          onClick={() => editor?.zoomOut()}
          className={BUTTON}
        >
          <MinusIcon size={16} aria-hidden />
        </button>
      </Tooltip>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Tooltip label={t.editor.zoomMenu}>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={t.editor.zoomMenu}
              disabled={off}
              data-testid="zoom"
              className={`${BUTTON} w-14 font-mono text-xs tabular-nums text-text`}
            >
              {zoom === null ? '' : percent.format(zoom)}
            </button>
          </Popover.Trigger>
        </Tooltip>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="end"
            sideOffset={10}
            collisionPadding={12}
            aria-label={t.editor.zoomMenu}
            data-testid="zoom-menu"
            className={cn(POPOVER, 'flex w-60 flex-col p-1.5')}
          >
            {zooms.map((z) => (
              <button
                key={z.label}
                type="button"
                onClick={() => {
                  z.run()
                  setOpen(false)
                }}
                className={MENU_ITEM}
              >
                {z.label}
                <kbd className={MENU_KEY}>{z.key}</kbd>
              </button>
            ))}
            <div className={MENU_DIVIDER} />
            {toggles.map((toggle) => (
              <button
                key={toggle.label}
                type="button"
                role="switch"
                aria-checked={toggle.on}
                onClick={toggle.flip}
                className={MENU_ITEM}
              >
                {toggle.label}
                {'key' in toggle && <kbd className={cn(MENU_KEY, 'ms-auto me-2')}>{toggle.key}</kbd>}
                <span aria-hidden className={SWITCH} />
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <Tooltip label={`${t.editor.zoomIn} · ${t.editor.zoomInKey}`}>
        <button
          type="button"
          aria-label={t.editor.zoomIn}
          disabled={off}
          onClick={() => editor?.zoomIn()}
          className={BUTTON}
        >
          <PlusIcon size={16} aria-hidden />
        </button>
      </Tooltip>
      <ShortcutsButton className={BUTTON} />
    </div>
  )
}
