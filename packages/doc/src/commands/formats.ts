import { nanoid } from 'nanoid'
import { z } from 'zod'

import { Format, FormatId, formatScope, formatSizeProblem, inOrder } from '@dazbee/schema'

import { overrideKey, splitOverrideKey, toYMap } from '../design-doc.ts'
import { round } from '../geometry.ts'
import { idProblem } from './checks.ts'
import { defineCommand } from './define.ts'
import { mergedProps } from './placement.ts'
import { indexBetween, lastOrder } from './tree.ts'

/**
 * Adds a format. Its layout starts as the primary format's, scaled to fit and centred, written
 * as the new format's overrides; constraints and AI adapt come later (phase 3).
 */
export const formatAdd = defineCommand({
  name: 'format.add',
  input: z.object({
    id: FormatId.optional(),
    name: z.string(),
    width: Format.shape.width,
    height: Format.shape.height,
  }),
  check: (ctx, { id, width, height }) => idProblem(ctx, id) ?? formatSizeProblem(width, height),
  apply: ({ r, design }, { id = nanoid(), ...format }) => {
    r.formats.set(id, toYMap({ ...format, order: indexBetween(lastOrder(Object.values(design.formats)), null) }))
    const primaryId = design.meta.primaryFormatId
    const primary = design.formats[primaryId]
    if (!primary) return id
    const scale = Math.min(format.width / primary.width, format.height / primary.height)
    const dx = (format.width - primary.width * scale) / 2
    const dy = (format.height - primary.height * scale) / 2
    const from = design.overrides[formatScope(primaryId)] ?? {}
    for (const nodeId of Object.keys(design.nodes)) {
      const props = mergedProps(design, formatScope(primaryId), nodeId) as Record<string, unknown> & {
        x: number
        y: number
        width: number
        height: number
      }
      const scaled: Record<string, unknown> = {
        x: round(props.x * scale + dx),
        y: round(props.y * scale + dy),
        width: round(props.width * scale),
        height: round(props.height * scale),
      }
      // What the primary format turns or hides, this one does too.
      for (const path of ['rotation', 'visible'])
        if (from[nodeId]?.[path] !== undefined) scaled[path] = from[nodeId][path]
      for (const [path, value] of Object.entries(scaled))
        r.overrides.set(overrideKey(formatScope(id), nodeId, path), value)
    }
    return id
  },
})

/** Renames, resizes or moves a format; `before` puts it ahead of another format, null at the end. */
export const formatUpdate = defineCommand({
  name: 'format.update',
  input: z.object({
    id: FormatId,
    name: z.string().optional(),
    width: Format.shape.width.optional(),
    height: Format.shape.height.optional(),
    before: FormatId.nullable().optional(),
  }),
  check: ({ design }, { id, width, height, before }) => {
    const format = design.formats[id]
    if (!format) return `no format "${id}"`
    if (before && (before === id || !design.formats[before])) return `no other format "${before}" to go before`
    return width === undefined && height === undefined
      ? undefined
      : formatSizeProblem(width ?? format.width, height ?? format.height)
  },
  apply: ({ r, design }, { id, before, ...change }) => {
    const yformat = r.formats.get(id)
    if (!yformat) return
    for (const [key, value] of Object.entries(change)) if (value !== undefined) yformat.set(key, value)
    if (before === undefined) return
    const others = inOrder(design.formats).filter(([other]) => other !== id)
    const at = before === null ? others.length : others.findIndex(([other]) => other === before)
    yformat.set('order', indexBetween(others[at - 1]?.[1].order ?? null, others[at]?.[1].order ?? null))
  },
})

/** Removes a format and every override it holds. The primary format and the last one stay. */
export const formatRemove = defineCommand({
  name: 'format.remove',
  input: z.object({ id: FormatId }),
  check: ({ design }, { id }) => {
    if (!design.formats[id]) return `no format "${id}"`
    if (Object.keys(design.formats).length === 1) return 'a design keeps at least one format'
    if (design.meta.primaryFormatId === id) return 'make another format primary first'
    return undefined
  },
  apply: ({ r }, { id }) => {
    r.formats.delete(id)
    const scope = formatScope(id)
    for (const key of [...r.overrides.keys()]) if (splitOverrideKey(key).scope === scope) r.overrides.delete(key)
  },
})

/** Makes a format the primary one: new formats start from its layout. */
export const formatSetPrimary = defineCommand({
  name: 'format.setPrimary',
  input: z.object({ id: FormatId }),
  check: ({ design }, { id }) => (design.formats[id] ? undefined : `no format "${id}"`),
  apply: ({ r }, { id }) => {
    r.meta.set('primaryFormatId', id)
  },
})
