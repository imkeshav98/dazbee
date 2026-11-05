// What the click-through checks share: a cut-out PNG drawn with CanvasKit, a frame where each
// layer has see-through parts over another, the points a click or a hover goes to with the layer
// each picks, and a frame of 200 layers that each show nothing over one point.
import { loadCanvasKit } from '@dazbee/renderer/node'
import type { DesignInput } from '@dazbee/schema'

import { frameDesign, type Seeded } from './seed.ts'

/** A point in the frame's design pixels, the layer a click or a hover there picks, and what is there. */
export interface Spot {
  at: { x: number; y: number }
  picks: string
  what: string
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The click-through frame's spots: each layer with see-through parts picked where it shows, and the
 * layer under it picked through those parts. Corners are the bottom ones, clear of the top bar a
 * selected layer shows over its top edge.
 */
export const SPOTS = {
  photoCorner: { at: { x: 75, y: 445 }, picks: 'base', what: "a cut-out photo's clear corner" },
  photo: { at: { x: 260, y: 260 }, picks: 'cutout', what: "a cut-out photo's middle" },
  ellipseCorner: { at: { x: 595, y: 445 }, picks: 'backdrop', what: "an ellipse's empty corner" },
  ellipse: { at: { x: 780, y: 260 }, picks: 'ellipse', what: "an ellipse's middle" },
  starGap: { at: { x: 130, y: 640 }, picks: 'card', what: "the gap between a star's points" },
  star: { at: { x: 260, y: 780 }, picks: 'star', what: "a star's middle" },
  text: { at: { x: 620, y: 640 }, picks: 'words', what: 'a short text' },
  afterText: { at: { x: 980, y: 640 }, picks: 'panel', what: 'the box after a short line of text' },
  belowText: { at: { x: 900, y: 750 }, picks: 'panel', what: "the box below a text's lines" },
} satisfies Record<string, Spot>

/** Where the perf frame's 200 layers each show nothing, so a click there passes through all of them to the floor. */
export const THROUGH_ALL = { x: 300, y: 300 }

/** How many layers the perf frame stacks over THROUGH_ALL. */
export const STACKED = 200

/** The side of the cut-out PNG, in pixels. */
const CUT_OUT_SIDE = 600

/** A 600 × 600 PNG of a round cut-out, drawn with CanvasKit: an opaque disc with a ring, its corners clear. */
export async function cutOutPng(): Promise<Uint8Array<ArrayBuffer>> {
  const ck = await loadCanvasKit()
  const surface = ck.MakeSurface(CUT_OUT_SIDE, CUT_OUT_SIDE)
  if (!surface) throw new Error('no surface to draw the cut-out on')
  const canvas = surface.getCanvas()
  canvas.clear(ck.TRANSPARENT)
  const paint = new ck.Paint()
  paint.setAntiAlias(true)
  const half = CUT_OUT_SIDE / 2
  paint.setColor(ck.Color(255, 122, 26, 1))
  canvas.drawCircle(half, half, half, paint)
  paint.setColor(ck.Color(255, 214, 102, 1))
  canvas.drawCircle(half, half, half * 0.62, paint)
  paint.delete()
  const image = surface.makeImageSnapshot()
  const png = image.encodeToBytes()
  image.delete()
  surface.delete()
  if (!png) throw new Error('could not encode the cut-out as a PNG')
  return new Uint8Array(png)
}

/**
 * The click-through frame: a cut-out photo over a rectangle, an ellipse and a star over others, and
 * short text over a box. Each layer beneath reaches 20 px past the one over it, so their outlines
 * differ.
 */
export function clickThroughDesign(assetId: string): DesignInput {
  const nodes: Record<string, Seeded> = {
    base: rect('a0', 'Base', { x: 40, y: 40, width: 440, height: 440 }, '#1B9E77FF'),
    cutout: {
      type: 'graphic',
      parentId: 'sq',
      index: 'a1',
      name: 'Cut-out',
      props: {
        x: 60,
        y: 60,
        width: 400,
        height: 400,
        shape: { kind: 'rect' },
        fills: [{ type: 'image', assetId, fit: 'fill' }],
      },
    },
    backdrop: rect('a2', 'Backdrop', { x: 560, y: 40, width: 440, height: 440 }, '#FFC400FF'),
    ellipse: shape('a3', 'Ellipse', { kind: 'ellipse' }, { x: 580, y: 60, width: 400, height: 400 }, '#2F6BFFFF'),
    card: rect('a4', 'Card', { x: 40, y: 540, width: 440, height: 440 }, '#7E57C2FF'),
    star: shape('a5', 'Star', { kind: 'star', points: 5 }, { x: 60, y: 560, width: 400, height: 400 }, '#FF5A36FF'),
    panel: rect('a6', 'Panel', { x: 580, y: 580, width: 460, height: 220 }, '#E7E2DAFF'),
    words: text('a7', 'Words', 'Sale', { x: 600, y: 600, width: 420, height: 170 }, 64),
  }
  return frameDesign({ name: 'Click through', nodes })
}

/**
 * The perf frame: a floor, and over it STACKED layers whose boxes all hold THROUGH_ALL while none
 * shows there (ellipses by a corner, stars between their points, cut-out photos by a clear corner,
 * short texts after their line), so a click or a hover there tests every one of them.
 */
export function stackedDesign(assetId: string): DesignInput {
  const nodes: Record<string, Seeded> = {
    floor: rect('a0', 'Floor', { x: 0, y: 0, width: 1080, height: 1080 }, '#E7E2DAFF'),
  }
  const corner = { x: THROUGH_ALL.x - 10, y: THROUGH_ALL.y - 10, width: 400, height: 400 }
  for (let i = 0; i < STACKED; i++) {
    const index = `a1${String(i).padStart(3, '0')}`
    const kind = i % 4
    nodes[`l${i}`] =
      kind === 0
        ? shape(index, `Ellipse ${i}`, { kind: 'ellipse' }, corner, '#2F6BFF66')
        : kind === 1
          ? shape(
              index,
              `Star ${i}`,
              { kind: 'star', points: 5 },
              // The gap between a 400 px star's top and upper-left points is 70, 80 into its box.
              { x: THROUGH_ALL.x - 70, y: THROUGH_ALL.y - 80, width: 400, height: 400 },
              '#FF5A3666',
            )
          : kind === 2
            ? {
                type: 'graphic',
                parentId: 'sq',
                index,
                name: `Photo ${i}`,
                props: { ...corner, shape: { kind: 'rect' }, fills: [{ type: 'image', assetId, fit: 'fill' }] },
              }
            : text(
                index,
                `Text ${i}`,
                'Hi',
                { x: THROUGH_ALL.x - 100, y: THROUGH_ALL.y - 40, width: 400, height: 120 },
                40,
              )
  }
  return frameDesign({ name: 'Stacked see-through layers', nodes })
}

function rect(index: string, name: string, box: Box, color: string): Seeded {
  return shape(index, name, { kind: 'rect' }, box, color)
}

function shape(
  index: string,
  name: string,
  kind: { kind: 'rect' } | { kind: 'ellipse' } | { kind: 'star'; points: number },
  box: Box,
  color: string,
): Seeded {
  return {
    type: 'graphic',
    parentId: 'sq',
    index,
    name,
    props: { ...box, shape: kind, fills: [{ type: 'solid', color }] },
  }
}

function text(index: string, name: string, value: string, box: Box, fontSize: number): Seeded {
  return {
    type: 'text',
    parentId: 'sq',
    index,
    name,
    props: {
      ...box,
      text: value,
      boxMode: 'fixed',
      style: { fontFamily: 'Noto Sans', fontSize, fontWeight: 700, color: '#111111FF' },
    },
  }
}
