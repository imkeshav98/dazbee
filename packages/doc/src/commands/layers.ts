import { nanoid } from 'nanoid'
import type * as Y from 'yjs'
import { z } from 'zod'

import {
  AnyScope,
  BINDING_TARGETS,
  boundFillIndex,
  canBind,
  fitsTarget,
  formatIdOf,
  Layer,
  type Layer as LayerT,
  LAYER_PROPS,
  LayerLock,
  LOCK_FLAGS,
  NodeId,
  PageId,
  Paint,
  parseLayer,
  parseOverrideValues,
  Scope,
  VariableRef,
} from '@dazbee/schema'

import { childrenOf, descendants } from '../children.ts'
import { DELETED, overrideKey, toYNode } from '../design-doc.ts'
import { idProblem, lockFor, lockProblem, parentProblem } from './checks.ts'
import { defineCommand } from './define.ts'
import { keepDrawnIn } from './paths.ts'
import { topIndex } from './tree.ts'

const LayerInput = z.object({
  type: z.enum(Object.keys(LAYER_PROPS) as [keyof typeof LAYER_PROPS]),
  name: z.string(),
  role: z.string().optional(),
  props: z.record(z.string(), z.unknown()),
})

export const nodeCreate = defineCommand({
  name: 'node.create',
  input: z.object({ id: NodeId.optional(), parentId: z.union([PageId, NodeId]), layer: LayerInput }),
  check: (ctx, { id, parentId, layer }) => {
    const { design } = ctx
    const taken = idProblem(ctx, id)
    if (taken) return taken
    const problem = parentProblem(design, parentId, layer.type)
    if (problem) return problem
    const parsed = Layer.safeParse({ ...layer, parentId, index: 'a0' })
    if (!parsed.success) return parsed.error.issues.map((i) => `layer.${i.path.join('.')}: ${i.message}`).join('; ')
    return undefined
  },
  apply: ({ r, design }, { id = nanoid(), parentId, layer }) => {
    r.nodes.set(id, toYNode(Layer.parse({ ...layer, parentId, index: topIndex(design, parentId) })))
    return id
  },
})

export const nodeUpdate = defineCommand({
  name: 'node.update',
  input: z.object({ ids: NodeId.array().min(1), scope: AnyScope, patch: z.record(z.string(), z.unknown()) }),
  check: ({ design }, { ids, scope, patch }) => {
    // Only the patched layers and their overrides are checked: nothing else changes (#29).
    if (scope !== 'base' && !design.formats[formatIdOf(scope) ?? '']) return `no format "${formatIdOf(scope) ?? scope}"`
    for (const id of ids) {
      const node = design.nodes[id]
      if (!node) return `no layer "${id}"`
      for (const path of Object.keys(patch)) {
        if (!Object.hasOwn(LAYER_PROPS[node.type].shape, path)) return `a ${node.type} has no property "${path}"`
        const locked = lockProblem(id, node, lockFor(path))
        if (locked) return locked
        if (scope === 'base' && node.type === 'text' && (path === 'text' || path === 'runs'))
          return 'change text with text.edit'
      }
      if (scope !== 'base') {
        const values = parseOverrideValues(scope, node, { ...design.overrides[scope]?.[id], ...patch })
        if (!values.success) return values.errors.map((e) => `${id}.${e}`).join('; ')
        continue
      }
      const layer = parseLayer({ ...node, props: { ...node.props, ...patch } })
      if (!layer.success) return layer.errors.map((e) => `${id}.${e.replace(/^props\./, '')}`).join('; ')
      // A new base value can make an override that merges with it invalid.
      for (const [overrideScope, byNode] of Object.entries(design.overrides)) {
        const values = byNode[id] && parseOverrideValues(overrideScope, layer.layer, byNode[id])
        if (values && !values.success) return values.errors.map((e) => `${id}.${e}`).join('; ')
      }
    }
    return undefined
  },
  apply: ({ r, design }, { ids, scope, patch }) => {
    for (const id of ids) {
      if ('width' in patch || 'height' in patch) keepDrawnIn(r, design, id)
      if (scope === 'base') {
        const props = r.nodes.get(id)?.get('props') as Y.Map<unknown>
        for (const [path, value] of Object.entries(patch)) props.set(path, value)
        continue
      }
      for (const [path, value] of Object.entries(patch)) r.overrides.set(overrideKey(scope, id, path), value)
    }
  },
})

/**
 * Puts layers back to the base in one format: removes their overrides there, every one or only
 * the named property paths. Values the layers don't override are left as they are.
 */
export const overrideReset = defineCommand({
  name: 'override.reset',
  input: z.object({ ids: NodeId.array().min(1), scope: Scope, paths: z.string().array().min(1).optional() }),
  check: ({ design }, { ids, scope }) => {
    if (!design.formats[formatIdOf(scope) ?? '']) return `no format "${formatIdOf(scope) ?? scope}"`
    return ids.map((id) => (design.nodes[id] ? undefined : `no layer "${id}"`)).find(Boolean)
  },
  apply: ({ r, design }, { ids, scope, paths }) => {
    for (const id of ids) {
      for (const path of paths ?? Object.keys(design.overrides[scope]?.[id] ?? {}))
        r.overrides.delete(overrideKey(scope, id, path))
    }
  },
})

/** Shows or hides layers in every format: the base, with every format's own visibility gone. */
export const nodeVisibleEverywhere = defineCommand({
  name: 'node.visibleEverywhere',
  input: z.object({ ids: NodeId.array().min(1), visible: z.boolean() }),
  check: ({ design }, { ids }) => ids.map((id) => (design.nodes[id] ? undefined : `no layer "${id}"`)).find(Boolean),
  apply: ({ r, design }, { ids, visible }) => {
    for (const id of ids) {
      ;(r.nodes.get(id)?.get('props') as Y.Map<unknown> | undefined)?.set('visible', visible)
      for (const scope of Object.keys(design.overrides)) r.overrides.delete(overrideKey(scope, id, 'visible'))
    }
  },
})

export const nodeDelete = defineCommand({
  name: 'node.delete',
  input: z.object({ ids: NodeId.array().min(1) }),
  check: ({ design }, { ids }) => {
    for (const id of ids) {
      const node = design.nodes[id]
      if (!node) return `no layer "${id}"`
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
  check: ({ design }, { id }) => (design.nodes[id] ? undefined : `no layer "${id}"`),
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
  check: ({ design }, { ids }) => ids.map((id) => (design.nodes[id] ? undefined : `no layer "${id}"`)).find(Boolean),
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
      if (!node) return `no layer "${id}"`
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

/**
 * Makes layers masks, or plain layers again (#48). A mask is the same in every format, so the flag
 * is set on the base and any format's override of it goes.
 */
export const nodeMask = defineCommand({
  name: 'node.mask',
  input: z.object({ ids: NodeId.array().min(1), mask: z.enum(['alpha', 'luminance']).nullable() }),
  check: ({ design }, { ids }) => {
    for (const id of ids) {
      const node = design.nodes[id]
      if (!node) return `no layer "${id}"`
      const locked = lockProblem(id, node, 'style')
      if (locked) return locked
    }
    return undefined
  },
  apply: ({ r, design }, { ids, mask }) => {
    for (const id of ids) {
      const props = r.nodes.get(id)?.get('props') as Y.Map<unknown>
      if (mask) props.set('mask', mask)
      else props.delete('mask')
      for (const scope of Object.keys(design.overrides)) r.overrides.delete(overrideKey(scope, id, 'mask'))
    }
  },
})
