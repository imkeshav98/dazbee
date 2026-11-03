import type { z } from 'zod'

import { checkStructure, DesignHead, parseDesign, type ParseResult } from './design.ts'
import { deepFreeze, isRecord } from './json.ts'
import { Layer } from './layers.ts'
import { checkOverride, formatIdOf, overrideDefaults, Scope } from './overrides.ts'
import { NodeId } from './primitives.ts'

type Head = z.infer<typeof DesignHead>
/** Each scope as last parsed: the object it came in as, its filled values, and the layers it was checked against. */
type ScopeResult = { input: object; filled: Record<string, Record<string, unknown>>; nodes: Record<string, Layer> }

/** Sets a key without ever touching the prototype, even for a key such as `__proto__`. */
const put = <T>(target: Record<string, T>, key: string, value: T) =>
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })

/** Validated layers by the object they came from; a validated layer maps to itself. */
const layerCache = new WeakMap<object, Layer>()
const validIds = new Set<string>()
const validScopes = new Set<string>()

/** Validated heads by their meta object, with the formats and pages they go with; a validated head maps to itself. */
const headCache = new WeakMap<object, { formats: unknown; pages: unknown; head: Head }>()
/** The head and layers of the last design parsed here. */
let last: { head: Head; nodes: Record<string, Layer> } | undefined
const lastScopes = new Map<string, ScopeResult>()
/** Checked override values, by their object and by their filled object, with the layer they were checked against. */
const pairCache = new WeakMap<object, { node: Layer; filled: Record<string, unknown> }>()

/**
 * Validates a design like `parseDesign`, with the same result, but reuses what it validated
 * before for every layer object and override object it has seen: a design read again after one
 * edit only validates what the edit replaced. Inputs must never be changed after being passed in;
 * replace an object instead. Anything invalid goes through `parseDesign` for its exact errors.
 */
export function parseDesignIncrementally(input: unknown): ParseResult {
  if (!isRecord(input) || !isRecord(input.nodes) || !(input.overrides === undefined || isRecord(input.overrides)))
    return parseDesign(input)
  const head = parseHead(input)
  if (!head) return parseDesign(input)

  const entries: [string, Layer][] = []
  for (const id in input.nodes) {
    const raw = input.nodes[id]
    if (!validIds.has(id)) {
      if (!NodeId.safeParse(id).success) return parseDesign(input)
      validIds.add(id)
    }
    const parsed = parseLayer(raw)
    if (!parsed.success) return parseDesign(input)
    entries.push([id, parsed.layer])
  }
  const nodes = Object.fromEntries(entries)

  // Parents and cycles only change when layers come or go, or a layer changes parent or type.
  const changed = last && last.head === head ? changedLayers(last.nodes, nodes) : undefined
  if (!changed || changed.structural) {
    let failed = false
    checkStructure({ ...head, nodes }, () => {
      failed = true
    })
    if (failed) return parseDesign(input)
  }

  const results: [string, ScopeResult][] = []
  for (const [scope, byNode] of Object.entries(input.overrides ?? {})) {
    if (!validScopes.has(scope)) {
      if (!Scope.safeParse(scope).success) return parseDesign(input)
      validScopes.add(scope)
    }
    if (!isRecord(byNode) || !head.formats[formatIdOf(scope) ?? '']) return parseDesign(input)
    const result = parseScope(scope, byNode, nodes, changed?.ids)
    if (!result) return parseDesign(input)
    results.push([scope, result])
  }
  last = { head, nodes }
  for (const [scope, result] of results) lastScopes.set(scope, result)
  const overrides = Object.fromEntries(results.map(([scope, result]) => [scope, result.filled]))
  return { success: true, design: { ...head, nodes, overrides } }
}

/**
 * One layer, validated on its own: its type, props and defaults, but not its parent. Frozen: it is
 * shared by every later parse of the same object.
 */
export function parseLayer(input: unknown): { success: true; layer: Layer } | { success: false; errors: string[] } {
  const cached = isRecord(input) ? layerCache.get(input) : undefined
  if (cached) return { success: true, layer: cached }
  const parsed = Layer.safeParse(input)
  if (!parsed.success)
    return { success: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
  const layer = deepFreeze(parsed.data)
  if (isRecord(input)) layerCache.set(input, layer)
  layerCache.set(layer, layer)
  return { success: true, layer }
}

function parseHead(input: Record<string, unknown>): Head | undefined {
  const cached = isRecord(input.meta) ? headCache.get(input.meta) : undefined
  if (cached && cached.formats === input.formats && cached.pages === input.pages) return cached.head
  const parsed = DesignHead.safeParse(input)
  if (!parsed.success) return undefined
  const head = deepFreeze(parsed.data)
  if (isRecord(input.meta)) headCache.set(input.meta, { formats: input.formats, pages: input.pages, head })
  headCache.set(head.meta, { formats: head.formats, pages: head.pages, head })
  return head
}

/** The ids whose layer differs between two sets of layers, and whether any of them came, went, or changed parent or type. */
function changedLayers(before: Record<string, Layer>, after: Record<string, Layer>) {
  const ids = new Set<string>()
  let structural = false
  for (const id in after) {
    const was = Object.hasOwn(before, id) ? before[id] : undefined
    const now = after[id] as Layer
    if (was === now) continue
    ids.add(id)
    if (!was || was.parentId !== now.parentId || was.type !== now.type) structural = true
  }
  for (const id in before) {
    if (Object.hasOwn(after, id)) continue
    ids.add(id)
    structural = true
  }
  return { ids, structural }
}

/**
 * Checks one scope's overrides and fills their defaults. A scope object seen last time, whose
 * layers didn't change since, comes back as it was; one whose layers changed copies the last
 * result and checks only those layers again.
 */
function parseScope(
  scope: string,
  byNode: Record<string, unknown>,
  nodes: Record<string, Layer>,
  changed: Set<string> | undefined,
): ScopeResult | undefined {
  const prev = lastScopes.get(scope)
  const own = (id: string) => (Object.hasOwn(nodes, id) ? nodes[id] : undefined)
  if (prev && changed && prev.nodes === last?.nodes && (prev.input === byNode || prev.filled === byNode)) {
    const filled = { ...prev.filled }
    for (const id of changed) {
      if (!Object.hasOwn(byNode, id)) continue
      const values = parsePair(scope, id, own(id), byNode[id])
      if (!values) return undefined
      put(filled, id, values)
    }
    return { input: prev.input, filled: changed.size > 0 ? filled : prev.filled, nodes }
  }
  const filled: Record<string, Record<string, unknown>> = {}
  for (const id in byNode) {
    const values = parsePair(scope, id, own(id), byNode[id])
    if (!values) return undefined
    put(filled, id, values)
  }
  return { input: byNode, filled, nodes }
}

/** One layer's override values in one scope, checked and filled, or undefined if they are invalid. */
function parsePair(scope: string, nodeId: string, node: Layer | undefined, props: unknown) {
  const hit = isRecord(props) ? pairCache.get(props) : undefined
  if (hit && hit.node === node) return hit.filled
  if (!node || !isRecord(props)) return undefined
  if (!validIds.has(nodeId)) {
    if (!NodeId.safeParse(nodeId).success) return undefined
    validIds.add(nodeId)
  }
  let failed = false
  checkOverride(scope, nodeId, node, props, () => {
    failed = true
  })
  if (failed) return undefined
  const filled = overrideDefaults(node, props)
  pairCache.set(props, { node, filled })
  pairCache.set(filled, { node, filled })
  return filled
}
