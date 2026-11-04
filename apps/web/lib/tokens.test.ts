// Every text token reads at 4.5:1 or more on every surface it sits on, in both themes (#51), and
// text on glass reads at 4.5:1 or more whatever ad lies behind the glass.
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

type Rgb = [number, number, number]

const css = readFileSync(new URL('../app/styles/tokens.css', import.meta.url), 'utf8')
const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

/** Ads glass floats over: white and black, the two ends, and two bright ones. */
const ADS = { white: '#ffffff', black: '#000000', yellow: '#ffd23f', pink: '#ff48b0' }

const TEXT = ['text', 'text-muted', 'text-subtle', 'accent-text', 'danger', 'success', 'warning']
const SURFACES = ['bg', 'surface', 'raised', 'hover']

function block(selector: string): string {
  const at = css.indexOf(selector)
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
}

function tokens(selector: string): Record<string, string> {
  return Object.fromEntries([...block(selector).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
}

/** The see-through colours of a theme, `rgb(r g b / alpha)`, by name. */
function tints(selector: string): Record<string, { rgb: Rgb; alpha: number }> {
  return Object.fromEntries(
    [...block(selector).matchAll(/--([\w-]+):\s*rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/g)].map((m) => [
      m[1],
      { rgb: [Number(m[2]), Number(m[3]), Number(m[4])] as Rgb, alpha: Number(m[5]) },
    ]),
  )
}

/** The saturation the glass's backdrop filter gives what lies behind it, from globals.css. */
function glassSaturation(): number {
  const frost = globals.slice(globals.indexOf('@utility surface-frost'))
  const found = /backdrop-filter:[^;]*saturate\(([\d.]+)\)/.exec(frost.slice(0, frost.indexOf('\n}')))
  if (!found?.[1]) throw new Error('no saturate() in the surface-frost backdrop filter')
  return Number(found[1])
}

const channels = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
const hexOf = (rgb: Rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex)
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

/** CSS saturate(s) on one colour, as the filter's colour matrix does it, each channel kept in range. */
function saturate([r, g, b]: Rgb, s: number): Rgb {
  const clamp = (c: number) => Math.min(255, Math.max(0, c))
  return [
    clamp((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b),
    clamp((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b),
    clamp((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b),
  ]
}

/** A see-through colour painted over another, as the browser blends them. */
const over = ({ rgb, alpha }: { rgb: Rgb; alpha: number }, under: Rgb): Rgb =>
  rgb.map((c, i) => c * alpha + (under[i] ?? 0) * (1 - alpha)) as Rgb

describe.each([
  ['dark', "[data-theme='dark']"],
  ['light', "[data-theme='light']"],
])('%s theme', (_, selector) => {
  const t = tokens(selector)

  it.each(TEXT.flatMap((text) => SURFACES.map((surface) => [text, surface])))(
    '%s on %s is at least 4.5:1',
    (text, surface) => {
      const fg = t[text]
      const bg = t[surface]
      if (!fg || !bg) throw new Error(`missing token ${fg ? surface : text}`)
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('text on the pink buttons is at least 4.5:1', () => {
    for (const button of ['accent-solid', 'accent-solid-hover']) {
      expect(contrast(t['on-accent'] ?? '', t[button] ?? '')).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe.each([
  ['dark', "[data-theme='dark']"],
  ['light', "[data-theme='light']"],
])('%s glass', (_, selector) => {
  const t = tokens(selector)
  const see = tints(selector)
  const saturation = glassSaturation()
  const glassOver = (ad: string) => {
    const glass = see.glass
    if (!glass) throw new Error('missing token glass')
    return over(glass, saturate(channels(ad), saturation))
  }

  it.each(Object.entries(ADS).flatMap(([ad, hex]) => ['text', 'glass-muted'].map((text) => [text, ad, hex])))(
    '%s on glass over a %s ad is at least 4.5:1',
    (text, _ad, hex) => {
      expect(contrast(t[text] ?? '', hexOf(glassOver(hex)))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(Object.entries(ADS).flatMap(([ad, hex]) => ['glass-hover', 'glass-pressed'].map((tint) => [tint, ad, hex])))(
    'text on the %s tint over a %s ad is at least 4.5:1',
    (tint, _ad, hex) => {
      const tinted = see[tint]
      if (!tinted) throw new Error(`missing token ${tint}`)
      expect(contrast(t.text ?? '', hexOf(over(tinted, glassOver(hex))))).toBeGreaterThanOrEqual(4.5)
    },
  )
})
