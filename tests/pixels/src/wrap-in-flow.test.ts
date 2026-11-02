// Grouping or framing layers inside an auto layout frame (#233), at the commands seam, with the
// boxes the flow draws them at: a fixed, a filling, a hugging and a kept-in-place child, each
// wrapped in a group and in a frame, leaves every drawn box where it was in every format.
import { loadDesign, openSession, readDesign } from '@dazbee/doc'
import { render, type SceneLayer } from '@dazbee/renderer'
import { parseDesign, type Design } from '@dazbee/schema'
import { describe, expect, it } from 'vitest'

const rect = (name: string, parentId: string, index: string, width: number, height: number, extra: Record<string, unknown> = {}) =>
  ({ type: 'graphic', parentId, index, name, props: { x: 0, y: 0, width, height, shape: { kind: 'rect' }, fills: [{ type: 'solid', color: '#2F6BFFFF' }], ...extra } })
const json = {
  meta: { schemaVersion: 5, designId: 'd', name: 'Flow', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' }, wide: { name: 'Wide', width: 1920, height: 1080, order: 'a1' } },
  pages: { p1: { name: 'Page', order: 'a0' } },
  nodes: {
    auto: {
      type: 'frame', parentId: 'p1', index: 'a0', name: 'Auto layout',
      props: { x: 40, y: 240, width: 560, height: 160, sizing: { width: 'fixed', height: 'hug' }, layout: { direction: 'row', gap: 20, padding: { top: 20, right: 20, bottom: 20, left: 20 } } },
    },
    aFixed: rect('Flow fixed', 'auto', 'a0', 120, 120),
    aFill: rect('Flow fill', 'auto', 'a1', 100, 120, { sizing: { width: 'fill', height: 'fixed' } }),
    aHug: {
      type: 'frame', parentId: 'auto', index: 'a2', name: 'Flow hug',
      props: { x: 0, y: 0, width: 10, height: 10, sizing: { width: 'hug', height: 'hug' }, layout: { direction: 'row', gap: 0, padding: { top: 30, right: 30, bottom: 30, left: 30 } } },
    },
    aHugIn: rect('Hug inner', 'aHug', 'a0', 60, 60),
    aAbs: rect('Flow absolute', 'auto', 'a3', 60, 60, { x: 520, y: 330, absolute: true }),
  },
  // The wide format makes the frame wider, so the filling child is drawn wider there.
  overrides: { 'format:wide': { auto: { width: 900 } } },
}

type Box = { x: number; y: number; width: number; height: number }
/** Every layer's drawn box in a format, as the renderer lays the flow out. */
function drawn(design: Design, formatId: string): Record<string, Box> {
  const out: Record<string, Box> = {}
  const walk = (layers: SceneLayer[]) => {
    for (const l of layers) {
      out[l.id] = { x: l.props.x, y: l.props.y, width: l.props.width, height: l.props.height }
      walk(l.children)
    }
  }
  walk(render(design, 'p1', formatId).layers)
  return out
}

describe('wrapping layers in a flow', () => {
  for (const command of ['node.group', 'node.frame'] as const) {
    for (const id of ['aFixed', 'aFill', 'aHug', 'aAbs']) {
      it(`${command} on ${id} keeps every drawn box, in every format`, () => {
        const parsed = parseDesign(json)
        if (!parsed.success) throw new Error(parsed.errors.join('\n'))
        const doc = loadDesign(parsed.design)
        const tab = openSession(doc)
        const before = Object.fromEntries(['sq', 'wide'].map((f) => [f, drawn(readDesign(doc), f)]))
        // Where the editor sees them drawn, by format scope.
        const boxes = Object.fromEntries(['sq', 'wide'].map((f) => [`format:${f}`, { [id]: before[f]?.[id] as Box }]))
        const wrapper = tab.run(command, { ids: [id], drawn: boxes })
        const now = readDesign(doc)
        for (const f of ['sq', 'wide']) {
          const after = drawn(now, f)
          for (const [layer, box] of Object.entries(before[f] ?? {})) {
            const a = after[layer]
            expect(a, `${layer} in ${f}`).toBeDefined()
            for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs((a?.[key] ?? 0) - box[key]), `${layer}.${key} in ${f}`).toBeLessThanOrEqual(0.5)
          }
        }
        // Around a layer that keeps where it is, the wrapper keeps where it is.
        expect(Boolean(now.nodes[wrapper]?.props.absolute)).toBe(id === 'aAbs')
        tab.undo()
        expect(readDesign(doc).nodes[wrapper]).toBeUndefined()
      })
    }
  }
})
