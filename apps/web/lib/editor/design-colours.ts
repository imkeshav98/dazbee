// The solid colours a design already uses, in its frames' and layers' fills, outlines and text, each
// once, as #RRGGBB in the order they are found: the Colour panel's "In this design" row.

import { hexOf } from '@/lib/colour.ts'

type Paint = { type: string; color?: string }
type Shape = {
  frames: Record<string, { fills?: readonly unknown[] }>
  nodes: Record<string, { props: object }>
}

/** How many fit the row, two lines in a panel. */
export const DESIGN_COLOURS_SHOWN = 14

export function designColours(design: Shape): string[] {
  const found = new Set<string>()
  const add = (color: unknown) => {
    if (typeof color === 'string' && /^#[0-9a-f]{6}/i.test(color)) found.add(hexOf(color).toUpperCase())
  }
  const paints = (list: unknown) => {
    for (const paint of (list ?? []) as Paint[]) if (paint.type === 'solid') add(paint.color)
  }
  for (const frame of Object.values(design.frames)) paints(frame.fills)
  for (const node of Object.values(design.nodes)) {
    const props = node.props as { fills?: unknown; strokes?: { paint: Paint }[]; style?: { color?: unknown } }
    paints(props.fills)
    for (const stroke of props.strokes ?? []) paints([stroke.paint])
    add(props.style?.color)
  }
  return [...found].slice(0, DESIGN_COLOURS_SHOWN)
}
