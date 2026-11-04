'use client'

// The actions that arrange the selection, for the bar by it and ⋯ More: align, distribute and combine,
// each with its shortcut. Several layers line up with each other; one layer lines up with the
// format, or the group or box it is in. Two or more shapes combine into a live boolean.
import {
  AlignBottomIcon,
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  ArrowsHorizontalIcon,
  ArrowsVerticalIcon,
  ExcludeSquareIcon,
  type Icon,
  IntersectSquareIcon,
  SubtractSquareIcon,
  UniteSquareIcon,
} from '@phosphor-icons/react'

import { type ShortcutAction, SHORTCUTS } from '@dazbee/editor'

export type Action = Extract<
  ShortcutAction,
  | `align${string}`
  | `distribute${string}`
  | `boolean${string}`
  | 'group'
  | 'boxSelection'
  | 'ungroup'
  | 'duplicate'
  | 'mask'
  | 'bringToFront'
  | 'bringForward'
  | 'sendBackward'
  | 'sendToBack'
>
export const ALIGN: { action: Action; icon: Icon }[] = [
  { action: 'alignLeft', icon: AlignLeftIcon },
  { action: 'alignCentre', icon: AlignCenterHorizontalIcon },
  { action: 'alignRight', icon: AlignRightIcon },
  { action: 'alignTop', icon: AlignTopIcon },
  { action: 'alignMiddle', icon: AlignCenterVerticalIcon },
  { action: 'alignBottom', icon: AlignBottomIcon },
]
export const DISTRIBUTE: { action: Action; icon: Icon }[] = [
  { action: 'distributeHorizontal', icon: ArrowsHorizontalIcon },
  { action: 'distributeVertical', icon: ArrowsVerticalIcon },
]

export const COMBINE: { action: Action; icon: Icon }[] = [
  { action: 'booleanUnion', icon: UniteSquareIcon },
  { action: 'booleanSubtract', icon: SubtractSquareIcon },
  { action: 'booleanIntersect', icon: IntersectSquareIcon },
  { action: 'booleanExclude', icon: ExcludeSquareIcon },
]

/** The first key the shortcut table lists for an action, as it spells it (`Mod+BracketRight`). */
const specOf = (action: ShortcutAction): string => SHORTCUTS.find((s) => s.action === action)?.keys[0] ?? ''
const brackets = (spec: string) => spec.replace('BracketRight', ']').replace('BracketLeft', '[')

/** A shortcut as the tooltip shows it: Ctrl for Mod, or ⌘ and ⌥ on a Mac, and the bracket keys as [ and ]. */
export function keyOf(action: ShortcutAction) {
  const spec = specOf(action)
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return brackets(spec.replace('Mod', mac ? '⌘' : 'Ctrl').replace('Alt', mac ? '⌥' : 'Alt'))
}
