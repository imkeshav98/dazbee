// Commands that change layers where they are, in their own frame: create, edit, delete, rename, lock,
// bind and mask.
import { nanoid } from 'nanoid'
import type * as Y from 'yjs'
import { z } from 'zod'

import {
  BINDING_TARGETS,
  boundFillIndex,
  canBind,
  fitsTarget,
  FrameId,
  Layer,
  type Layer as LayerT,
  LAYER_PROPS,
  LayerLock,
  LOCK_FLAGS,
  NodeId,
  Paint,
  parseLayer,
  VariableRef,
} from '@dazbee/schema'

import { childrenOf, descendants } from '../children.ts'
import { DELETED, toYNode } from '../design-doc.ts'
import { idProblem, lockFor, lockProblem, missingLayer, parentProblem } from './checks.ts'
import { defineCommand } from './define.ts'
import { keepDrawnIn } from './paths.ts'
import { topIndex } from './tree.ts'

const LayerInput = z.object({
  type: z.enum(Object.keys(LAYER_PROPS) as [keyof typeof LAYER_PROPS]),
  name: z.string(),
  role: z.string().optional(),
  props: z.record(z.string(), z.unknown()),
})

/** Adds a layer on top of what its frame or parent layer holds, with a link id of its own. Returns its id. */
export const nodeCreate = defineCommand({
  name: 'node.create',
  input: z.object({ id: NodeId.optional(), parentId: z.union([FrameId, NodeId]), layer: LayerInput }),
  check: (ctx, { id, parentId, layer }) => {
    const { design } = ctx
    const taken = idProblem(ctx, id)
    if (taken) return taken
    const problem = parentProblem(design, parentId, layer.type)
    if (problem) return problem
    const parsed = Layer.safeParse({ ...layer, parentId, link: 'new', index: 'a0' })
    if (!parsed.success) return parsed.error.issues.map((i) => `layer.${i.path.join('.')}: ${i.message}`).join('; ')
    return undefined
  },
  apply: ({ r, design }, { id = nanoid(), parentId, layer }) => {
    r.nodes.set(id, toYNode(Layer.parse({ ...layer, parentId, link: nanoid(), index: topIndex(design, parentId) })))
    return id
  },
})

/** Sets properties of layers, those that change. Their linked copies in other frames stay as they are. */
export const nodeUpdate = defineCommand({
  name: 'node.update',
  input: z.object({ ids: NodeId.array().min(1), patch: z.record(z.string(), z.unknown()) }),
  check: ({ design }, { ids, patch }) => {
    // Only the patched layers are checked: nothing else changes (#29).
    for (const id of ids) {
      const node = design.nodes[id]
      if (!node) return missingLayer(design, [id])
      for (const path of Object.keys(patch)) {
        if (!Object.hasOwn(LAYER_PROPS[node.type].shape, path)) return `a ${node.type} has no property "${path}"`
        const locked = lockProblem(id, node, lockFor(path))
        if (locked) return locked
        if (node.type === 'text' && (path === 'text' || path === 'runs')) return 'change text with text.edit'
      }
      const layer = parseLayer({ ...node, props: { ...node.props, ...patch } })
      if (!layer.success) return layer.errors.map((e) => `${id}.${e.replace(/^props\./, '')}`).join('; ')
    }
    return undefined
  },
  apply: ({ r, design }, { ids, patch }) => {
    for (const id of ids) {
      if ('width' in patch || 'height' in patch) keepDrawnIn(r, design, id)
      const props = r.nodes.get(id)?.get('props') as Y.Map<unknown>
      // A value the layer already has is left as it is, so a change to nothing writes nothing and adds no undo step.
      for (const [path, value] of Object.entries(patch)) if (!sameValue(props.get(path), value)) props.set(path, value)
    }
  },
})

/** Deletes layers and everything under them. Their linked copies in other frames stay. */
export const nodeDelete = defineCommand({
  name: 'node.delete',
  input: z.object({ ids: NodeId.array().min(1) }),
  check: ({ design }, { ids }) => {
    for (const id of ids) {
      const node = design.nodes[id]
      if (!node) return missingLayer(design, [id])
      const locked = [id, ...descendants(design, id)]
        .map((inner) => lockProblem(inner, design.nodes[inner] as LayerT, 'delete'))
        .find(Boolean)
      if (locked) return locked
    }
    return undefined
  },
  apply: ({ r, design }, { ids }) => {
    const doomed = new Set<string>()
    const take = (id: string) => {
      if (doomed.has(id)) return
      doomed.add(id)
      for (const [child] of childrenOf(design, id)) take(child)
    }
    for (const id of ids) take(id)
    // A tombstone, not a removal: undo then just clears the flag, and edits another tab makes
    // to the layer meanwhile land in a live map instead of being lost (see DELETED in design-doc.ts).
    for (const id of doomed) r.nodes.get(id)?.set(DELETED, true)
  },
})

