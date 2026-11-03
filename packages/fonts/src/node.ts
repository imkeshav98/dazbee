import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FONT_FACES, type FontFile } from './index.ts'

export const FONT_FILES_DIR = join(import.meta.dirname, '..', 'files')

/** The shipped faces with their bytes, once read: each thread reads the files once. */
let loaded: (FontFile & { bytes: Uint8Array })[] | undefined

/**
 * Every shipped font face with its bytes, read from this package's files on the first call and
 * kept. Every caller gets the same list, so none may change it.
 */
export function loadFontFiles(): (FontFile & { bytes: Uint8Array })[] {
  loaded ??= FONT_FACES.map((face) => ({
    ...face,
    bytes: new Uint8Array(readFileSync(join(FONT_FILES_DIR, face.file))),
  }))
  return loaded
}
