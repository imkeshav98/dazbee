// The name a frame takes from its size: the preset's name when the size is a preset's, else "Frame".
import { presetOf } from '@dazbee/schema'

import type { Messages } from '@/lib/i18n/index.ts'

export function frameName(t: Messages, width: number, height: number): string {
  const preset = presetOf(width, height)
  return preset ? t.editor.sizes.preset[preset.id] : t.editor.frames.name
}
