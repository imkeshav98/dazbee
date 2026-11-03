// The solid colours a design already uses, in its pages' and layers' fills, outlines and text, each
// once, as #RRGGBB in the order they are found: the Colour panel's "In this design" row.

/** How many fit the row, two lines in a panel. */
export const DESIGN_COLOURS_SHOWN = 14

type Paint = { type: string; color?: string }
type Shape = {
  pages: Record<string, { fills?: readonly unknown[] }>
  nodes: Record<string, { props: object }>
}

export function designColours(design: Shape): string[] {
  const found = new Set<string>()
  const add = (color: unknown) => {
    if (typeof color === 'string' && /^#[0-9a-f]{6}/i.test(color)) found.add(color.slice(0, 7).toUpperCase())
  }
  const paints = (list: unknown) => {
    for (const paint of (list ?? []) as Paint[]) if (paint.type === 'solid') add(paint.color)
  }
  for (const page of Object.values(design.pages)) paints(page.fills)
  for (const node of Object.values(design.nodes)) {
    const props = node.props as { fills?: unknown; strokes?: { paint: Paint }[]; style?: { color?: unknown } }
    paints(props.fills)
    for (const stroke of props.strokes ?? []) paints([stroke.paint])
    add(props.style?.color)
  }
  return [...found].slice(0, DESIGN_COLOURS_SHOWN)
}
