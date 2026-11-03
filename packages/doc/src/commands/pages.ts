import { nanoid } from 'nanoid'
import { z } from 'zod'

import { inOrder, type Layer as LayerT, Page, PageId, Paint } from '@dazbee/schema'

import { childrenOf, descendants } from '../children.ts'
import { DELETED, toYMap } from '../design-doc.ts'
import { idProblem } from './checks.ts'
import { defineCommand } from './define.ts'
import { copyLayers, indexBetween, lastOrder } from './tree.ts'

export const pageAdd = defineCommand({
  name: 'page.add',
  input: z.object({ id: PageId.optional(), name: z.string() }),
  check: (ctx, { id }) => idProblem(ctx, id),
  apply: ({ r, design }, { id = nanoid(), name }) => {
    r.pages.set(id, toYMap(Page.parse({ name, order: indexBetween(lastOrder(Object.values(design.pages)), null) })))
    return id
  },
})

/** Renames a page, or sets its background fills (the Page card, #83). */
export const pageUpdate = defineCommand({
  name: 'page.update',
  input: z.object({ id: PageId, name: z.string().optional(), fills: Paint.array().optional() }),
  check: ({ design }, { id }) => (design.pages[id] ? undefined : `no page "${id}"`),
  apply: ({ r }, { id, name, fills }) => {
    const page = r.pages.get(id)
    if (name !== undefined) page?.set('name', name)
    if (fills !== undefined) page?.set('fills', fills)
  },
})

/**
 * Copies a page right after itself: every layer with a fresh id, and every override those layers
 * have in any format. Returns the new page's id.
 */
export const pageDuplicate = defineCommand({
  name: 'page.duplicate',
  input: z.object({ id: PageId, newId: PageId.optional(), name: z.string().optional() }),
  check: (ctx, { id, newId }) => (ctx.design.pages[id] ? idProblem(ctx, newId) : `no page "${id}"`),
  apply: ({ r, design }, { id, newId = nanoid(), name }) => {
    const page = design.pages[id]
    if (!page) return newId
    const pages = inOrder(design.pages)
    const next = pages[pages.findIndex(([other]) => other === id) + 1]?.[1].order ?? null
    r.pages.set(newId, toYMap(Page.parse({ ...page, name: name ?? page.name, order: indexBetween(page.order, next) })))
    copyLayers(
      r,
      design,
      childrenOf(design, id).map(([child]) => child),
      (root) => ({ parentId: newId, index: (design.nodes[root] as LayerT).index }),
    )
    return newId
  },
})

/** Moves a page ahead of another page, or to the end with null. */
export const pageMove = defineCommand({
  name: 'page.move',
  input: z.object({ id: PageId, before: PageId.nullable() }),
  check: ({ design }, { id, before }) => {
    if (!design.pages[id]) return `no page "${id}"`
    if (before && (before === id || !design.pages[before])) return `no other page "${before}" to go before`
    return undefined
  },
  apply: ({ r, design }, { id, before }) => {
    const others = inOrder(design.pages).filter(([other]) => other !== id)
    const at = before === null ? others.length : others.findIndex(([other]) => other === before)
    r.pages.get(id)?.set('order', indexBetween(others[at - 1]?.[1].order ?? null, others[at]?.[1].order ?? null))
  },
})

/** Deletes a page and its layers; undo brings both back. A design keeps at least one page. */
export const pageDelete = defineCommand({
  name: 'page.delete',
  input: z.object({ id: PageId }),
  check: ({ design }, { id }) => {
    if (!design.pages[id]) return `no page "${id}"`
    if (Object.keys(design.pages).length === 1) return 'a design keeps at least one page'
    return undefined
  },
  apply: ({ r, design }, { id }) => {
    // Layers get the same tombstone node.delete gives them, so undo and other tabs' edits behave alike.
    for (const node of descendants(design, id)) r.nodes.get(node)?.set(DELETED, true)
    r.pages.delete(id)
  },
})