/** Renames a layer (#59). A name is how the layers panel shows it; it changes nothing drawn, so no lock stops it. */
export const nodeRename = defineCommand({
  name: 'node.rename',
  input: z.object({ id: NodeId, name: z.string().trim().min(1).max(120) }),
  check: ({ design }, { id }) => missingLayer(design, [id]),
  apply: ({ r }, { id, name }) => {
    r.nodes.get(id)?.set('name', name)
  },
})

/** Sets some of layers' lock flags, keeping the others; a layer with nothing locked loses the field. */
export const nodeLock = defineCommand({
  name: 'node.lock',
  input: z.object({
    ids: NodeId.array().min(1),
    lock: z.object(Object.fromEntries(LOCK_FLAGS.map((flag) => [flag, z.boolean().optional()]))),
  }),
  check: ({ design }, { ids }) => missingLayer(design, ids),
  apply: ({ r, design }, { ids, lock }) => {
    for (const id of ids) {
      const next = LayerLock.parse({ ...design.nodes[id]?.lock, ...lock })
      if (LOCK_FLAGS.some((flag) => next[flag])) r.nodes.get(id)?.set('lock', next)
      else r.nodes.get(id)?.delete('lock')
    }
  },
})

/**
 * Binds a property of layers to a brand kit token, or unbinds it with a null ref (#53). Binding
 * also stores the token's value as the property's own, so a design drawn without the brand kit (or
 * before it loads) still looks as it did; a fill binds the topmost solid fill, added if there is none.
 * Unbinding keeps the value the property has.
 */
export const nodeBind = defineCommand({
  name: 'node.bind',
  input: z.object({
    ids: NodeId.array().min(1),
    target: z.enum(BINDING_TARGETS),
    ref: VariableRef.nullable(),
    value: z.string().optional(),
  }),
  check: ({ design }, { ids, target, ref, value }) => {
    if (ref && value === undefined) return 'binding needs the value the token has now'
    if (value !== undefined && !fitsTarget(target, value))
      return target === 'fontFamily' ? 'a font family needs a name' : 'colours are #RRGGBBAA'
    for (const id of ids) {
      const node = design.nodes[id]
      if (!node) return missingLayer(design, [id])
      if (!canBind(node.type, target)) return `a ${node.type} has no ${target} to bind`
      const locked = lockProblem(id, node, 'style')
      if (locked) return locked
    }
    return undefined
  },
  apply: ({ r, design }, { ids, target, ref, value }) => {
    for (const id of ids) {
      const node = design.nodes[id]
      const ynode = r.nodes.get(id)
      if (!node || !ynode) continue
      const bindings = Object.fromEntries(Object.entries({ ...node.bindings, [target]: ref }).filter(([, v]) => v))
      if (Object.keys(bindings).length > 0) ynode.set('bindings', bindings)
      else ynode.delete('bindings')
      if (value === undefined) continue
      const props = ynode.get('props') as Y.Map<unknown>
      if (target === 'fill') {
        const fills = (props.get('fills') ?? []) as z.infer<typeof Paint>[]
        const at = boundFillIndex(fills)
        props.set(
          'fills',
          at < 0
            ? [...fills, { type: 'solid', color: value }]
            : fills.map((f, i) => (i === at ? { ...f, color: value } : f)),
        )
      } else {
        const key = target === 'textColor' ? 'color' : 'fontFamily'
        props.set('style', { ...(props.get('style') as Record<string, unknown>), [key]: value })
      }
    }
  },
})

/** Makes layers masks, or plain layers again (#48). Their linked copies in other frames stay as they are. */
export const nodeMask = defineCommand({
  name: 'node.mask',
  input: z.object({ ids: NodeId.array().min(1), mask: z.enum(['alpha', 'luminance']).nullable() }),
  check: ({ design }, { ids }) => {
    for (const id of ids) {
      const node = design.nodes[id]
      if (!node) return missingLayer(design, [id])
      const locked = lockProblem(id, node, 'style')
      if (locked) return locked
    }
    return undefined
  },
  apply: ({ r }, { ids, mask }) => {
    for (const id of ids) {
      const props = r.nodes.get(id)?.get('props') as Y.Map<unknown>
      if (mask) props.set('mask', mask)
      else props.delete('mask')
    }
  },
})

/** Whether two property values are the same, as plain data: numbers, strings, arrays and objects. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const [one, other] = [a as Record<string, unknown>, b as Record<string, unknown>]
  const keys = Object.keys(one).filter((key) => one[key] !== undefined)
  if (keys.length !== Object.keys(other).filter((key) => other[key] !== undefined).length) return false
  return keys.every((key) => sameValue(one[key], other[key]))
}
