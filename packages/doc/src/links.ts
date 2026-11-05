// Linked copies (ADR-0014): the layers in the other frames of a page that share a layer's link id,
// and the frames of a page linked to one another by them. Link ids never cross pages, so a layer
// with the same link id on another page is no copy.
import { type Design, frameIdOf, framesOf } from '@dazbee/schema'

/** A frame's layers by link id. */
type LinkIndex = (frameId: string) => ReadonlyMap<string, string> | undefined

/** Link indexes by a design's `nodes` object: built once for a design that never changes, or handed in by the live design view. */
const indexes = new WeakMap<object, LinkIndex>()

/** Lets a design that keeps its own link index (the live design view) hand it out instead of having one built. */
export function registerLinkIndex(nodes: object, index: LinkIndex) {
  indexes.set(nodes, index)
}

/** A layer's linked copies: the layers with its link id in the other frames of its page, by frame order. */
export function copiesOf(design: Design, id: string): string[] {
  const node = design.nodes[id]
  const frameId = frameIdOf(design, id)
  const pageId = frameId === undefined ? undefined : design.frames[frameId]?.pageId
  if (!node || pageId === undefined) return []
  const index = linkIndex(design)
  return framesOf(design, pageId).flatMap(([other]) => {
    const copy = other === frameId ? undefined : index(other)?.get(node.link)
    return copy === undefined ? [] : [copy]
  })
}

/** The layer a frame holds with a link id, at any depth; a frame holds at most one. */
export function copyIn(design: Design, frameId: string, link: string): string | undefined {
  return linkIndex(design)(frameId)?.get(link)
}

/** The frames of a frame's page that share at least one link id with it, by order. */
export function linkedFrames(design: Design, frameId: string): string[] {
  const pageId = design.frames[frameId]?.pageId
  if (pageId === undefined) return []
  const index = linkIndex(design)
  const own = [...(index(frameId)?.keys() ?? [])]
  return framesOf(design, pageId)
    .map(([other]) => other)
    .filter((other) => other !== frameId && own.some((link) => index(other)?.has(link)))
}

/** The linked frames of a layer's frame that hold no copy of it: where Copy to other frames ▸ Layer puts one. */
export function framesWithout(design: Design, id: string): string[] {
  const node = design.nodes[id]
  const frameId = frameIdOf(design, id)
  if (!node || frameId === undefined) return []
  const index = linkIndex(design)
  return linkedFrames(design, frameId).filter((other) => !index(other)?.has(node.link))
}

/** Every frame's layers by link id: each layer under the frame it sits in at the top. */
function linkIndex(design: Design): LinkIndex {
  const known = indexes.get(design.nodes)
  if (known) return known
  const built = new Map<string, Map<string, string>>()
  for (const [id, node] of Object.entries(design.nodes)) {
    const frameId = frameIdOf(design, id)
    if (frameId === undefined) continue
    const links = built.get(frameId) ?? new Map<string, string>()
    built.set(frameId, links)
    if (!links.has(node.link)) links.set(node.link, id)
  }
  const index: LinkIndex = (frameId) => built.get(frameId)
  indexes.set(design.nodes, index)
  return index
}
