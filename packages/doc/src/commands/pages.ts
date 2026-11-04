import { nanoid } from 'nanoid'
import { z } from 'zod'

import {
  Frame,
  FrameId,
  framesOf,
  inOrder,
  type Layer as LayerT,
  Page,
  PageId,
  type Paint,
  sizeProblem,
} from '@dazbee/schema'

import { childrenOf, descendants } from '../children.ts'
import { DELETED, toYMap } from '../design-doc.ts'
import { idProblem } from './checks.ts'
import { defineCommand } from './define.ts'
import { copyLayers, indexBetween, lastOrder } from './tree.ts'

/** A new frame's background. */
const WHITE: Paint[] = [{ type: 'solid', color: '#FFFFFFFF' }]

/**
 * Adds a page after the last one, holding one empty white frame at 0, 0 of the given name and
 * size: the caller passes those of the frame the user is on. Returns the page's id.
 */
export const pageAdd = defineCommand({
  name: 'page.add',
  input: z.object({
    id: PageId.optional(),
    name: z.string(),
    frame: z.object({
      id: FrameId.optional(),
      name: z.string().trim().min(1).max(120),
      width: Frame.shape.width,
      height: Frame.shape.height,
    }),
  }),
  check: (ctx, { id, frame }) =>
    idProblem(ctx, id) ??
    idProblem(ctx, frame.id) ??
    (id !== undefined && id === frame.id ? `id "${id}" is taken` : undefined) ??
    sizeProblem(frame.width, frame.height),
  apply: ({ r, design }, { id = nanoid(), name, frame: { id: frameId = nanoid(), ...frame } }) => {
    r.pages.set(id, toYMap(Page.parse({ name, order: indexBetween(lastOrder(Object.values(design.pages)), null) })))
    r.frames.set(
      frameId,
      toYMap(Frame.parse({ ...frame, pageId: id, x: 0, y: 0, fills: WHITE, order: indexBetween(null, null) })),
    )
    return id
  },
})

/** Renames a page. */
export const pageUpdate = defineCommand({
  name: 'page.update',
  input: z.object({ id: PageId, name: z.string().optional() }),
  check: ({ design }, { id }) => (design.pages[id] ? undefined : `no page "${id}"`),
  apply: ({ r }, { id, name }) => {
    if (name !== undefined) r.pages.get(id)?.set('name', name)
  },
})

/**
 * Copies a page right after itself, with each of its frames (new ids, the same name, size, place,
 * fills and order) and every layer in them with a fresh id. The copies get one new link id per
 * old one, so the copied frames stay linked to each other and to nothing on the page they came
 * from. Returns the new page's id.
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
    const links = new Map<string, string>()
    for (const [frameId, frame] of framesOf(design, id)) {
      const copy = nanoid()
      r.frames.set(copy, toYMap(Frame.parse({ ...frame, pageId: newId })))
      copyLayers(
        r,
        design,
        childrenOf(design, frameId).map(([child]) => child),
        (root) => ({ parentId: copy, index: (design.nodes[root] as LayerT).index }),
        { links },
      )
    }
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

/** Deletes a page, its frames and their layers; undo brings them back. A design keeps at least one page. */
export const pageDelete = defineCommand({
  name: 'page.delete',
  input: z.object({ id: PageId }),
  check: ({ design }, { id }) => {
    if (!design.pages[id]) return `no page "${id}"`
    if (Object.keys(design.pages).length === 1) return 'a design keeps at least one page'
    return undefined
  },
  apply: ({ r, design }, { id }) => {
    for (const [frameId] of framesOf(design, id)) {
      // Layers get the same tombstone node.delete gives them, so undo and other tabs' edits behave alike.
      for (const node of descendants(design, frameId)) r.nodes.get(node)?.set(DELETED, true)
      r.frames.delete(frameId)
    }
    r.pages.delete(id)
  },
})
