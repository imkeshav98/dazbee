'use client'

// The selected layers' own actions, one list for the small menu's ⋯ (the full menu) and the
// right-click menu: Copy ▸ and Paste ▸ (the layers or their style), duplicate, Copy to other frames ▸
// (style, text or the layer, into the linked frames); box, ungroup for a group or a box, mask (or
// release the mask a layer is under); and, at the bottom, lock, hide and delete in all frames, acting
// on the layers and their linked copies. Every row runs the same editor action as its shortcut. An
// item that never applies is left out; one with nothing to do is greyed, its tooltip saying why, as
// Ungroup is while the group or box is locked or auto layout would move what it holds. How the
// layers sit (order, line up, the turn, text direction) is in the Position panel and the text's Align.
import { useMemo } from 'react'

import { childrenOf } from '@dazbee/doc'
import type { Editor, ShortcutAction, UngroupState } from '@dazbee/editor'
import type { Design } from '@dazbee/schema'

import { keyOf } from '@/components/editor/arrange-actions.ts'
import { useTarget } from '@/components/editor/edit-panel/target.ts'
import { MenuDivider, MenuItem, MenuSub } from '@/components/ui/menu.tsx'
import { useMessages } from '@/lib/i18n/client.tsx'
import { format, type Messages } from '@/lib/i18n/index.ts'

/** Why an item has nothing to do: the reason the linked-copy items give, by its message. */
type Why = keyof Messages['editor']['bar']['linked']['why']

/** Why Ungroup has nothing to do, or null while it has something to do. */
const ungroupWhy = (state: UngroupState, b: Messages['editor']['bar']) =>
  state === 'locked' ? b.lockedRow : state === 'placedByLayout' ? b.ungroupMoves : null

/**
 * The masks the layers are under, each the nearest mask before it among its siblings; null unless
 * every layer is under one and none is a mask itself.
 */
function masksOver(design: Design, ids: readonly string[]): string[] | null {
  const masks = new Set<string>()
  for (const id of ids) {
    const node = design.nodes[id]
    if (!node || node.props.mask) return null
    const siblings = childrenOf(design, node.parentId)
    const before = siblings.slice(
      0,
      siblings.findIndex(([sibling]) => sibling === id),
    )
    const mask = before.findLast(([, sibling]) => sibling.props.mask)
    if (!mask) return null
    masks.add(mask[0])
  }
  return [...masks]
}

/**
 * The layers' own actions in short groups with only what applies. Copy fires the same copy event as
 * the keyboard's, so the clipboard and the copy kept for Paste both change; Paste places the layers
 * last copied in Dazbee.
 */
export function LayerActions({ editor, ids, onDone }: { editor: Editor; ids: string[]; onDone: () => void }) {
  const t = useMessages()
  const b = t.editor.bar
  const selected = useTarget(editor, ids)
  // Asked as the menu opens and again whenever the design changes: it tries the ungroup on a copy of it.
  const shown = selected?.design
  const key = ids.join(' ')
  const ungroup = useMemo(() => (shown && key ? editor.ungroupState() : 'none'), [editor, shown, key])
  if (!selected) return null
  const { target, design } = selected
  const run = (action: ShortcutAction) => {
    editor.perform(action)
    onDone()
  }
  const row = (action: ShortcutAction, label: string, checked?: boolean) => (
    <MenuItem
      key={action}
      action={action}
      label={label}
      keys={keyOf(action)}
      {...(checked === undefined ? {} : { checked })}
      onSelect={() => run(action)}
    />
  )
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const mod = mac ? '⌘' : 'Ctrl'
  const [copyKey, pasteKey] = [`${mod}+C`, `${mod}+V`]
  const masks = target.props.every((pr) => Boolean(pr.mask))
  const over = masksOver(design, target.ids)
  const linked = editor.linkedMenu()
  if (!linked) return null
  const l = b.linked
  /** What an item says while it has nothing to do, or null while it has something to do. */
  const whyOf = (state: Why | 'ready' | 'hidden') => (state === 'ready' || state === 'hidden' ? null : l.why[state])
  /** A row that runs an action, greyed with the reason while it has nothing to do. */
  const actionRow = (action: ShortcutAction, label: string, why: string | null, danger = false) => (
    <MenuItem
      key={action}
      action={action}
      label={label}
      keys={keyOf(action)}
      why={why}
      danger={danger}
      onSelect={() => run(action)}
    />
  )
  return (
    <>
      <MenuSub label={b.copy} testId="more-copy">
        <MenuItem
          action="copy"
          label={b.copy}
          keys={copyKey}
          onSelect={() => {
            if (!document.execCommand('copy')) editor.copyLayers()
            onDone()
          }}
        />
        {actionRow('copyStyle', l.copyStyle, whyOf(linked.copyStyle))}
      </MenuSub>
      <MenuSub label={b.paste} testId="more-paste">
        <MenuItem
          action="paste"
          label={b.paste}
          keys={pasteKey}
          why={editor.canPasteLayers() ? null : l.why.nothingToPaste}
          onSelect={() => {
            editor.pasteLayers()
            onDone()
          }}
        />
        {actionRow('pasteStyle', l.pasteStyle, whyOf(linked.pasteStyle))}
      </MenuSub>
      {row('duplicate', t.editor.arrange.duplicate)}
      <MenuDivider />
      {linked.frames === 0 ? (
        <MenuItem
          action="copyToFrames"
          testId="more-copy-to-frames"
          label={l.copyToFrames}
          why={l.why.noFrames}
          caret
        />
      ) : (
        <MenuSub
          label={l.copyToFrames}
          testId="more-copy-to-frames"
          wide
          heading={linked.reach === 1 ? l.toFrame : format(l.toFrames, { n: linked.reach })}
        >
          {actionRow('styleToLinked', l.style, whyOf(linked.style))}
          {linked.text !== 'hidden' && actionRow('textToLinked', l.text, whyOf(linked.text))}
          {actionRow('layerToLinked', l.layer, whyOf(linked.layer))}
        </MenuSub>
      )}
      {actionRow(
        'selectLinkedCopies',
        l.selectCopies,
        linked.select === 'ready'
          ? null
          : l.why[linked.select === 'copiesLocked' ? 'copiesLockedApart' : linked.select],
      )}
      <MenuDivider />
      {row('boxSelection', b.putInBox)}
      {target.types.every((type) => type === 'group' || type === 'box') &&
        actionRow('ungroup', t.editor.arrange.ungroup, ungroupWhy(ungroup, b))}
      {over ? (
        <MenuItem
          action="releaseMask"
          label={b.releaseMask}
          why={over.some((id) => design.nodes[id]?.lock?.style) ? b.maskLocked : null}
          onSelect={() => {
            // The mask becomes a layer of its own again, in one undo step.
            editor.session.run('node.mask', { ids: over, mask: null })
            onDone()
          }}
        />
      ) : (
        row('mask', t.editor.arrange.mask, masks)
      )}
      <MenuDivider />
      {actionRow('lockLinked', linked.lock === 'lock' ? l.lockAll : l.unlockAll, null)}
      {actionRow('hideLinked', linked.hide === 'hide' ? l.hideAll : l.showAll, null)}
      {actionRow('deleteLinked', l.deleteAll, whyOf(linked.delete), true)}
    </>
  )
}
