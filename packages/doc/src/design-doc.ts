import * as Y from 'yjs'

import { type Design, parseDesign } from '@dazbee/schema'

import { repair } from './repair.ts'

/**
 * How a design lives in a Y.Doc (ADR-0003, ADR-0014). Every map is a Y.Map so each key merges on its own:
 *
 *   meta    Y.Map<key, value>        designId, name
 *   pages   Y.Map<PageId, Y.Map>     name, order
 *   frames  Y.Map<FrameId, Y.Map>    pageId, name, width, height, x, y, fills, order
 *   nodes   Y.Map<NodeId, Y.Map>     type, parentId, link, index, name, role?, lock?, bindings?,
 *                                    props: Y.Map<path, value>; a text layer's `text` prop is a
 *                                    Y.Text whose formatting holds its runs
 *
 * A deleted page or frame is removed from its map. A deleted layer keeps its Y.Map with
 * `deleted: true`: removing the map would make undo restore it without the edits another tab made
 * to it in the meantime, leaving required keys unset. Once nobody is connected, compaction
 * (compact.ts) drops them.
 */
export type DesignDoc = Y.Doc

/** A place in a text layer's text that follows edits from any tab, such as the caret while typing. */
export interface TextAnchor {
  id: string
  position: Y.RelativePosition
}

type Json = Record<string, unknown>

export const DELETED = 'deleted'

export const root = (doc: DesignDoc) => ({
  meta: doc.getMap<unknown>('meta'),
  pages: doc.getMap<Y.Map<unknown>>('pages'),
  frames: doc.getMap<Y.Map<unknown>>('frames'),
  nodes: doc.getMap<Y.Map<unknown>>('nodes'),
})

export const toYMap = (json: Json) => {
  const map = new Y.Map<unknown>()
  for (const [k, v] of Object.entries(json)) if (v !== undefined) map.set(k, v)
  return map
}

export function toYNode(node: Design['nodes'][string]) {
  const { props, ...rest } = node
  const ynode = toYMap(rest)
  const yprops = new Y.Map<unknown>()
  for (const [path, value] of Object.entries(props)) {
    if (node.type === 'text' && path === 'runs') continue
    if (node.type === 'text' && path === 'text') yprops.set('text', toYText(node.props.text, node.props.runs))
    else yprops.set(path, value)
  }
  ynode.set('props', yprops)
  return ynode
}

/** Writes a whole design into an empty doc in one transaction. */
export function loadDesign(design: Design, doc: DesignDoc = new Y.Doc()): DesignDoc {
  const r = root(doc)
  doc.transact(() => {
    for (const [k, v] of Object.entries(design.meta)) r.meta.set(k, v)
    for (const [id, p] of Object.entries(design.pages)) r.pages.set(id, toYMap(p))
    for (const [id, f] of Object.entries(design.frames)) r.frames.set(id, toYMap(f))
    for (const [id, n] of Object.entries(design.nodes)) r.nodes.set(id, toYNode(n))
  })
  return doc
}

export function nodeToJson(ynode: Y.Map<unknown>): Json {
  const json: Json = {}
  for (const [k, v] of ynode.entries()) {
    if (k !== 'props' && k !== DELETED) json[k] = v
  }
  const props: Json = {}
  const yprops = ynode.get('props')
  if (!(yprops instanceof Y.Map)) return json
  for (const [path, value] of yprops.entries()) {
    if (value instanceof Y.Text) Object.assign(props, fromYText(value))
    else props[path] = value
  }
  json.props = props
  return json
}

/** The doc as plain JSON, before validation. */
export function snapshot(doc: DesignDoc) {
  const r = root(doc)
  const mapOf = <T>(m: Y.Map<T>, f: (v: T) => unknown) =>
    Object.fromEntries([...m.entries()].map(([k, v]) => [k, f(v)]))
  return {
    meta: r.meta.toJSON(),
    pages: mapOf(r.pages, (p) => p.toJSON()),
    frames: mapOf(r.frames, (f) => f.toJSON()),
    nodes: Object.fromEntries(
      [...r.nodes.entries()].filter(([, n]) => n.get(DELETED) !== true).map(([id, n]) => [id, nodeToJson(n)]),
    ),
  }
}

/**
 * Reads the doc as a validated design, after repairing what concurrent edits can break
 * (see repair.ts). A doc that still fails validation is a bug in a command, so this throws.
 */
export function readDesign(doc: DesignDoc, onRepair?: (repairs: string[]) => void): Design {
  const repaired = repair(snapshot(doc))
  if (repaired.repairs.length > 0) onRepair?.(repaired.repairs)
  const result = parseDesign(repaired.snapshot)
  if (!result.success) throw new Error(`design document is invalid:\n${result.errors.join('\n')}`)
  return result.design
}

/** Anchors a UTF-16 offset in a text layer. Reading only: an anchor never writes to the document. */
export function textAnchor(doc: DesignDoc, id: string, offset: number): TextAnchor {
  const ytext = liveText(doc, id)
  if (!ytext) throw new Error(`"${id}" is not a text layer`)
  return { id, position: Y.createRelativePositionFromTypeIndex(ytext, offset) }
}

/** Where an anchor is now, after whatever edits arrived; null once its layer is deleted. */
export function anchorOffset(doc: DesignDoc, anchor: TextAnchor): number | null {
  if (!liveText(doc, anchor.id)) return null
  return Y.createAbsolutePositionFromRelativePosition(anchor.position, doc)?.index ?? null
}

/** A text layer's text and style runs as one Y.Text: run styles become formatting attributes. */
function toYText(text: string, runs: { start: number; end: number; style: Json }[]) {
  const ytext = new Y.Text()
  ytext.insert(0, text)
  for (const run of runs) ytext.format(run.start, run.end - run.start, run.style)
  return ytext
}

/** The reverse of toYText. Adjacent ranges with the same style come back as one run. */
function fromYText(ytext: Y.Text) {
  const runs: { start: number; end: number; style: Json }[] = []
  let at = 0
  for (const op of ytext.toDelta() as { insert: string; attributes?: Json }[]) {
    const end = at + op.insert.length
    if (op.attributes && Object.keys(op.attributes).length > 0)
      runs.push({ start: at, end, style: { ...op.attributes } })
    at = end
  }
  return { text: ytext.toString(), runs }
}

function liveText(doc: DesignDoc, id: string) {
  const node = root(doc).nodes.get(id)
  if (!node || node.get(DELETED) || node.get('type') !== 'text') return null
  return (node.get('props') as Y.Map<unknown>).get('text') as Y.Text
}
