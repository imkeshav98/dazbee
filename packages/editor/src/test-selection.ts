// The selection's test fixtures: a fake design of two pages and its frames, and a selection over
// them whose dependencies and listeners log what they hear.
import type { Design } from '@dazbee/schema'

import type { Frame } from './canvas/frames.ts'
import { editorSelection } from './selection.ts'

export const graphic = (kind: string, parentId?: string) => ({
  type: 'graphic',
  ...(parentId ? { parentId } : {}),
  props: { shape: { kind } },
})
/**
 * Two pages; a rect, a path, and a group holding a rect, in the first page's first frame, and an
 * ellipse in its second.
 */
export const fakeDesign = () =>
  ({
    pages: { p1: { name: 'One' }, p2: { name: 'Two' } },
    frames: { 'p1-f1': { pageId: 'p1' }, 'p1-f2': { pageId: 'p1' }, 'p2-f1': { pageId: 'p2' } },
    nodes: {
      rect: graphic('rect', 'p1-f1'),
      path: graphic('path', 'p1-f1'),
      group: { type: 'group', parentId: 'p1-f1', props: {} },
      child: graphic('rect', 'group'),
      dot: graphic('ellipse', 'p1-f2'),
    },
  }) as unknown as Design
export const frame = (pageId: string, name: string) => ({ id: `${pageId}-${name}`, pageId, name }) as Frame
/** Two frames of the first page and one of the second, as the frames shown. */
export const FRAMES = [frame('p1', 'f1'), frame('p1', 'f2'), frame('p2', 'f1')]

/** A selection over a fake design and frames whose dependencies and listeners log what they hear. */
export function harness() {
  const log: string[] = []
  const world = { design: fakeDesign(), frames: FRAMES }
  const selection = editorSelection({
    drawn: () => world.design,
    frames: () => world.frames,
    changed: () => log.push('changed'),
  })
  selection.onSelection((ids) => log.push(`selection ${ids.join(',')}`))
  selection.onFramePick((frameId) => log.push(`frame ${frameId}`))
  /** Takes layers out of the design. */
  const remove = (...ids: string[]) => {
    const nodes = Object.fromEntries(Object.entries(world.design.nodes).filter(([id]) => !ids.includes(id)))
    world.design = { ...world.design, nodes }
  }
  return { selection, log, world, remove }
}
