// Telling SVG markup from other text, before reading it: what an upload, a paste or a fetched
// asset is checked with. It walks the prolog once, so any text is checked in time linear in its length.

/** An SVG file's media type, as clipboards and uploads name it. */
export const SVG_TYPE = 'image/svg+xml'

/** Text that is an SVG file, trimmed, or null: markup opening with <svg after any declaration, comment or doctype. */
export function svgMarkup(text: string | undefined): string | null {
  const trimmed = text?.trim() ?? ''
  let at = 0
  for (;;) {
    while (/\s/.test(trimmed[at] ?? '')) at++
    if (trimmed.startsWith('<?', at)) at = after(trimmed, '?>', at)
    else if (trimmed.startsWith('<!--', at)) at = after(trimmed, '-->', at)
    else if (trimmed.startsWith('<!', at)) {
      // A doctype, with its internal subset if it has one.
      const close = trimmed.indexOf('>', at)
      const bracket = trimmed.indexOf('[', at)
      if (bracket >= 0 && bracket < close) {
        at = after(trimmed, ']', bracket)
        if (at >= 0) at = after(trimmed, '>', at)
      } else {
        at = close < 0 ? -1 : close + 1
      }
    } else break
    if (at < 0) return null
  }
  return /^<svg[\s/>]/i.test(trimmed.slice(at, at + 5)) ? trimmed : null
}

/** Where the text goes on after the next `end` from `from`, or -1 when there is none. */
function after(text: string, end: string, from: number) {
  const found = text.indexOf(end, from)
  return found < 0 ? -1 : found + end.length
}
