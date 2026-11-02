// Telling SVG markup from other text, before reading it: what an upload, a paste or a fetched
// asset is checked with.

/** An SVG file's media type, as clipboards and uploads name it. */
export const SVG_TYPE = 'image/svg+xml'

/** Text that is an SVG file, trimmed, or null: markup opening with <svg after any declaration, comment or doctype. */
export function svgMarkup(text: string | undefined): string | null {
  const trimmed = text?.replace(/^﻿/, '').trim() ?? ''
  return /^(?:<\?xml[^>]*>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>\s*)*<svg[\s>]/i.test(trimmed) ? trimmed : null
}
