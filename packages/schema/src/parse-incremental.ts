import { checkStructure, DesignHead, parseDesign, type ParseResult } from './design.ts'
import { deepFreeze, isRecord } from './json.ts'
import { Layer } from './layers.ts'
import { NodeId } from './primitives.ts'

/** Validated layers by the object they came from; a validated layer maps to itself. */
const layerCache = new WeakMap<object, Layer>()
const validIds = new Set<string>()

/** Validated heads by their meta object, with the pages and frames they go with; a validated head maps to itself. */
const headCache = new WeakMap<object, { pages: unknown; frames: unknown; head: DesignHead }>()
/** The head and layers of the last design parsed here. */
let last: { head: DesignHead; nodes: Record<string, Layer> } | undefined

/**
 * Validates a design like `parseDesign`, with the same result, but reuses what it validated
 * before for every layer object it has seen: a design read again after one edit only validates
 * what the edit replaced. Inputs must never be changed after being passed in; replace an object
 * instead. Anything invalid goes through `parseDesign` for its exact errors.
 */
export function parseDesignIncrementally(input: unknown): ParseResult {
  if (!isRecord(input) || !isRecord(input.nodes)) return parseDesign(input)
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

  // Parents, cycles and link ids only change when layers come or go, or a layer changes parent,
  // type or link id.
  const structural = !last || last.head !== head || changesStructure(last.nodes, nodes)
  if (structural) {
    let failed = false
    checkStructure({ ...head, nodes }, () => {
      failed = true
    })
    if (failed) return parseDesign(input)
  }
  last = { head, nodes }
  return { success: true, design: { ...head, nodes } }
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

function parseHead(input: Record<string, unknown>): DesignHead | undefined {
  const cached = isRecord(input.meta) ? headCache.get(input.meta) : undefined
  if (cached && cached.pages === input.pages && cached.frames === input.frames) return cached.head
  const parsed = DesignHead.safeParse(input)
  if (!parsed.success) return undefined
  const head = deepFreeze(parsed.data)
  if (isRecord(input.meta)) headCache.set(input.meta, { pages: input.pages, frames: input.frames, head })
  headCache.set(head.meta, { pages: head.pages, frames: head.frames, head })
  return head
}

/** Whether a layer came or went, or changed parent, type or link id, between two sets of layers. */
function changesStructure(before: Record<string, Layer>, after: Record<string, Layer>) {
  for (const id in after) {
    const was = Object.hasOwn(before, id) ? before[id] : undefined
    const now = after[id] as Layer
    if (was === now) continue
    if (!was || was.parentId !== now.parentId || was.type !== now.type || was.link !== now.link) return true
  }
  for (const id in before) if (!Object.hasOwn(after, id)) return true
  return false
}
