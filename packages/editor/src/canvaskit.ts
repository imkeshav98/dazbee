// The one CanvasKit loader, for the editor and the export worker.
import type { CanvasKit } from '@dazbee/canvaskit'
import canvasKitModule from '@dazbee/canvaskit'
import { WASM_FILE } from '@dazbee/canvaskit/wasm'

// CommonJS whose types claim an ES default export; the bundler hands over the init function itself.
const CanvasKitInit = canvasKitModule as unknown as typeof import('@dazbee/canvaskit').default

/** Loads CanvasKit, its WebAssembly file from the app's `/vendor/`. */
export function loadCanvasKit(): Promise<CanvasKit> {
  return CanvasKitInit({
    locateFile: (file: string) => `/vendor/${file === 'canvaskit.wasm' ? WASM_FILE : file}`,
  })
}
