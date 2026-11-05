// Every text token reads at 4.5:1 or more on every surface it sits on, in both themes; and on glass,
// text reads at 4.5:1 or more on the glass and on every tint laid on it, whatever ad lies behind.
// Text is held to 4.5:1, the minimum of WCAG 2.2 SC 1.4.3 (contrast, minimum). Icons are held to
// 3:1, the minimum of WCAG 2.2 SC 1.4.11 (non-text contrast) for the graphics a control needs: the
// one such check is the pink icon of an open glass button on the pressed tint.
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

type Rgb = [number, number, number]
/** A see-through colour: its channels, and how much of what lies under it it covers. */
interface Tint {
  rgb: Rgb
  alpha: number
}

const css = readFileSync(new URL('../app/styles/tokens.css', import.meta.url), 'utf8')
const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

const THEMES = [
  ['dark', "[data-theme='dark']"],
  ['light', "[data-theme='light']"],
] as const
/** Ads glass floats over: white and black, the two ends, and two bright ones. */
const ADS = { white: '#ffffff', black: '#000000', yellow: '#ffd23f', pink: '#ff48b0' }
/** The ads coloured text on glass is held to. */
const COLOURED_TEXT_ADS = ['white', 'black', 'yellow'] as const

const TEXT = ['text', 'text-muted', 'text-subtle', 'accent-text', 'danger', 'success', 'warning']
const SURFACES = ['bg', 'surface', 'raised', 'hover']
/** The see-through fills laid on glass under text: the hover and pressed tints, the well, the chosen colour's. */
const TINTS = ['glass-hover', 'glass-pressed', 'glass-well', 'accent-soft']

function block(selector: string): string {
  const at = css.indexOf(selector)
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
}

