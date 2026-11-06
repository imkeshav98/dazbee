import type { CanvasKit, FontCollection, Paragraph, TextStyle as CkTextStyle } from '@dazbee/canvaskit'
import { autoDirection, type TextProps } from '@dazbee/schema'

import { color } from '../color.ts'
import { lru } from '../lru.ts'
import type { Resources } from '../resources.ts'
import { scaled } from './scale.ts'

/** One paragraph of a text layer (the text between line breaks), laid out where it sits in the layer. */
export interface TextBlock {
  paragraph: Paragraph
  /** The same paragraph with outlined runs stroked and the rest clear, drawn over it; null without outlines. */
  outline: Paragraph | null
  /** Its bullet or number, at (markerX, markerY) in the block, on the first line's baseline; null when not in a list. */
  marker: Paragraph | null
  markerX: number
  markerY: number
  /** The paragraph as drawn, its case changed, without the line break; offsets match the layer's text. */
  text: string
  /** Where it is in the layer's text, in UTF-16 units. */
  start: number
  end: number
  /** Its origin in the layer, before vertical alignment. */
  x: number
  y: number
  height: number
}

/**
 * A text layer shaped and laid out: the one layout drawing, measuring and editing use, so the caret
 * sits on the glyphs that are drawn. Blocks stack down from the layer's (x, y + dy). Paragraphs cut
 * off by `maxLines` have no block. The caller deletes it.
 */
export interface TextLayout {
  blocks: TextBlock[]
  dy: number
  width: number
  height: number
  /** The base font size shrink to fit chose, over the one set; 1 without it. */
  scale: number
  align: TextProps['align']
  rtl: boolean
  delete(): void
}

export type ParagraphCache = ReturnType<typeof paragraphCache>

type Style = TextProps['style']

const ELLIPSIS = '\u2026'

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u

/**
 * Shapes and lays out a text layer, a paragraph at a time (#47): lists put each paragraph's lines
 * clear of a gutter for its marker, and paragraph spacing goes between them. A text with one
 * paragraph is laid out as one SkParagraph, as before.
 */
export function layoutText(
  ck: CanvasKit,
  props: TextProps,
  resources: Pick<Resources, 'fonts' | 'fallbackFamilies'>,
): TextLayout {
  const fit = props.shrinkToFit
  if (!fit) return place(props, build(ck, props, resources, 1))
  // The largest quarter point size from min to max that fits; min when none does.
  const base = props.style.fontSize
  let lo = Math.ceil(fit.min * 4)
  let hi = Math.floor(fit.max * 4)
  let best: TextLayout | null = null
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const laid = build(ck, props, resources, mid / 4 / base)
    if (fits(props, laid)) {
      best?.delete()
      best = laid
      lo = mid + 1
    } else {
      laid.delete()
      hi = mid - 1
    }
  }
  return place(props, best ?? build(ck, props, resources, fit.min / base))
}

/**
 * Laid-out text kept by what shapes it, for a screen that redraws often: a redraw lays out only
 * the text that changed. The cache owns its layouts; `delete` frees them all.
 */
export function paragraphCache(limit = 4000) {
  // The layouts by what shapes them, least recently used first.
  const entries = lru<string, TextLayout>(limit, (laid) => laid.delete())
  // The fonts the kept layouts were shaped with.
  let fonts: FontCollection | null = null

  function layout(ck: CanvasKit, props: TextProps, resources: Pick<Resources, 'fonts' | 'fallbackFamilies'>) {
    if (resources.fonts !== fonts) {
      entries.clear()
      fonts = resources.fonts
    }
    return entries.get(layoutKey(props, resources.fallbackFamilies), () => layoutText(ck, props, resources))
  }

  return { layout, delete: entries.clear }
}

/** A text layer laid out, from the paragraph cache when there is one; `done` frees what the cache doesn't own. */
export function laidOut(ck: CanvasKit, props: TextProps, resources: Resources) {
  if (resources.paragraphs) return { ...resources.paragraphs.layout(ck, props, resources), done: () => {} }
  const laid = layoutText(ck, props, resources)
  return { ...laid, done: () => laid.delete() }
}

