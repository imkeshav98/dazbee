// Copied layers on the clipboard, kept on this device too, so a paste that brings only their
// plain text still pastes them.
import { LAYER_CLIPBOARD_TYPE, LayerClipboard, type LayerTree } from '@dazbee/schema'

/**
 * The last layers copied, kept in this browser too with the plain text the copy wrote: a paste
 * that brings that text but not our own type (Mod+Shift+V pastes plain text only, and Safari
 * drops custom types) still pastes the layers.
 */
const REMEMBERED = 'dazbee.copiedLayers'

/** Keeps copied layers on this device, as JSON and as their names in plain text; `kept` is false without storage. */
export function keepCopy(copied: LayerClipboard) {
  const json = JSON.stringify(copied)
  const plain = copied.tree.roots.map((id) => copied.tree.nodes[id]?.name || 'Layer').join('\n')
  try {
    localStorage.setItem(REMEMBERED, JSON.stringify({ plain, json }))
    return { json, plain, kept: true }
  } catch {
    return { json, plain, kept: false }
  }
}

/** Puts copied layers on the clipboard in our own type and as their names in plain text, and keeps them on this device. */
export function putOnClipboard(data: DataTransfer, copied: LayerClipboard) {
  // Without storage, only pastes that keep our own type paste layers.
  const { json, plain } = keepCopy(copied)
  data.setData(LAYER_CLIPBOARD_TYPE, json)
  data.setData('text/plain', plain)
}

/**
 * The layers a paste brings: in our own type, or the copy kept on this device when the paste brings
 * only the plain text that copy wrote. Null for anything else.
 */
export function layersOnClipboard(data: DataTransfer | null): LayerTree | null {
  let raw = data?.getData(LAYER_CLIPBOARD_TYPE)
  const plain = data?.getData('text/plain')
  try {
    if (!raw && plain) {
      const kept = JSON.parse(localStorage.getItem(REMEMBERED) ?? 'null') as { plain?: string; json?: string } | null
      if (kept?.plain === plain) raw = kept.json
    }
    const parsed = raw ? LayerClipboard.safeParse(JSON.parse(raw)) : null
    return parsed?.success ? parsed.data.tree : null
  } catch {
    return null
  }
}

/** The layers last copied in Dazbee on this device, as kept in browser storage; null when there are none. */
export function rememberedLayers(): LayerTree | null {
  try {
    const kept = JSON.parse(localStorage.getItem(REMEMBERED) ?? 'null') as { json?: string } | null
    const parsed = kept?.json ? LayerClipboard.safeParse(JSON.parse(kept.json)) : null
    return parsed?.success ? parsed.data.tree : null
  } catch {
    return null
  }
}
