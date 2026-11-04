import { z } from 'zod'

import { canHold, Layer } from './layers.ts'
import { checkOverride, type Fail, formatIdOf, Overrides, withOverrideDefaults } from './overrides.ts'
import { Paint } from './paint.ts'
import { FormatId, FractionalIndex, NodeId, PageId } from './primitives.ts'
import { Format } from './sizes.ts'
import type { Variables } from './variables.ts'

export const Page = z.object({
  name: z.string(),
  order: FractionalIndex,
  /** Paints behind every layer on the page. */
  fills: Paint.array().default([]),
})
export type Page = z.infer<typeof Page>

export const DesignMeta = z.object({
  designId: z.string().min(1),
  name: z.string(),
  kind: z.enum(['single', 'carousel', 'story', 'document']),
  primaryFormatId: FormatId,
})
export type DesignMeta = z.infer<typeof DesignMeta>

/** Everything in a design but its layers and overrides: small, so always validated whole. */
export const DesignHead = z.object({
  meta: DesignMeta,
  formats: z.record(FormatId, Format),
  pages: z.record(PageId, Page),
})
export type DesignHead = z.infer<typeof DesignHead>

export const DesignShape = z.object({
  ...DesignHead.shape,
  nodes: z.record(NodeId, Layer),
  overrides: Overrides.default({}),
})
export type DesignShape = z.infer<typeof DesignShape>

export const Design = DesignShape.superRefine((d, ctx) =>
  checkDesign(d, (path, message) => ctx.addIssue({ code: 'custom', path, message })),
).transform(withOverrideDefaults)
export type Design = z.infer<typeof Design>
export type DesignInput = z.input<typeof Design>

export type ParseResult = { success: true; design: Design } | { success: false; errors: string[] }

/** Validates untrusted JSON as a design. Errors read `path: message`. */
export function parseDesign(input: unknown): ParseResult {
  const result = Design.safeParse(input)
  if (result.success) return { success: true, design: result.data }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '(design)'}: ${i.message}`),
  }
}

/** Every asset an image fill of the design names, on pages, layers or format overrides, sorted. */
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
  for (const page of Object.values(design.pages)) add(page.fills)
  for (const node of Object.values(design.nodes)) add((node.props as { fills?: unknown }).fills)
  for (const byNode of Object.values(design.overrides)) {
    for (const values of Object.values(byNode)) add(values.fills)
  }
  return [...ids].sort()
}

/**
 * Every font family the design's text names, in base styles, runs and format overrides, sorted
 * (#50): the families the editor and exports load. Fallback families are not among them. With the
 * brand's variables, the families of brand fonts text is bound to are among them too (#53).
 */
export function fontFamilies(design: Design, variables?: Variables): string[] {
  const families = new Set<string>()
  // A font family bound to a brand font draws in the brand's family (#53).
  for (const node of Object.values(design.nodes)) {
    const ref = node.type === 'text' ? node.bindings?.fontFamily : undefined
    const bound = ref ? variables?.[ref]?.trim() : undefined
    if (bound) families.add(bound)
  }
  const addStyle = (style: unknown) => {
    const family = style && typeof style === 'object' ? (style as { fontFamily?: unknown }).fontFamily : undefined
    if (typeof family === 'string' && family) families.add(family)
  }
  const addText = (values: { style?: unknown; runs?: unknown }) => {
    addStyle(values.style)
    if (Array.isArray(values.runs)) for (const run of values.runs) addStyle((run as { style?: unknown } | null)?.style)
  }
  for (const node of Object.values(design.nodes)) if (node.type === 'text') addText(node.props)
  for (const byNode of Object.values(design.overrides)) {
    for (const [id, values] of Object.entries(byNode)) if (design.nodes[id]?.type === 'text') addText(values)
  }
  return [...families].sort()
}

/** The rules about the design's shape: the primary format, pages, parents and cycles. */
export function checkStructure(d: Pick<DesignShape, 'meta' | 'formats' | 'pages' | 'nodes'>, fail: Fail) {
  if (!d.formats[d.meta.primaryFormatId]) fail(['meta', 'primaryFormatId'], `no format "${d.meta.primaryFormatId}"`)
  if (Object.keys(d.pages).length === 0) fail(['pages'], 'a design needs a page')

  for (const [id, node] of Object.entries(d.nodes)) {
    if (d.pages[id]) fail(['nodes', id], `"${id}" is both a page and a layer`)
    const parent = d.nodes[node.parentId]
    if (!d.pages[node.parentId] && !parent) {
      fail(['nodes', id, 'parentId'], `parent "${node.parentId}" is neither a page nor a layer`)
    } else if (parent && !canHold(parent.type, node.type)) {
      fail(
        ['nodes', id, 'parentId'],
        parent.type === 'boolean'
          ? `parent "${node.parentId}" is a boolean, which holds only shapes and booleans`
          : `parent "${node.parentId}" is a ${parent.type}, which can't hold layers`,
      )
    }
    // Walk up towards the page. Reaching this layer again means it is inside itself; reaching
    // another repeat means a cycle above it, which is reported for the layers in that cycle.
    const seen = new Set<string>()
    for (let up = node.parentId; d.nodes[up] && !seen.has(up); up = d.nodes[up]?.parentId ?? '') {
      if (up === id) {
        fail(['nodes', id, 'parentId'], `"${id}" is inside itself`)
        break
      }
      seen.add(up)
    }
  }
}

/** The rules no single part can check alone: parents, cycles, and overrides against their layers. */
function checkDesign(d: DesignShape, fail: Fail) {
  checkStructure(d, fail)
  for (const [scope, byNode] of Object.entries(d.overrides)) {
    const formatId = formatIdOf(scope) ?? ''
    if (!d.formats[formatId]) fail(['overrides', scope], `no format "${formatId}"`)
    for (const [nodeId, props] of Object.entries(byNode)) checkOverride(scope, nodeId, d.nodes[nodeId], props, fail)
  }
}