/**
 * Measures text for auto layout (#46), the way `layoutText` lays it out to draw: natural width
 * (rounded up, as a text box that grows draws) or the height at a given width.
 */
export function textMeasure(ck: CanvasKit, resources: Pick<Resources, 'fonts' | 'fallbackFamilies'>) {
  return (props: TextProps, width: number | null) => {
    const laid = layoutText(
      ck,
      width === null ? { ...props, boxMode: 'autoWidth' } : { ...props, boxMode: 'autoHeight', width },
      resources,
    )
    try {
      return { width: width ?? laid.width, height: laid.height }
    } finally {
      laid.delete()
    }
  }
}

/** Vertical alignment in a fixed box. */
function place(props: TextProps, laid: TextLayout): TextLayout {
  const free = props.boxMode === 'fixed' ? props.height - laid.height : 0
  laid.dy = { top: 0, middle: free / 2, bottom: free }[props.verticalAlign]
  return laid
}

function build(
  ck: CanvasKit,
  props: TextProps,
  resources: Pick<Resources, 'fonts' | 'fallbackFamilies'>,
  scale: number,
): TextLayout {
  const direction = props.direction === 'auto' ? autoDirection(props.text) : props.direction
  const rtl = direction === 'rtl'
  const base = scaled(props.style, scale) as Style
  // Later runs win where runs overlap, so split the text at every run edge and merge per piece.
  const edges = [...new Set([0, props.text.length, ...props.runs.flatMap((r) => [r.start, r.end])])].sort(
    (a, b) => a - b,
  )
  const pieces = edges.slice(0, -1).map((start, i) => {
    const end = edges[i + 1] ?? props.text.length
    const style = { ...props.style }
    for (const run of props.runs) if (run.start <= start && run.end >= end) Object.assign(style, run.style)
    return { start, end, style: scaled(style, scale) as Style }
  })
  const styleAt = (offset: number) =>
    pieces.find((p) => offset >= p.start && offset < p.end)?.style ?? pieces.at(-1)?.style ?? base
  const shown = withCase(props.text, styleAt)

  const paragraphStyle = (style: Style, extra: { maxLines?: number; ellipsis?: string } = {}) =>
    new ck.ParagraphStyle({
      textAlign: {
        start: ck.TextAlign.Start,
        center: ck.TextAlign.Center,
        end: ck.TextAlign.End,
        justify: ck.TextAlign.Justify,
      }[props.align],
      textDirection: rtl ? ck.TextDirection.RTL : ck.TextDirection.LTR,
      textStyle: textStyle(ck, style, resources),
      ...extra,
    })
  const outlined = pieces.some((p) => (p.style.outline?.width ?? 0) > 0)
  const clear = new ck.Paint()
  clear.setColor(ck.TRANSPARENT)
  /** One paragraph of the text; with `outline`, its outline pass. `more` is drawn after it, as an ellipsis is. */
  const paragraphOf = (
    start: number,
    end: number,
    extra: { maxLines?: number; ellipsis?: string },
    outline: boolean,
    more = '',
  ) => {
    // An empty paragraph takes the style typing would give it: the character before's.
    const lead = start < end ? styleAt(start) : styleAt(Math.max(0, start - 1))
    const builder = ck.ParagraphBuilder.MakeFromFontCollection(
      paragraphStyle(start === 0 && end === props.text.length ? base : lead, extra),
      resources.fonts,
    )
    for (const piece of pieces) {
      const from = Math.max(piece.start, start)
      const to = Math.min(piece.end, end)
      if (to <= from) continue
      const style = textStyle(ck, piece.style, resources, outline)
      if (outline) {
        const width = piece.style.outline?.width ?? 0
        const stroke = new ck.Paint()
        stroke.setAntiAlias(true)
        if (width > 0 && piece.style.outline) {
          stroke.setStyle(ck.PaintStyle.Stroke)
          stroke.setStrokeWidth(width)
          stroke.setStrokeJoin(ck.StrokeJoin.Round)
          stroke.setColor(color(ck, piece.style.outline.color))
        } else {
          stroke.setColor(ck.TRANSPARENT)
        }
        builder.pushPaintStyle(style, stroke, clear)
        stroke.delete()
      } else {
        builder.pushStyle(style)
      }
      builder.addText(shown.slice(from, to))
      builder.pop()
    }
    if (more) {
      builder.pushStyle(textStyle(ck, styleAt(Math.max(start, end - 1)), resources, outline))
      builder.addText(more)
      builder.pop()
    }
    const paragraph = builder.build()
    builder.delete()
    return paragraph
  }

  // Paragraphs, and the marker of each one with text.
  const ranges: { start: number; end: number }[] = []
  let at = 0
  for (const line of props.text.split('\n')) {
    ranges.push({ start: at, end: at + line.length })
    at += line.length + 1
  }
  let number = 0
  const markers = ranges.map(({ start, end }) => {
    if (!props.list || start === end) return null
    number++
    const builder = ck.ParagraphBuilder.MakeFromFontCollection(paragraphStyle(styleAt(start)), resources.fonts)
    builder.pushStyle(textStyle(ck, styleAt(start), resources))
    // In right-to-left text the full stop lands on the number's left, as Arabic lists show it.
    builder.addText(props.list === 'bullet' ? '\u2022' : `${number}.`)
    builder.pop()
    const paragraph = builder.build()
    builder.delete()
    // Laid out at its own width: a right-to-left one laid out wider would sit at the far end.
    paragraph.layout(Number.POSITIVE_INFINITY)
    paragraph.layout(Math.ceil(paragraph.getMaxIntrinsicWidth()))
    return paragraph
  })
  // The gutter: the widest marker and half the base size more.
  const gutter = props.list
    ? Math.ceil(Math.max(0, ...markers.map((m) => m?.getMaxIntrinsicWidth() ?? 0)) + base.fontSize / 2)
    : 0

  let paragraphs = ranges.map(({ start, end }) => paragraphOf(start, end, {}, false))
  /** How the last paragraph was cut, so its outline pass is cut alike. */
  let cutWith: { extra: { maxLines?: number; ellipsis?: string }; more: string } = { extra: {}, more: '' }
  let width: number
  if (props.boxMode === 'autoWidth') {
    for (const p of paragraphs) p.layout(Number.POSITIVE_INFINITY)
    width = Math.ceil(Math.max(0, ...paragraphs.map((p) => p.getMaxIntrinsicWidth())))
    for (const p of paragraphs) p.layout(width)
    width += gutter
  } else {
    width = props.width
    for (const p of paragraphs) p.layout(width - gutter)
  }
  const inner = width - gutter
  const lineCount = (p: Paragraph) => Math.max(1, p.getLineMetrics().length)

  // Lines past maxLines are cut: the paragraph they end in gets an ellipsis, and later ones go.
  if (props.maxLines !== undefined) {
    let left = props.maxLines
    for (const [i, p] of paragraphs.entries()) {
      const lines = lineCount(p)
      const range = ranges[i] as { start: number; end: number }
      const cut = lines > left
      const last = lines === left && paragraphs.slice(i + 1).length > 0
      if (cut || last) {
        p.delete()
        cutWith = { extra: { maxLines: left, ellipsis: ELLIPSIS }, more: last ? ELLIPSIS : '' }
        const remake = paragraphOf(range.start, range.end, cutWith.extra, false, cutWith.more)
        remake.layout(inner)
        paragraphs[i] = remake
        for (const gone of paragraphs.slice(i + 1)) gone.delete()
        for (const gone of markers.slice(i + 1)) gone?.delete()
        paragraphs = paragraphs.slice(0, i + 1)
        markers.length = i + 1
        break
      }
      left -= lines
    }
  }

  const spacing = (props.paragraphSpacing ?? 0) * scale
  let y = 0
  const blocks: TextBlock[] = paragraphs.map((paragraph, i) => {
    const range = ranges[i] as { start: number; end: number }
    let outline: Paragraph | null = null
    if (outlined) {
      const lastOne = i === paragraphs.length - 1
      outline = paragraphOf(range.start, range.end, lastOne ? cutWith.extra : {}, true, lastOne ? cutWith.more : '')
      outline.layout(inner)
    }
    const marker = markers[i] ?? null
    const block: TextBlock = {
      paragraph,
      outline,
      marker,
      markerX: rtl ? inner + gutter - (marker?.getMaxIntrinsicWidth() ?? 0) : 0,
      markerY: (paragraph.getLineMetrics()[0]?.baseline ?? 0) - (marker?.getLineMetrics()[0]?.baseline ?? 0),
      text: shown.slice(range.start, range.end),
      start: range.start,
      end: range.end,
      x: rtl ? 0 : gutter,
      y,
      height: paragraph.getHeight(),
    }
    y += block.height + (i < paragraphs.length - 1 ? spacing : 0)
    return block
  })
  clear.delete()
  return {
    blocks,
    dy: 0,
    width,
    height: y,
    scale,
    align: props.align,
    rtl,
    delete() {
      for (const b of blocks) {
        b.paragraph.delete()
        b.outline?.delete()
        b.marker?.delete()
      }
    },
  }
}

