// What the files that turn an SVG's elements into layers share: the layers they make, and the
// reading state of the one file they work on.

import type { CanvasKit } from '@dazbee/canvaskit'
import type { Rect } from '@dazbee/schema'

import type { Rule } from './style.ts'
import type { XmlElement } from './xml.ts'

/** What a file had that the layers leave out. */
export type Skipped =
  | 'filter'
  | 'image'
  | 'embedded-font'
  | 'foreign-object'
  | 'pattern'
  | 'marker'
  | 'script'
  | 'text-path'
  | 'external-reference'

export type LayerInput = { type: string; parentId: string; index: string; name: string; props: Record<string, unknown> }

/** A layer made from an element: its id and its box in design pixels. */
export interface Piece {
  id: string
  box: Rect
}

/** One file being read: what its elements refer to, and the layers made from it so far. */
export interface Context {
  ck: CanvasKit
  /** The file's elements by their id: what a href or url(#id) names. */
  ids: Map<string, XmlElement>
  /** The rules of the file's <style> sheets. */
  rules: Rule[]
  /** The size a percentage length is of. */
  viewport: { width: number; height: number }
  /** The layers made so far, by id. */
  nodes: Record<string, LayerInput>
  /** What the file had that the layers leave out. */
  skipped: Set<Skipped>
  /** A new layer's id. Throws SvgError past the layer limit. */
  newId: () => string
  /** The family a text layer takes, from the families its CSS lists. */
  fontFamily: (families: string[]) => string
}