function tokens(selector: string): Record<string, string> {
  return Object.fromEntries([...block(selector).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
}

/** The see-through colours of a theme, `rgb(r g b / alpha)`, by name. */
function tints(selector: string): Record<string, Tint> {
  return Object.fromEntries(
    [...block(selector).matchAll(/--([\w-]+):\s*rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/g)].map((m) => [
      m[1],
      { rgb: [Number(m[2]), Number(m[3]), Number(m[4])] as Rgb, alpha: Number(m[5]) },
    ]),
  )
}

/** The body of a utility in globals.css, `@utility <name> { … }`, up to its closing brace. */
function utility(name: string): string {
  const from = globals.indexOf(`@utility ${name} {`)
  if (from < 0) throw new Error(`no @utility ${name} in globals.css`)
  return globals.slice(from, globals.indexOf('\n}', from))
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

/**
 * CSS saturate(s) on one colour: the saturate matrix of feColorMatrix in the Filter Effects spec
 * (https://www.w3.org/TR/filter-effects-1/#feColorMatrixElement), which saturate() is defined by,
 * each channel kept in range.
 */
function saturate([r, g, b]: Rgb, s: number): Rgb {
  const clamp = (c: number) => Math.min(255, Math.max(0, c))
  return [
    clamp((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b),
    clamp((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b),
    clamp((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b),
  ]
}

/** A see-through colour painted over another, as the browser blends them. */
const over = ({ rgb, alpha }: Tint, under: Rgb): Rgb =>
  rgb.map((c, i) => c * alpha + (under[i] ?? 0) * (1 - alpha)) as Rgb

describe.each(THEMES)('%s theme', (_, selector) => {
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

  it.each(['danger-solid', 'danger-solid-hover'])(
    'text on the red button that confirms a delete, %s, is at least 4.5:1',
    (button) => {
      const fill = t[button]
      if (!fill) throw new Error(`missing token ${button}`)
      expect(contrast(t['on-accent'] ?? '', fill)).toBeGreaterThanOrEqual(4.5)
    },
  )
})

describe.each(THEMES)('%s glass', (_, selector) => {
  const t = tokens(selector)
  const see = tints(selector)
  const saturation = Number(/backdrop-filter:[^;]*saturate\(([\d.]+)\)/.exec(utility('surface-frost'))?.[1])
  const tint = (name: string) => {
    const found = see[name]
    if (!found) throw new Error(`missing token ${name}`)
    return found
  }
  const glassOver = (ad: string) => over(tint('glass'), saturate(channels(ad), saturation))
  const readsOver = (text: string, rgb: Rgb) => contrast(t[text] ?? '', hexOf(rgb))

  it.each(Object.entries(ADS).flatMap(([ad, hex]) => ['text', 'glass-muted'].map((text) => [text, ad, hex])))(
    '%s on glass over a %s ad is at least 4.5:1',
    (text, _ad, hex) => {
      expect(readsOver(text, glassOver(hex))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(Object.entries(ADS).flatMap(([ad, hex]) => TINTS.map((name) => [name, ad, hex])))(
    'text on the %s tint over a %s ad is at least 4.5:1',
    (name, _ad, hex) => {
      expect(readsOver('text', over(tint(name), glassOver(hex)))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(Object.entries(ADS))('in a well over a %s ad, muted text and the chosen chip’s text read', (_ad, hex) => {
    const well = over(tint('glass-well'), glassOver(hex))
    expect(readsOver('glass-well-muted', well)).toBeGreaterThanOrEqual(4.5)
    expect(readsOver('text', over(tint('glass-chip'), well))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(COLOURED_TEXT_ADS.flatMap((ad) => ['glass-accent-text', 'glass-danger'].map((text) => [text, ad])))(
    '%s on glass over a %s ad is at least 4.5:1',
    (text, ad) => {
      expect(readsOver(text, glassOver(ADS[ad as keyof typeof ADS]))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(COLOURED_TEXT_ADS)(
    'a pink icon on the pressed tint, as an open glass button shows it, over a %s ad is at least 3:1',
    (ad) => {
      const pressed = over(tint('glass-pressed'), glassOver(ADS[ad]))
      // An icon is a graphic, so WCAG 2.2 SC 1.4.11 (non-text contrast) asks 3:1 of it, not text's 4.5:1.
      expect(readsOver('glass-accent-text', pressed)).toBeGreaterThanOrEqual(3)
    },
  )

  // A dark swatch on dark glass shows by its ring, as a white one on light glass does; a ring is a
  // graphic, so WCAG 2.2 SC 1.4.11 (non-text contrast) asks 3:1 of it.
  if (_ === 'dark')
    it.each([...Object.entries(ADS), ['canvas', t.canvas ?? '']])(
      "a swatch's ring on glass over the %s is at least 3:1",
      (_under, hex) => {
        expect(readsOver('swatch-ring', glassOver(hex))).toBeGreaterThanOrEqual(3)
      },
    )

  it('a glass dialog over its dimmed canvas is as light or as dark as glass over the canvas itself', () => {
    const canvas = channels(t.canvas ?? '')
    const dialog = over(tint('glass'), over(tint('glass-backdrop'), canvas))
    const menu = over(tint('glass'), canvas)
    expect(Math.abs(luminance(hexOf(dialog)) - luminance(hexOf(menu)))).toBeLessThan(0.1)
  })
})

describe('the glass utility', () => {
  it('blurs what lies behind at 26px with saturation 1.2, and paints nothing over its fill', () => {
    expect(utility('surface-frost')).toContain('backdrop-filter: blur(26px) saturate(1.2);')
    expect(utility('surface-frost')).not.toContain('background-image')
  })

  it('takes the decided fills and tints: dark 73% with white tints, light 60% with ink tints', () => {
    const dark = tints("[data-theme='dark']")
    const light = tints("[data-theme='light']")
    expect([dark.glass?.alpha, dark['glass-hover'], dark['glass-pressed']]).toEqual([
      0.73,
      { rgb: [255, 255, 255], alpha: 0.07 },
      { rgb: [255, 255, 255], alpha: 0.11 },
    ])
    expect([light.glass, light['glass-hover'], light['glass-pressed']]).toEqual([
      { rgb: [255, 255, 255], alpha: 0.6 },
      { rgb: [26, 20, 32], alpha: 0.05 },
      { rgb: [26, 20, 32], alpha: 0.08 },
    ])
  })
})

describe('a lit row', () => {
  it('reads its muted and coloured text in the text colour, as they fall short on a tint', () => {
    const lit = utility('lit')
    for (const token of ['text-muted', 'text-subtle', 'accent-text', 'danger']) {
      expect(lit).toContain(`--${token}: var(--text);`)
    }
  })
})