/** Whether text fits its box: no word broken across lines, nothing cut off, and in a fixed box no line below it. */
function fits(props: TextProps, laid: TextLayout): boolean {
  if (props.boxMode === 'autoWidth') return true
  const total = props.text.split('\n').length
  if (laid.blocks.length < total || laid.blocks.some((b) => b.paragraph.didExceedMaxLines())) return false
  for (const b of laid.blocks)
    if (b.paragraph.getMinIntrinsicWidth() > props.width - b.x - gutterRight(props, laid, b) + 0.01) return false
  return props.boxMode !== 'fixed' || laid.height <= props.height + 0.01
}

/** What a text layer's layout depends on: everything but where it is placed and how it is painted over. */
function layoutKey(props: TextProps, fallbackFamilies: string[]) {
  return JSON.stringify([
    props.text,
    props.runs,
    props.style,
    props.width,
    props.height,
    props.boxMode,
    props.align,
    props.verticalAlign,
    props.direction,
    props.list,
    props.paragraphSpacing,
    props.maxLines,
    props.shrinkToFit,
    fallbackFamilies,
  ])
}

/** The text with each piece's case applied, a code point at a time and only where that keeps its length, so offsets still match. */
function withCase(text: string, styleAt: (offset: number) => Style): string {
  let out = ''
  let i = 0
  let prev = ''
  for (const ch of text) {
    const mode = styleAt(i).textCase ?? 'none'
    let next = ch
    if (mode === 'upper' || (mode === 'title' && !WORD_CHAR.test(prev))) next = ch.toUpperCase()
    else if (mode === 'lower') next = ch.toLowerCase()
    out += next.length === ch.length ? next : ch
    prev = ch
    i += ch.length
  }
  return out
}

