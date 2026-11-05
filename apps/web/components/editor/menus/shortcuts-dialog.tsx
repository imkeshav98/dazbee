'use client'

// Every keyboard shortcut of the editor in one place (#158): the table the stage acts on, grouped,
// with each key as this computer names it. It opens from the View card's keyboard button, or with
// ? anywhere but a text field.
import { KeyboardIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

import { type ShortcutAction, SHORTCUTS } from '@dazbee/editor'

import { overlayScroll } from '@/components/ui/overlay-scroll.ts'
import { useMessages } from '@/lib/i18n/client.tsx'
import type { Messages } from '@/lib/i18n/index.ts'

type Group = keyof Messages['editor']['shortcuts']['groups']
/** The table's actions the list names: every one that does something. */
type Listed = ShortcutAction & keyof Messages['editor']['shortcuts']['actions']

/** The table's actions, in the groups the list shows them in. */
const GROUPS: [Group, Listed[]][] = [
  ['edit', ['undo', 'redo', 'selectAll', 'deselect', 'delete', 'duplicate', 'editPoints', 'copyStyle', 'pasteStyle']],
  [
    'tools',
    [
      'toolSelect',
      'toolHand',
      'toolFrame',
      'toolRect',
      'toolEllipse',
      'toolLine',
      'toolArrow',
      'toolPen',
      'toolText',
      'toolImage',
    ],
  ],
  [
    'arrange',
    [
      'group',
      'ungroup',
      'boxSelection',
      'bringForward',
      'sendBackward',
      'bringToFront',
      'sendToBack',
      'lock',
      'hide',
      'mask',
      'autoLayout',
    ],
  ],
  [
    'align',
    [
      'alignLeft',
      'alignCentre',
      'alignRight',
      'alignTop',
      'alignMiddle',
      'alignBottom',
      'distributeHorizontal',
      'distributeVertical',
    ],
  ],
  ['combine', ['booleanUnion', 'booleanSubtract', 'booleanIntersect', 'booleanExclude']],
  ['linked', ['styleToLinked', 'textToLinked', 'lockLinked', 'hideLinked']],
  [
    'move',
    ['nudgeLeft', 'nudgeRight', 'nudgeUp', 'nudgeDown', 'nudgeLeftFar', 'nudgeRightFar', 'nudgeUpFar', 'nudgeDownFar'],
  ],
  ['view', ['zoomIn', 'zoomOut', 'zoomToFit', 'zoomToSelection', 'zoomTo100', 'toggleRulers']],
]

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** How each key of a spec reads on this computer: ⌘ ⌥ ⇧ on a Mac, Ctrl Alt Shift elsewhere. */
function keysOf(spec: string, mac: boolean) {
  const named: Record<string, string> = {
    Mod: mac ? '⌘' : 'Ctrl',
    Alt: mac ? '⌥' : 'Alt',
    Shift: mac ? '⇧' : 'Shift',
    BracketRight: ']',
    BracketLeft: '[',
    Equal: '=',
    Minus: '-',
    NumpadAdd: 'Num +',
    NumpadSubtract: 'Num −',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Escape: 'Esc',
    Backspace: '⌫',
    Delete: 'Del',
  }
  return spec.split('+').map((key) => named[key] ?? key.replace(/^Digit/, ''))
}

export function ShortcutsButton({ className }: { className: string }) {
  const t = useMessages().editor.shortcuts
  const dialog = useRef<HTMLDialogElement>(null)
  const [mac, setMac] = useState(false)
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform))
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      e.preventDefault()
      if (!dialog.current?.open) dialog.current?.showModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <button
        type="button"
        aria-label={t.open}
        title={t.openKey}
        onClick={() => dialog.current?.showModal()}
        className={className}
      >
        <KeyboardIcon size={16} aria-hidden />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="shortcuts-title"
        data-testid="shortcuts"
        // A click on the backdrop, outside the panel, closes it.
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="m-auto max-h-[min(80dvh,46rem)] w-[min(92vw,52rem)] overflow-hidden rounded-[20px] surface-frost p-0 text-text"
      >
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex h-14 shrink-0 items-center gap-2 ps-6 pe-3">
            <h2 id="shortcuts-title" className="flex-1 font-display text-lg font-bold tracking-tight">
              {t.title}
            </h2>
            <button
              type="button"
              aria-label={t.close}
              onClick={() => dialog.current?.close()}
              className="grid size-8 cursor-pointer place-items-center rounded-full text-subtle hover:bg-hover hover:text-text active:bg-pressed"
            >
              <XIcon size={16} aria-hidden />
            </button>
          </div>
          <div ref={overlayScroll} className="min-h-0 columns-1 gap-8 overflow-y-auto px-6 pb-6 sm:columns-2">
            {GROUPS.map(([group, actions]) => (
              <section key={group} aria-labelledby={`shortcuts-${group}`} className="mb-5 break-inside-avoid">
                <h3
                  id={`shortcuts-${group}`}
                  className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-subtle uppercase"
                >
                  {t.groups[group]}
                </h3>
                <dl className="flex flex-col">
                  {actions.map((action) => {
                    const keys = SHORTCUTS.find((s) => s.action === action)?.keys ?? []
                    return (
                      <div
                        key={action}
                        data-shortcut={action}
                        className="flex items-center justify-between gap-3 border-t border-line py-1.5 first:border-t-0"
                      >
                        <dt className="min-w-0 text-[13px]">{t.actions[action]}</dt>
                        <dd className="flex shrink-0 flex-wrap justify-end gap-1.5" dir="ltr">
                          {keys.slice(0, 2).map((spec, n) => (
                            <span key={spec} className="flex items-center gap-0.5">
                              {n > 0 && <span className="pe-1 text-[11px] text-subtle">{t.or}</span>}
                              {keysOf(spec, mac).map((key, i) => (
                                // A keycap: the well's tint with no outline, its key in the well's muted shade.
                                <kbd
                                  key={i}
                                  className="min-w-6 rounded-[6px] bg-well px-1.5 py-0.5 text-center font-mono text-[11px] text-muted [--text-muted:var(--glass-well-muted)]"
                                >
                                  {key}
                                </kbd>
                              ))}
                            </span>
                          ))}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </dialog>
    </>
  )
}
