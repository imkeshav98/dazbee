'use client'

// The zoom pill at the stage's bottom corner (#36): out, the zoom, in, and the keyboard shortcuts.
// The zoom opens a menu with every zoom and how the stage is shown: rulers and snapping. The same
// zooms are on Ctrl/Cmd+=, Ctrl/Cmd+-, Shift+1, Shift+2 and Ctrl/Cmd+0, the rulers on Shift+R. On
// phones it moves to the top corner, since the capsule takes the bottom (#82).
import { MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'

import type { Editor } from '@dazbee/editor'

import { SWITCH } from '@/components/editor/styles.ts'
import { Menu, MenuCheck, MenuDivider, MenuItem } from '@/components/ui/menu.tsx'
import { Tooltip } from '@/components/ui/tooltip.tsx'
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
      <Menu
        trigger={
          <button
            type="button"
            aria-label={t.editor.zoomMenu}
            disabled={off}
            data-testid="zoom"
            className={`${BUTTON} w-14 font-mono text-xs tabular-nums text-text`}
          >
            {zoom === null ? '' : percent.format(zoom)}
          </button>
        }
        tooltip={t.editor.zoomMenu}
        open={open}
        onOpenChange={setOpen}
        label={t.editor.zoomMenu}
        testId="zoom-menu"
        place={{ side: 'top', align: 'end', sideOffset: 10, collisionPadding: 12 }}
        className="w-60"
      >
        {zooms.map((z) => (
          <MenuItem key={z.label} label={z.label} keys={z.key} onSelect={z.run} />
        ))}
        <MenuDivider />
        {toggles.map((toggle) => (
          <MenuCheck
            key={toggle.label}
            label={toggle.label}
            {...('key' in toggle && { keys: toggle.key })}
            checked={toggle.on}
            onCheckedChange={toggle.flip}
            mark={<span aria-hidden className={SWITCH} />}
          />
        ))}
      </Menu>
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
