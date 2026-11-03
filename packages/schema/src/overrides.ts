import { z } from 'zod'

import type { DesignShape } from './design.ts'
import { deepFreeze } from './json.ts'
import { type Layer, LAYER_PROPS, type LayerType } from './layers.ts'
import { NodeId } from './primitives.ts'

/** Spike scopes: only `format:<id>`. Variant and page scopes arrive with variants and masters. */
const FORMAT_SCOPE = /^format:([\w-]+)$/
/** The format a `format:<id>` scope names, or undefined for any other string. */
export const formatIdOf = (scope: string) => scope.match(FORMAT_SCOPE)?.[1]
export const Scope = z.string().refine((s) => formatIdOf(s) !== undefined, 'the spike only supports format:<id> scopes')
export type Scope = z.infer<typeof Scope>

/** Where an edit lands: the base, or one format's overrides. */
export const AnyScope = z.union([z.literal('base'), Scope]).default('base')
export type AnyScope = z.infer<typeof AnyScope>

/** overrides[scope][nodeId][propertyPath] = value. Any property can be overridden per format. */
export const Overrides = z.record(Scope, z.record(NodeId, z.record(z.string(), z.unknown())))

export type Fail = (path: PropertyKey[], message: string) => void

type InScope = ReturnType<(typeof LAYER_PROPS)[LayerType]['safeParse']> & {
  /** Overridden paths the layer's type doesn't have. */
  unknownPaths: string[]
}
/** Merged props by layer, then by override object: both are only ever replaced, never changed. */
const inScopeCache = new WeakMap<Layer, WeakMap<object, InScope>>()

/** Each override object with its defaults filled, by layer and then by the override object. */
const defaultsCache = new WeakMap<Layer, WeakMap<object, Record<string, unknown>>>()

/** The scope that holds one format's overrides, the one formatIdOf reads back. */
export const formatScope = (formatId: string): `format:${string}` => `format:${formatId}`

/**
 * One layer's override values in one scope, checked against the layer as `parseDesign` checks
 * them and filled with the same defaults. The scope itself is not checked against the formats.
 */
export function parseOverrideValues(
  scope: string,
  layer: Layer,
  values: Record<string, unknown>,
): { success: true; values: Record<string, unknown> } | { success: false; errors: string[] } {
  const errors: string[] = []
  checkOverride(scope, '', layer, values, (path, message) => errors.push(`${path.slice(3).join('.')}: ${message}`))
  if (errors.length > 0) return { success: false, errors }
  return { success: true, values: overrideDefaults(layer, values) }
}

/** One layer's overrides in one scope, against the layer they override. */
export function checkOverride(
  scope: string,
  nodeId: string,
  node: Layer | undefined,
  props: Record<string, unknown>,
  fail: Fail,
) {
  if (!node) {
    fail(['overrides', scope, nodeId], `no layer "${nodeId}"`)
    return
  }
  const merged = propsInScope(node, props)
  for (const path of merged.unknownPaths)
    fail(['overrides', scope, nodeId, path], `a ${node.type} has no property "${path}"`)
  for (const issue of merged.success ? [] : merged.error.issues) {
    fail(['overrides', scope, nodeId, ...issue.path], issue.message)
  }
}

/** One layer's overrides in one scope with the same defaults as base values; unchanged objects come back unchanged. */
export function overrideDefaults(node: Layer, props: Record<string, unknown>) {
  const byProps = defaultsCache.get(node) ?? new WeakMap<object, Record<string, unknown>>()
  defaultsCache.set(node, byProps)
  const cached = byProps.get(props)
  if (cached) return cached
  const merged = propsInScope(node, props)
  if (!merged.success) return props
  const parsed = merged.data as Record<string, unknown>
  const filled = deepFreeze(Object.fromEntries(Object.keys(props).map((path) => [path, parsed[path]])))
  // Filled values merge into the same props, so the result can be read again without parsing.
  byProps.set(props, filled)
  byProps.set(filled, filled)
  inScopeCache.get(node)?.set(filled, merged)
  return filled
}

/** Gives override values the same defaults as base values, so a renderer never sees a half-filled paint or effect. */
export function withOverrideDefaults(d: DesignShape): DesignShape {
  const overrides = Object.fromEntries(
    Object.entries(d.overrides).map(([scope, byNode]) => [
      scope,
      Object.fromEntries(
        Object.entries(byNode).map(([nodeId, props]) => {
          const node = d.nodes[nodeId]
          return [nodeId, node ? overrideDefaults(node, props) : props]
        }),
      ),
    ]),
  )
  return { ...d, overrides }
}

/** A layer's props as one format sees them: its own props with that format's overrides on top. */
function propsInScope(node: Layer, overrides: Record<string, unknown>): InScope {
  const byOverrides = inScopeCache.get(node) ?? new WeakMap<object, InScope>()
  inScopeCache.set(node, byOverrides)
  const cached = byOverrides.get(overrides)
  if (cached) return cached
  const schema = LAYER_PROPS[node.type]
  const known = Object.fromEntries(Object.entries(overrides).filter(([path]) => Object.hasOwn(schema.shape, path)))
  const unknownPaths = Object.keys(overrides).filter((path) => !Object.hasOwn(schema.shape, path))
  const merged = Object.assign(schema.safeParse({ ...node.props, ...known }), { unknownPaths })
  byOverrides.set(overrides, merged)
  return merged
}
