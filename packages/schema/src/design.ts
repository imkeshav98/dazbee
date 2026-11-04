import { z } from 'zod'

import { canHold, Layer } from './layers.ts'
import { Paint } from './paint.ts'
import { FractionalIndex, FrameId, inOrder, NodeId, PageId } from './primitives.ts'
import type { Variables } from './variables.ts'

export const Page = z.object({
  name: z.string(),
  /** Orders the design's pages. */
  order: FractionalIndex,
})
export type Page = z.infer<typeof Page>

/** One ad, post or other piece of creative at one size, placed on a page. It owns its layers. */
export const Frame = z.object({
  pageId: PageId,
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Where the frame's top start corner sits on its page, in design pixels. */
  x: z.number(),
  y: z.number(),
  /** Paints behind every layer in the frame: its background. */
  fills: Paint.array().default([]),
  /** Orders the frames of one page: the layers panel and Export list them in it. */
  order: FractionalIndex,
})
export type Frame = z.infer<typeof Frame>

export const DesignMeta = z.object({
  designId: z.string().min(1),
  name: z.string(),
})
export type DesignMeta = z.infer<typeof DesignMeta>

/** Everything in a design but its layers: small, so always validated whole. */
export const DesignHead = z.object({
  meta: DesignMeta,
  pages: z.record(PageId, Page),
  frames: z.record(FrameId, Frame),
})
export type DesignHead = z.infer<typeof DesignHead>

export const DesignShape = z.object({
  ...DesignHead.shape,
  nodes: z.record(NodeId, Layer),
})
export type DesignShape = z.infer<typeof DesignShape>

export const Design = DesignShape.superRefine((d, ctx) =>
  checkStructure(d, (path, message) => ctx.addIssue({ code: 'custom', path, message })),
)
export type Design = z.infer<typeof Design>
export type DesignInput = z.input<typeof Design>

export type ParseResult = { success: true; design: Design } | { success: false; errors: string[] }

/** Reports one broken rule: where in the design, and what is wrong. */
export type Fail = (path: PropertyKey[], message: string) => void

/** The gap the frame rule leaves between a page's rightmost frame and a new one. */
export const FRAME_GAP = 200

