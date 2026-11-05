// Exporting the design as this tab holds it: one frame drawn here on the CPU surface as pixels, or
// files drawn in the export worker so the stage stays responsive.
import type { CanvasKit } from '@dazbee/canvaskit'
import type { Session } from '@dazbee/doc'
import type { ExportedFile } from '@dazbee/export'
import { renderDesign, type ResourceCache } from '@dazbee/renderer'
import type { ExportRequestInput } from '@dazbee/schema'

import type { EditorView } from '../canvas/view.ts'
import type { EditorResources } from '../resources.ts'
import { exportClient } from './export-client.ts'

export interface ExportsDeps {
  ck: CanvasKit
  cache: ResourceCache
  session: Pick<Session, 'design'>
  resources: Pick<EditorResources, 'bytes' | 'screen' | 'loaded'>
  view: Pick<EditorView, 'defaultFrame'>
}

/** What the `Editor`'s `exportPixels` and `exportFiles` do. */
export interface EditorExports {
  pixels(frameId?: string): Uint8Array
  files(request: ExportRequestInput, progress?: (done: number, total: number) => void): Promise<ExportedFile>
  /** Stops the export worker, if one started. */
  destroy(): void
}

export function editorExports({ ck, cache, session, resources, view }: ExportsDeps): EditorExports {
  const { defaultFrame } = view
  // Exports are drawn in a worker of their own (#55), started at the first one.
  const exporter = exportClient()

  /** A frame drawn as pixels, shown or not; the shown page's first frame by default. */
  function exportPixels(frameId?: string) {
    const id = frameId ?? defaultFrame().id
    return renderDesign(ck, session.design(), id, resources.bytes(), cache).pixels
  }
  async function exportFiles(request: ExportRequestInput, progress?: (done: number, total: number) => void) {
    // A family picked or an image placed a moment ago is drawn as itself, never the fallback or a gap.
    resources.screen(session.design())
    await resources.loaded()
    return exporter.run(session.design(), request, resources.bytes(), progress)
  }

  return {
    pixels: exportPixels,
    files: exportFiles,
    destroy: () => exporter.destroy(),
  }
}