/** A style for CanvasKit; for an outline pass, without the lines, which the fill pass draws. */
function textStyle(
  ck: CanvasKit,
  style: Style,
  resources: Pick<Resources, 'fallbackFamilies'>,
  outline = false,
): CkTextStyle {
  const decoration = outline
    ? 0
    : (style.underline ? ck.UnderlineDecoration : 0) | (style.strikethrough ? ck.LineThroughDecoration : 0)
  return new ck.TextStyle({
    color: color(ck, style.color),
    fontFamilies: [style.fontFamily, ...resources.fallbackFamilies.filter((f) => f !== style.fontFamily)],
    fontSize: style.fontSize,
    fontStyle: {
      weight: { value: style.fontWeight },
      slant: style.fontStyle === 'italic' ? ck.FontSlant.Italic : ck.FontSlant.Upright,
    },
    letterSpacing: style.letterSpacing,
    ...(style.lineHeight === undefined ? {} : { heightMultiplier: style.lineHeight, halfLeading: true }),
    ...(decoration ? { decoration, decorationColor: color(ck, style.color), decorationThickness: 1 } : {}),
  })
}

function gutterRight(props: TextProps, laid: TextLayout, b: TextBlock) {
  return b.marker && b.x === 0 ? laid.width - b.paragraph.getMaxWidth() : 0
}