/** Validates untrusted JSON as a design. Errors read `path: message`. */
export function parseDesign(input: unknown): ParseResult {
  const result = Design.safeParse(input)
  if (result.success) return { success: true, design: result.data }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '(design)'}: ${i.message}`),
  }
}

/** Every asset an image fill of the design names, on frames and layers, sorted. */
export function imageAssetIds(design: Design): string[] {
  const ids = new Set<string>()
  const add = (fills: unknown) => {
    if (!Array.isArray(fills)) return
    for (const fill of fills) {
      if (fill && typeof fill === 'object' && (fill as { type?: unknown }).type === 'image') {
        const { assetId } = fill as { assetId?: unknown }
        if (typeof assetId === 'string') ids.add(assetId)
      }
    }
  }
  for (const frame of Object.values(design.frames)) add(frame.fills)
  for (const node of Object.values(design.nodes)) add((node.props as { fills?: unknown }).fills)
  return [...ids].sort()
}

/**
 * Every font family the design's text names, in base styles and runs, sorted: the families the
 * editor and exports load. Fallback families are not among them. With the brand's variables, the
 * families of brand fonts text is bound to are among them too.
 */
export function fontFamilies(design: Design, variables?: Variables): string[] {
  const families = new Set<string>()
  // A font family bound to a brand font draws in the brand's family.
  for (const node of Object.values(design.nodes)) {
    const ref = node.type === 'text' ? node.bindings?.fontFamily : undefined
    const bound = ref ? variables?.[ref]?.trim() : undefined
    if (bound) families.add(bound)
  }
  const addStyle = (style: unknown) => {
    const family = style && typeof style === 'object' ? (style as { fontFamily?: unknown }).fontFamily : undefined
    if (typeof family === 'string' && family) families.add(family)
  }
  for (const node of Object.values(design.nodes)) {
    if (node.type !== 'text') continue
    addStyle(node.props.style)
    for (const run of node.props.runs) addStyle(run.style)
  }
  return [...families].sort()
}

/** A page's frames as `[id, frame]` pairs, by order, ties broken by id. */
export function framesOf<F extends { readonly pageId: string; readonly order: string }>(
  design: { readonly frames: Readonly<Record<string, F>> },
  pageId: string,
): [string, F][] {
  return inOrder(design.frames).filter(([, frame]) => frame.pageId === pageId)
}

/**
 * The design's cover frame: the first frame, by order, of the first page, by order, that has one.
 * Thumbnails, templates and the Recent filter show it. Undefined when no page has a frame.
 */
export function coverFrame<F extends { readonly pageId: string; readonly order: string }>(design: {
  readonly pages: Readonly<Record<string, { readonly order: string }>>
  readonly frames: Readonly<Record<string, F>>
}): [string, F] | undefined {
  for (const [pageId] of inOrder(design.pages)) {
    const first = framesOf(design, pageId)[0]
    if (first) return first
  }
  return undefined
}

/**
 * Where the frame rule puts a new frame among a page's frames: at 0, 0 on an empty page, else
 * FRAME_GAP right of the frame whose right edge is furthest right (the first of those that tie),
 * its top aligned with that frame's.
 */
export function newFramePosition(frames: readonly { x: number; y: number; width: number }[]): {
  x: number
  y: number
} {
  let rightmost: { x: number; y: number; width: number } | undefined
  for (const frame of frames) {
    if (!rightmost || frame.x + frame.width > rightmost.x + rightmost.width) rightmost = frame
  }
  if (!rightmost) return { x: 0, y: 0 }
  return { x: rightmost.x + rightmost.width + FRAME_GAP, y: rightmost.y }
}

/**
 * The rules about the design's shape: it has a page; every frame's page exists; every layer's
 * chain of parents ends at a frame, through layers that can hold what they hold; and no frame
 * holds two layers with one link id.
 */
export function checkStructure(d: Pick<DesignShape, 'pages' | 'frames' | 'nodes'>, fail: Fail) {
  if (Object.keys(d.pages).length === 0) fail(['pages'], 'a design needs a page')
  for (const [id, frame] of Object.entries(d.frames)) {
    if (!Object.hasOwn(d.pages, frame.pageId)) fail(['frames', id, 'pageId'], `no page "${frame.pageId}"`)
  }

  const layer = (id: string) => (Object.hasOwn(d.nodes, id) ? d.nodes[id] : undefined)
  const isFrame = (id: string) => Object.hasOwn(d.frames, id)
  /** The first holder of each link id, by frame. */
  const holders = new Map<string, Map<string, string>>()
  for (const [id, node] of Object.entries(d.nodes)) {
    if (isFrame(id)) fail(['nodes', id], `"${id}" is both a frame and a layer`)
    const parent = layer(node.parentId)
    if (!isFrame(node.parentId) && !parent) {
      fail(['nodes', id, 'parentId'], `parent "${node.parentId}" is neither a frame nor a layer`)
    } else if (parent && !canHold(parent.type, node.type)) {
      fail(
        ['nodes', id, 'parentId'],
        parent.type === 'boolean'
          ? `parent "${node.parentId}" is a boolean, which holds only shapes and booleans`
          : `parent "${node.parentId}" is a ${parent.type}, which can't hold layers`,
      )
    }
    // Walk up towards the frame. Reaching this layer again means it is inside itself; reaching
    // another repeat means a cycle above it, which is reported for the layers in that cycle.
    const seen = new Set<string>()
    let up = node.parentId
    let loops = false
    for (let above = layer(up); above; above = layer(up)) {
      if (up === id) fail(['nodes', id, 'parentId'], `"${id}" is inside itself`)
      loops = up === id || seen.has(up)
      if (loops) break
      seen.add(up)
      up = above.parentId
    }
    if (loops || !isFrame(up)) continue
    const links = holders.get(up) ?? new Map<string, string>()
    holders.set(up, links)
    const first = links.get(node.link)
    if (first === undefined) links.set(node.link, id)
    else fail(['nodes', id, 'link'], `frame "${up}" holds link "${node.link}" twice, also on "${first}"`)
  }
}
