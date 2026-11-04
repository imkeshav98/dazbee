/** A colour as people type it: #RRGGBB, with the alpha only when it isn't opaque. */
export const shown = (value: string) =>
  (value.slice(7).toUpperCase() === 'FF' ? value.slice(0, 7) : value).toUpperCase()
/** A typed hex colour as the design stores it, #RRGGBBAA, or null when it isn't one. */
export function parseHex(text: string): string | null {
  const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text.trim())
  return match ? `#${match[1]}${match[2] ?? 'FF'}`.toUpperCase() : null
}
