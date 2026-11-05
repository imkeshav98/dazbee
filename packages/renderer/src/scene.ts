import { childrenOf } from '@dazbee/doc'
import { bindProps, type Design, type Layer, type Paint, type Variables } from '@dazbee/schema'

import { applyLayout, type MeasureText } from './layout.ts'

/** One layer as a scene draws it: its props, bound to the brand's values, and its visible children. */
export type SceneLayer = {
  [T in Layer['type']]: { id: string; type: T; props: Extract<Layer, { type: T }>['props']; children: SceneLayer[] }
}[Layer['type']]

/**
 * A resolved tree for one frame, ready to draw on any surface.
 * Positions are in the frame's design pixels: a layer inside a box or group keeps its own frame
 * coordinates, and a container's rotation turns its children about the container's centre.
 */
export interface Scene {
  frameId: string
  width: number
  height: number
  fills: Paint[]
  layers: SceneLayer[]
}

/**
 * Scene layers built before, by frame and layer, for the editor (#36): with it, `render` hands back
 * the same layer object while the layer and its children are the same objects, so a cache can know
 * an unchanged layer by identity alone.
 */
export type SceneMemo = Map<string, WeakMap<object, { variables: Variables | undefined; layer: SceneLayer }>>

/**
 * Builds the scene for one frame, auto layout solved (#46): the frame's size and fills, and its
 * visible layers. Pure: the design is only read. Without `measure`, text in an auto layout keeps the
 * size its box says. Bound properties take their values from `variables`, the brand kit's (#53),
 * or stay as stored without one.
 */
export function render(
  design: Design,
  frameId: string,
  memo?: SceneMemo,
  measure?: MeasureText,
  variables?: Variables,
): Scene {
  const frame = Object.hasOwn(design.frames, frameId) ? design.frames[frameId] : undefined
  if (!frame) throw new Error(`no frame "${frameId}"`)
  let built = memo?.get(frameId)
  if (memo && !built) memo.set(frameId, (built = new WeakMap()))

  const layersUnder = (parentId: string): SceneLayer[] =>
    childrenOf(design, parentId).flatMap(([id, node]) => {
      if (!node.props.visible) return []
      const children = layersUnder(id)
      // Only a bound layer depends on the variables, so a brand change rebuilds only those.
      const used = node.bindings ? variables : undefined
      const before = built?.get(node)
      if (before && before.variables === used && before.layer.id === id && sameLayers(before.layer.children, children))
        return [before.layer]
      const layer = {
        id,
        type: node.type,
        props: bindProps(node.type, node.props, node.bindings, used),
        children,
      } as SceneLayer
      built?.set(node, { variables: used, layer })
      return [layer]
    })

  return {
    frameId,
    width: frame.width,
    height: frame.height,
    fills: frame.fills,
    layers: applyLayout(layersUnder(frameId), measure),
  }
}

export const sceneMemo = (): SceneMemo => new Map()

function sameLayers(a: SceneLayer[], b: SceneLayer[]) {
  return a.length === b.length && a.every((layer, i) => layer === b[i])
}
