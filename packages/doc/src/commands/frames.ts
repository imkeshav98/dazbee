// Commands on frames: add, change, copy (with linked copies of every layer) and delete.
import { nanoid } from 'nanoid'
import { z } from 'zod'

import {
  type Design,
  Frame,
  FrameId,
  framesOf,
  type Layer as LayerT,
  NEW_FRAME_FILLS,
  newFramePosition,
  PageId,
  Paint,
  sizeProblem,
} from '@dazbee/schema'

import { childrenOf, descendants } from '../children.ts'
import { DELETED, toYMap } from '../design-doc.ts'
import { frameProblem, idProblem } from './checks.ts'
import { type CommandContext, defineCommand } from './define.ts'
import type { Size } from './fit.ts'
import { copyLayers, indexBetween, lastOrder } from './tree.ts'

/** A frame's name as a command takes it. */
export const FrameName = z.string().trim().min(1).max(120)

/**
 * Adds an empty white frame to a page, after its last frame: at `x`, `y` when given, else where
 * the frame rule puts it (newFramePosition). Returns the frame's id.
 */
export const frameAdd = defineCommand({
  name: 'frame.add',
  input: z.object({
    id: FrameId.optional(),
    pageId: PageId,
    name: FrameName,
    width: Frame.shape.width,
    height: Frame.shape.height,
    x: Frame.shape.x.optional(),
    y: Frame.shape.y.optional(),
  }),
  check: (ctx, { id, pageId, width, height }) =>
    (Object.hasOwn(ctx.design.pages, pageId) ? undefined : `no page "${pageId}"`) ??
    idProblem(ctx, id) ??
    sizeProblem(width, height),
  apply: ({ r, design }, { id = nanoid(), pageId, x, y, ...frame }) => {
    const next = nextOnPage(design, pageId)
    r.frames.set(
      id,
      toYMap(Frame.parse({ ...frame, ...next, pageId, x: x ?? next.x, y: y ?? next.y, fills: NEW_FRAME_FILLS })),
    )
    return id
  },
})

/** Renames, resizes, moves or refills a frame; its layers stay as they are. */
export const frameUpdate = defineCommand({
  name: 'frame.update',
  input: z.object({
    frameId: FrameId,
    name: FrameName.optional(),
    width: Frame.shape.width.optional(),
    height: Frame.shape.height.optional(),
    x: Frame.shape.x.optional(),
    y: Frame.shape.y.optional(),
    fills: Paint.array().optional(),
  }),
  check: ({ design }, { frameId, width, height }) => {
    const problem = frameProblem(design, frameId)
    if (problem) return problem
    const frame = design.frames[frameId] as Frame
    if (width === undefined && height === undefined) return undefined
    return sizeProblem(width ?? frame.width, height ?? frame.height)
  },
  apply: ({ r }, { frameId, ...change }) => {
    const yframe = r.frames.get(frameId)
    for (const [key, value] of Object.entries(change)) if (value !== undefined) yframe?.set(key, value)
  },
})

/**
 * Copies a frame onto its page where the frame rule puts it, after the page's last frame, with its
 * name, size and fills, holding a linked copy of every layer at the same index. Returns its id.
 */
export const frameDuplicate = defineCommand({
  name: 'frame.duplicate',
  input: z.object({ frameId: FrameId, newId: FrameId.optional() }),
  check: (ctx, { frameId, newId }) => frameProblem(ctx.design, frameId) ?? idProblem(ctx, newId),
  apply: (ctx, { frameId, newId = nanoid() }) => copyFrame(ctx, frameId, newId),
})

/**
 * As frame.duplicate, at another size: every copy is laid out to fit (fit.ts). Returns the new
 * frame's id.
 */
export const frameAddSize = defineCommand({
  name: 'frame.addSize',
  input: z.object({
    frameId: FrameId,
    newId: FrameId.optional(),
    width: Frame.shape.width,
    height: Frame.shape.height,
  }),
  check: (ctx, { frameId, newId, width, height }) =>
    frameProblem(ctx.design, frameId) ?? idProblem(ctx, newId) ?? sizeProblem(width, height),
  apply: (ctx, { frameId, newId = nanoid(), width, height }) => copyFrame(ctx, frameId, newId, { width, height }),
})

/**
 * Deletes a frame and its layers; their linked copies in other frames stay, and undo brings the
 * frame and its layers back. A page may be left with no frame.
 */
export const frameDelete = defineCommand({
  name: 'frame.delete',
  input: z.object({ frameId: FrameId }),
  check: ({ design }, { frameId }) => frameProblem(design, frameId),
  apply: ({ r, design }, { frameId }) => deleteFrame(r, design, frameId),
})

/** Tombstones a frame's layers and removes the frame, for frame.delete and page.delete. */
export function deleteFrame(r: CommandContext['r'], design: Design, frameId: string) {
  // Layers get the same tombstone node.delete gives them, so undo and other tabs' edits behave alike.
  for (const node of descendants(design, frameId)) r.nodes.get(node)?.set(DELETED, true)
  r.frames.delete(frameId)
}

/** Where the frame rule puts a new frame on a page, and its order after the page's last frame. */
function nextOnPage(design: Design, pageId: string) {
  const siblings = framesOf(design, pageId).map(([, frame]) => frame)
  return { ...newFramePosition(siblings), order: indexBetween(lastOrder(siblings), null) }
}

/**
 * A copy of a frame placed by the frame rule, with a copy of every layer keeping its link id, laid
 * out to fit when it has a new size.
 */
function copyFrame({ r, design }: CommandContext, frameId: string, newId: string, size?: Size) {
  const frame = design.frames[frameId] as Frame
  const to = size ?? frame
  const copy = { ...frame, ...nextOnPage(design, frame.pageId), width: to.width, height: to.height }
  r.frames.set(newId, toYMap(Frame.parse(copy)))
  copyLayers(
    r,
    design,
    childrenOf(design, frameId).map(([id]) => id),
    (root) => ({ parentId: newId, index: (design.nodes[root] as LayerT).index }),
    { links: 'keep', ...(size && { fit: { from: frame, to: size } }) },
  )
  return newId
}
