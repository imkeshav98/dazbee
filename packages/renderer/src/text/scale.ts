// A text's sizes scaled: shrink to fit draws its style at a scale, and a corner drag on the stage
// writes its sizes scaled by the box's factor.
import type { TextProps } from '@dazbee/schema'

type Style = TextProps['style']
type Run = TextProps['runs'][number]
/** The sizes a style may hold. */
type Sized = {
  fontSize?: number | undefined
  letterSpacing?: number | undefined
  outline?: Style['outline'] | undefined
}
/** What scaling a text changes; line height is a multiple of the size, so it stays. */
export type ScaledText = Pick<TextProps, 'style' | 'runs'> &
  Partial<Pick<TextProps, 'paragraphSpacing' | 'shrinkToFit'>>

/** Every size in a style scaled: its font size, letter spacing and outline width. */
export function scaled<T extends Sized>(style: T, scale: number, round: (n: number) => number = (n) => n): T {
  if (scale === 1) return style
  const out = { ...style }
  if (out.fontSize !== undefined) out.fontSize = round(out.fontSize * scale)
  if (out.letterSpacing !== undefined) out.letterSpacing = round(out.letterSpacing * scale)
  if (out.outline) out.outline = { ...out.outline, width: round(out.outline.width * scale) }
  return out
}

const tenth = (n: number) => Math.round(n * 10) / 10

/**
 * A text's sizes scaled by `factor`, as a corner drag scales them: the style's and each run's,
 * paragraph spacing and shrink to fit's smallest and largest sizes, each to the nearest 0.1.
 */
export function scaleText(props: ScaledText, factor: number): ScaledText {
  const out: ScaledText = {
    style: scaled(props.style, factor, tenth),
    runs: props.runs.map((run): Run => ({ ...run, style: scaled(run.style, factor, tenth) })),
  }
  if (props.paragraphSpacing !== undefined) out.paragraphSpacing = tenth(props.paragraphSpacing * factor)
  if (props.shrinkToFit)
    out.shrinkToFit = { min: tenth(props.shrinkToFit.min * factor), max: tenth(props.shrinkToFit.max * factor) }
  return out
}

/** The smallest font size the text has anywhere: its own, a run's, or shrink to fit's smallest. */
export function smallestSize(props: ScaledText): number {
  return Math.min(
    props.style.fontSize,
    ...props.runs.flatMap((run) => (run.style.fontSize === undefined ? [] : [run.style.fontSize])),
    props.shrinkToFit?.min ?? Infinity,
  )
}
