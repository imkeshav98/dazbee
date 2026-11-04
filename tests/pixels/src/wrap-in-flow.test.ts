// Grouping or boxing layers inside an auto layout box (#233), at the commands seam, with the
// boxes the flow draws them at: a fixed, a filling, a hugging, a kept-in-place child and a group, each
// wrapped in a group and in a box, leaves every drawn box in its frame where it was, and the linked
// copies in the other frame as they were.
import { describe, expect, it } from 'vitest'

import { loadDesign, openSession, readDesign } from '@dazbee/doc'
import { render, type SceneLayer } from '@dazbee/renderer'
import { type Design, parseDesign } from '@dazbee/schema'

const rect = (
  name: string,
  parentId: string,
  link: string,
  index: string,
  width: number,
  height: number,
  extra: Record<string, unknown> = {},
) => ({
  type: 'graphic',
  parentId,
  link,
  index,
  name,
  props: {
    x: 0,
    y: 0,
    width,
    height,
    shape: { kind: 'rect' },
    fills: [{ type: 'solid', color: '#2F6BFFFF' }],
    ...extra,
  },
})
const autoProps = {
  x: 40,
  y: 240,
  width: 560,
  height: 160,
  sizing: { width: 'fixed', height: 'hug' },
  layout: { direction: 'row', gap: 20, padding: { top: 20, right: 20, bottom: 20, left: 20 } },
}
const hugProps = {
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  sizing: { width: 'hug', height: 'hug' },
  layout: { direction: 'row', gap: 0, padding: { top: 30, right: 30, bottom: 30, left: 30 } },
}
const groupProps = { x: 0, y: 0, width: 80, height: 80 }
/**
 * A square frame and a wide one holding linked copies. The wide frame's box is wider, so the
 * filling child is drawn wider there, and its kept-in-place child takes its turn in the flow.
 */
const json = {
  meta: { designId: 'd', name: 'Flow' },
  pages: { p1: { name: 'Page', order: 'a0' } },
  frames: {
    sq: { pageId: 'p1', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, order: 'a0' },
    wide: { pageId: 'p1', name: 'Wide', width: 1920, height: 1080, x: 1280, y: 0, order: 'a1' },
  },
  nodes: {
    auto: { type: 'box', parentId: 'sq', link: 'auto', index: 'a0', name: 'Auto layout', props: autoProps },
    aFixed: rect('Flow fixed', 'auto', 'aFixed', 'a0', 120, 120),
    aFill: rect('Flow fill', 'auto', 'aFill', 'a1', 100, 120, { sizing: { width: 'fill', height: 'fixed' } }),
    aHug: { type: 'box', parentId: 'auto', link: 'aHug', index: 'a2', name: 'Flow hug', props: hugProps },
    aHugIn: rect('Hug inner', 'aHug', 'aHugIn', 'a0', 60, 60),
    aAbs: rect('Flow absolute', 'auto', 'aAbs', 'a3', 60, 60, { x: 520, y: 330, absolute: true }),
    aGroup: { type: 'group', parentId: 'auto', link: 'aGroup', index: 'a4', name: 'Flow group', props: groupProps },
    aGroupIn: rect('Group inner', 'aGroup', 'aGroupIn', 'a0', 80, 80),
    'wide-auto': {
      type: 'box',
      parentId: 'wide',
      link: 'auto',
      index: 'a0',
      name: 'Auto layout',
      props: { ...autoProps, width: 900 },
    },
    'wide-aFixed': rect('Flow fixed', 'wide-auto', 'aFixed', 'a0', 120, 120),
    'wide-aFill': rect('Flow fill', 'wide-auto', 'aFill', 'a1', 100, 120, {
      sizing: { width: 'fill', height: 'fixed' },
    }),
    'wide-aHug': { type: 'box', parentId: 'wide-auto', link: 'aHug', index: 'a2', name: 'Flow hug', props: hugProps },
    'wide-aHugIn': rect('Hug inner', 'wide-aHug', 'aHugIn', 'a0', 60, 60),
    'wide-aAbs': rect('Flow absolute', 'wide-auto', 'aAbs', 'a3', 60, 60, { x: 520, y: 330, absolute: false }),
    'wide-aGroup': {
      type: 'group',
      parentId: 'wide-auto',
      link: 'aGroup',
      index: 'a4',
      name: 'Flow group',
      props: groupProps,
    },
    'wide-aGroupIn': rect('Group inner', 'wide-aGroup', 'aGroupIn', 'a0', 80, 80),
  },
}

type Box = { x: number; y: number; width: number; height: number }
/** Every layer's drawn box in a frame, as the renderer lays the flow out. */
function drawn(design: Design, frameId: string): Record<string, Box> {
  const out: Record<string, Box> = {}
  const walk = (layers: SceneLayer[]) => {
    for (const l of layers) {
      out[l.id] = { x: l.props.x, y: l.props.y, width: l.props.width, height: l.props.height }
      walk(l.children)
    }
  }
  walk(render(design, frameId).layers)
  return out
}

describe('wrapping layers in a flow', () => {
  for (const command of ['node.group', 'node.box'] as const) {
    for (const id of ['aFixed', 'aFill', 'aHug', 'aAbs', 'aGroup']) {
      for (const [frameId, other] of [
        ['sq', 'wide'],
        ['wide', 'sq'],
      ] as const) {
        it(`${command} on ${id} in ${frameId} keeps every drawn box there, and ${other} as it was`, () => {
          const parsed = parseDesign(json)
          if (!parsed.success) throw new Error(parsed.errors.join('\n'))
          const doc = loadDesign(parsed.design)
          const tab = openSession(doc)
          const layer = frameId === 'sq' ? id : `wide-${id}`
          const was = readDesign(doc)
          const before = drawn(was, frameId)
          // Where the editor sees the layer drawn in its frame.
          const wrapper = tab.run(command, { ids: [layer], drawn: { [layer]: before[layer] as Box } })
          const now = readDesign(doc)
          const after = drawn(now, frameId)
          for (const [shown, box] of Object.entries(before)) {
            const a = after[shown]
            expect(a, `${shown} in ${frameId}`).toBeDefined()
            for (const key of ['x', 'y', 'width', 'height'] as const)
              expect(Math.abs((a?.[key] ?? 0) - box[key]), `${shown}.${key} in ${frameId}`).toBeLessThanOrEqual(0.5)
          }
          expect(drawn(now, other)).toEqual(drawn(was, other))
          for (const [kept, node] of Object.entries(was.nodes))
            if (kept.startsWith('wide-') === (other === 'wide')) expect(now.nodes[kept], kept).toEqual(node)
          // Around a layer that keeps where it is, the wrapper keeps where it is: only the square's copy does.
          expect(Boolean(now.nodes[wrapper]?.props.absolute)).toBe(id === 'aAbs' && frameId === 'sq')
          tab.undo()
          expect(readDesign(doc).nodes[wrapper]).toBeUndefined()
        })
      }
    }
  }
})
