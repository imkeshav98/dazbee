import { describe, expect, it } from 'vitest'

import type { SceneLayer } from '@dazbee/renderer'
import { loadCanvasKit } from '@dazbee/renderer/node'
import { LAYER_PROPS, type LayerType, type TextProps } from '@dazbee/schema'

import { hitTest, type Looks } from './hit-test.ts'
import { testLooks } from './test-looks.ts'

const ck = await loadCanvasKit()

/** An image drawn with CanvasKit: `paint` draws on a clear canvas of its size. */
const drawImage = (
  width: number,
  height: number,
  paint: (fill: (rect: Float32Array, alpha: number) => void) => void,
) => {
  const surface = ck.MakeSurface(width, height)
  if (!surface) throw new Error('no surface')
  const canvas = surface.getCanvas()
  canvas.clear(ck.TRANSPARENT)
  paint((rect, alpha) => {
    const p = new ck.Paint()
    p.setColor(ck.Color(200, 40, 40, alpha))
    canvas.drawRect(rect, p)
    p.delete()
  })
  const image = surface.makeImageSnapshot()
  surface.delete()
  return image
}
/** A 200 × 100 image: its left half opaque, its right half clear. */
const HALF = drawImage(200, 100, (fill) => fill(ck.XYWHRect(0, 0, 100, 100), 1))
/** A 200 × 100 image: its left half 5% opaque, its right half 20%. */
const FAINT = drawImage(200, 100, (fill) => {
  fill(ck.XYWHRect(0, 0, 100, 100), 0.05)
  fill(ck.XYWHRect(100, 0, 100, 100), 0.2)
})
/** A 3000 × 2000 cut-out: a disc filling it, its corners clear. */
const CUT_OUT = (() => {
  const surface = ck.MakeSurface(3000, 2000)
  if (!surface) throw new Error('no surface')
  const canvas = surface.getCanvas()
  canvas.clear(ck.TRANSPARENT)
  const p = new ck.Paint()
  p.setColor(ck.Color(20, 120, 220, 1))
  canvas.drawOval(ck.XYWHRect(0, 0, 3000, 2000), p)
  p.delete()
  const image = surface.makeImageSnapshot()
  surface.delete()
  return image
})()
/** What the hit test reads: the alpha maps of the images above, and text laid out with the shipped fonts. */
const looks = testLooks({ half: HALF, faint: FAINT, cutout: CUT_OUT })
/** The same, with no alpha map yet: every image still loading. */
const loading: Looks = { ...looks, alpha: () => undefined }

const RED = { type: 'solid', color: '#FF0000FF' } as const
const OUTLINE = { paint: RED, width: 2 } as const

/** A scene layer, its props parsed so they take their defaults. */
const layer = (id: string, type: LayerType, props: Record<string, unknown>, children: SceneLayer[] = []) =>
  ({ id, type, props: LAYER_PROPS[type].parse(props), children }) as SceneLayer
const shape = (id: string, kind: Record<string, unknown>, box: Record<string, unknown>, fills: unknown[] = [RED]) =>
  layer(id, 'graphic', { ...box, shape: kind, fills })
const rect = (id: string, x: number, y: number, width: number, height: number, rotation = 0) =>
  shape(id, { kind: 'rect' }, { x, y, width, height, rotation })
const photo = (id: string, assetId: string, box: Record<string, unknown>, fill: Record<string, unknown> = {}) =>
  shape(id, { kind: 'rect' }, box, [{ type: 'image', assetId, ...fill }])
const text = (id: string, value: string, box: Record<string, unknown>, more: Record<string, unknown> = {}) =>
  layer(id, 'text', {
    ...box,
    text: value,
    boxMode: 'fixed',
    style: { fontFamily: 'Noto Sans', fontSize: 40, color: '#000000FF' },
    ...more,
  })
const boxLayer = (id: string, clip: boolean, children: SceneLayer[], more: Record<string, unknown> = {}) =>
  layer(id, 'box', { x: 0, y: 0, width: 200, height: 200, clip, ...more }, children)
/** The layer under a point, by id. */
const idAt = (layers: SceneLayer[], x: number, y: number, with_: Looks = looks) => hitTest(layers, { x, y }, with_)?.id

describe('hitTest', () => {
  it('picks the topmost layer under the point, and nothing over empty page', () => {
    const layers = [rect('under', 0, 0, 100, 100), rect('over', 50, 50, 100, 100)]
    expect(idAt(layers, 75, 75)).toBe('over')
    expect(idAt(layers, 25, 25)).toBe('under')
    expect(idAt(layers, 400, 400)).toBeUndefined()
  })

  it('un-rotates the point about the layer centre', () => {
    // A 200×20 bar turned 90° stands upright about its centre (100, 10).
    const bar = [rect('bar', 0, 0, 200, 20, 90)]
    expect(idAt(bar, 100, 80)).toBe('bar')
    expect(idAt(bar, 180, 10)).toBeUndefined()
  })

  it('picks an ellipse, a polygon, a star and a rounded rectangle only inside their outlines', () => {
    const box = { x: 0, y: 0, width: 200, height: 200 }
    const kinds = {
      ellipse: { kind: 'ellipse' },
      polygon: { kind: 'polygon', sides: 6 },
      star: { kind: 'star', points: 5 },
      rounded: { kind: 'rect', cornerRadius: 60 },
      corners: { kind: 'rect', corners: [60, 60, 60, 60] },
    }
    for (const [id, kind] of Object.entries(kinds)) {
      const layers = [rect('under', 0, 0, 200, 200), shape(id, kind, box)]
      expect(idAt(layers, 100, 100), id).toBe(id)
      // The box's top-left corner is empty in every one of them.
      expect(idAt(layers, 8, 8), id).toBe('under')
    }
    // Between a star's points, under its box, what is beneath shows.
    const star = [rect('under', 0, 0, 200, 200), shape('star', kinds.star, box)]
    expect(idAt(star, 100, 20)).toBe('star')
    expect(idAt(star, 40, 60)).toBe('under')
  })

  it('picks a shape with an outline and no fill anywhere inside its outline, and not in its empty corners', () => {
    const ring = layer('ring', 'graphic', {
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      shape: { kind: 'ellipse' },
      strokes: [OUTLINE],
    })
    const layers = [rect('under', 0, 0, 200, 200), ring]
    expect(idAt(layers, 100, 100)).toBe('ring')
    expect(idAt(layers, 8, 8)).toBe('under')
  })

  it("picks a shape's outline stroke where it shows past the outline", () => {
    const thick = layer('thick', 'graphic', {
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      shape: { kind: 'ellipse' },
      fills: [RED],
      strokes: [{ paint: RED, width: 20, align: 'outside' }],
    })
    const layers = [rect('under', 0, 0, 200, 200), thick]
    // 10 px outside the ellipse's left edge, on its 20 px outside stroke.
    expect(idAt(layers, 40, 100)).toBe('thick')
    expect(idAt(layers, 25, 100)).toBe('under')
  })

  it('picks a path inside its outline and near its stroke, and a thin path near it', () => {
    // A triangle drawn as an open stroke: picked inside it and along its edges, not in its box's empty corner.
    const vee = layer('vee', 'graphic', {
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      shape: { kind: 'path', d: 'M0 0 L100 200 L200 0' },
      strokes: [{ paint: RED, width: 4 }],
    })
    const layers = [rect('under', 0, 0, 200, 200), vee]
    expect(idAt(layers, 100, 50)).toBe('vee')
    expect(idAt(layers, 10, 190)).toBe('under')
    // 5 px off its left edge, outside the triangle: half the stroke, 2, and 4 more reach it.
    expect(idAt(layers, 50 - 5, 100 + 2)).toBe('vee')
    // A flat path, as thin as a line, is picked a few pixels off it.
    const flat = layer('flat', 'graphic', {
      x: 0,
      y: 100,
      width: 200,
      height: 0,
      shape: { kind: 'path', d: 'M0 0 L200 0' },
      strokes: [{ paint: RED, width: 2 }],
    })
    expect(idAt([rect('under', 0, 0, 200, 200), flat], 100, 104)).toBe('flat')
    expect(idAt([rect('under', 0, 0, 200, 200), flat], 100, 108)).toBe('under')
  })

  it('picks a photo only where it is at least 10% opaque', () => {
    const layers = [rect('under', 0, 0, 400, 400), photo('photo', 'faint', { x: 0, y: 0, width: 200, height: 100 })]
    expect(idAt(layers, 50, 50)).toBe('under')
    expect(idAt(layers, 150, 50)).toBe('photo')
  })

  it("passes through a cut-out photo's clear corners to the layer below", () => {
    const layers = [rect('under', 0, 0, 600, 400), photo('cutout', 'cutout', { x: 0, y: 0, width: 600, height: 400 })]
    expect(idAt(layers, 300, 200)).toBe('cutout')
    expect(idAt(layers, 20, 20)).toBe('under')
    expect(idAt(layers, 580, 380)).toBe('under')
  })

  it("applies a photo fill's fit and crop to find its pixel", () => {
    const under = rect('under', 0, 0, 400, 400)
    const box = { x: 0, y: 0, width: 100, height: 100 }
    // Fill covers the box with the image's middle, x 50 to 150: opaque up to x 50 of the box.
    const fill = [under, photo('p', 'half', box, { fit: 'fill' })]
    expect(idAt(fill, 40, 50)).toBe('p')
    expect(idAt(fill, 70, 50)).toBe('under')
    // Fit puts the whole image in the box's middle band, y 25 to 75, and nothing above or below it.
    const fit = [under, photo('p', 'half', box, { fit: 'fit' })]
    expect(idAt(fit, 20, 50)).toBe('p')
    expect(idAt(fit, 20, 10)).toBe('under')
    expect(idAt(fit, 70, 50)).toBe('under')
    // A crop of x 0 to 125 stretched over the box: opaque up to x 80 of the box.
    const crop = [under, photo('p', 'half', box, { fit: 'crop', crop: { x: 0, y: 0, width: 125, height: 100 } })]
    expect(idAt(crop, 70, 50)).toBe('p')
    expect(idAt(crop, 90, 50)).toBe('under')
    // Tile repeats the image at its size from the box's corner.
    const tile = [under, photo('p', 'half', { x: 0, y: 0, width: 400, height: 100 }, { fit: 'tile' })]
    expect(idAt(tile, 250, 50)).toBe('p')
    expect(idAt(tile, 350, 50)).toBe('under')
  })

  it('picks a turned photo by its own pixels', () => {
    // The 200 × 100 half-opaque image turned 180°: its opaque half is now on the right.
    const layers = [
      rect('under', 0, 0, 400, 400),
      photo('p', 'half', { x: 0, y: 0, width: 200, height: 100, rotation: 180 }),
    ]
    expect(idAt(layers, 150, 50)).toBe('p')
    expect(idAt(layers, 50, 50)).toBe('under')
  })

  it('picks a photo by its outline until its alpha map is there', () => {
    const layers = [rect('under', 0, 0, 600, 400), photo('cutout', 'cutout', { x: 0, y: 0, width: 600, height: 400 })]
    expect(idAt(layers, 20, 20, loading)).toBe('cutout')
  })

  it('picks a shape with a solid fill over a clear photo fill wherever its outline is', () => {
    const both = shape('both', { kind: 'rect' }, { x: 0, y: 0, width: 600, height: 400 }, [
      RED,
      { type: 'image', assetId: 'cutout' },
    ])
    expect(idAt([rect('under', 0, 0, 600, 400), both], 20, 20)).toBe('both')
  })

  it('picks text only on its laid-out lines, not after a short line or below the last', () => {
    const words = text('words', 'Hi\nHello there', { x: 0, y: 0, width: 600, height: 300 })
    const layers = [rect('under', 0, 0, 600, 300), words]
    // "Hi" on the first line, 40 px type: the line is about 54 px tall.
    expect(idAt(layers, 15, 25)).toBe('words')
    expect(idAt(layers, 300, 25)).toBe('under')
    expect(idAt(layers, 150, 80)).toBe('words')
    expect(idAt(layers, 500, 80)).toBe('under')
    expect(idAt(layers, 15, 250)).toBe('under')
  })

  it("follows a text's alignment: centred lines are picked in the middle of the box", () => {
    const centred = text(
      'words',
      'Hi',
      { x: 0, y: 0, width: 600, height: 300 },
      { align: 'center', verticalAlign: 'middle' },
    )
    const layers = [rect('under', 0, 0, 600, 300), centred]
    expect(idAt(layers, 300, 150)).toBe('words')
    expect(idAt(layers, 15, 25)).toBe('under')
    expect(idAt(layers, 300, 25)).toBe('under')
  })

  it('picks a text with no words by its box, so it can still be grabbed', () => {
    const empty = text('empty', '', { x: 0, y: 0, width: 300, height: 100 })
    expect(idAt([rect('under', 0, 0, 600, 300), empty], 200, 80)).toBe('empty')
  })

  it('counts the whole box of the layer asked for, as the text being typed in', () => {
    const words = text('words', 'Hi', { x: 0, y: 0, width: 600, height: 300 })
    const layers = [rect('under', 0, 0, 600, 300), words]
    expect(hitTest(layers, { x: 400, y: 250 }, looks, { wholeBox: 'words' })?.id).toBe('words')
  })

  it("picks a group's child where it shows, and what lies beneath the group between them", () => {
    const group = layer('g', 'group', { x: 0, y: 0, width: 200, height: 200 }, [
      shape('dot', { kind: 'ellipse' }, { x: 0, y: 0, width: 200, height: 200 }),
    ])
    const layers = [rect('under', 0, 0, 200, 200), group]
    expect(idAt(layers, 100, 100)).toBe('dot')
    expect(idAt(layers, 8, 8)).toBe('under')
    // A wide ellipse turned 90° with its group stands upright: picked at its top, not in its box's corner.
    const turned = layer('g', 'group', { x: 0, y: 0, width: 200, height: 200, rotation: 90 }, [
      shape('dot', { kind: 'ellipse' }, { x: 0, y: 50, width: 200, height: 100 }),
    ])
    expect(idAt([rect('under', 0, 0, 200, 200), turned], 100, 10)).toBe('dot')
    expect(idAt([rect('under', 0, 0, 200, 200), turned], 55, 5)).toBe('under')
  })

  it('picks the child inside a box, the box on its empty part, and hides what a clipping box cuts off', () => {
    const child = rect('child', 150, 150, 100, 100)
    expect(idAt([boxLayer('f', true, [child])], 160, 160)).toBe('child')
    expect(idAt([boxLayer('f', true, [child])], 20, 20)).toBe('f')
    expect(idAt([boxLayer('f', true, [child])], 240, 240)).toBeUndefined()
    expect(idAt([boxLayer('f', false, [child])], 240, 240)).toBe('child')
  })

  it("passes through a box's rounded corners, and a clipping box cuts its children by them", () => {
    const child = rect('child', 0, 0, 200, 200)
    const rounded = (clip: boolean) => [rect('under', 0, 0, 200, 200), boxLayer('f', clip, [], { cornerRadius: 80 })]
    expect(idAt(rounded(true), 100, 100)).toBe('f')
    expect(idAt(rounded(true), 6, 6)).toBe('under')
    const clipping = [rect('under', 0, 0, 200, 200), boxLayer('f', true, [child], { cornerRadius: 80 })]
    expect(idAt(clipping, 100, 100)).toBe('child')
    expect(idAt(clipping, 6, 6)).toBe('under')
  })

  it('picks an ellipse inside a box only inside its outline, and the box around it', () => {
    const box = boxLayer('f', false, [shape('dot', { kind: 'ellipse' }, { x: 0, y: 0, width: 200, height: 200 })])
    expect(idAt([box], 100, 100)).toBe('dot')
    expect(idAt([box], 8, 8)).toBe('f')
  })

  it('passes over a layer that is not pickable, and everything in it, to what lies beneath', () => {
    const under = rect('under', 0, 0, 300, 300)
    const locked = boxLayer('f', true, [rect('child', 150, 150, 100, 100)])
    const unlocked = (l: { id: string }) => l.id !== 'f'
    expect(hitTest([under, locked], { x: 160, y: 160 }, looks, { pickable: unlocked })?.id).toBe('under')
    expect(idAt([under, locked], 160, 160)).toBe('child')
  })

  it('picks a line near it, however thin its box, and a boolean by the shapes inside it (#44)', () => {
    const line = layer('line', 'graphic', {
      x: 0,
      y: 50,
      width: 200,
      height: 0,
      shape: { kind: 'line' },
      strokes: [{ paint: RED, width: 6 }],
    })
    // Half the stroke, 3, and 4 more either side.
    expect(idAt([line], 100, 57)).toBe('line')
    expect(idAt([line], 100, 43)).toBe('line')
    expect(idAt([line], 100, 58)).toBeUndefined()
    expect(idAt([line], 201, 50)).toBeUndefined()
    const combined = layer('b', 'boolean', { x: 0, y: 0, width: 300, height: 100, fills: [RED] }, [
      rect('a', 0, 0, 100, 100),
      rect('c', 200, 0, 100, 100),
    ])
    expect(idAt([combined], 250, 50)).toBe('c')
    // Between its shapes, nothing: a boolean has no box of its own to click.
    expect(idAt([combined], 150, 50)).toBeUndefined()
  })

  it('picks a boolean by its combined outline: a subtracted hole shows what lies beneath', () => {
    const ring = layer('b', 'boolean', { x: 0, y: 0, width: 200, height: 200, op: 'subtract', fills: [RED] }, [
      shape('outer', { kind: 'ellipse' }, { x: 0, y: 0, width: 200, height: 200 }),
      shape('hole', { kind: 'ellipse' }, { x: 50, y: 50, width: 100, height: 100 }),
    ])
    const layers = [rect('under', 0, 0, 200, 200), ring]
    expect(idAt(layers, 100, 100)).toBe('under')
    expect(idAt(layers, 100, 25)).toBe('outer')
    expect(idAt(layers, 8, 8)).toBe('under')
  })

  it('never picks a mask, and picks what it masks only inside it, up to the next mask', () => {
    const mask = layer('mask', 'graphic', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      shape: { kind: 'rect' },
      mask: 'alpha',
    })
    const layers = [
      rect('under', 0, 0, 300, 300),
      mask,
      rect('masked', 50, 50, 100, 100),
      { ...mask, id: 'next', props: { ...mask.props, x: 200 } } as SceneLayer,
      rect('after', 120, 120, 30, 30),
    ]
    expect(idAt(layers, 75, 75)).toBe('masked')
    // Outside the mask the masked layer isn't there, nor is the mask: what lies under is picked.
    expect(idAt(layers, 110, 110)).toBe('under')
    expect(idAt(layers, 10, 10)).toBe('under')
    // The next mask starts a run of its own, which the layer after it is in.
    expect(idAt(layers, 130, 130)).toBe('under')
    expect(
      idAt(
        [rect('under', 0, 0, 300, 300), mask, rect('masked', 50, 50, 100, 100), rect('after', 120, 120, 30, 30)],
        130,
        130,
      ),
    ).toBe('under')
  })

  it('picks what an ellipse masks only inside the ellipse, not in its empty corners', () => {
    const mask = layer('mask', 'graphic', {
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      shape: { kind: 'ellipse' },
      mask: 'alpha',
    })
    const layers = [rect('under', 0, 0, 300, 300), mask, rect('masked', 0, 0, 200, 200)]
    expect(idAt(layers, 100, 100)).toBe('masked')
    expect(idAt(layers, 8, 8)).toBe('under')
  })
})

describe('lineBoxes', () => {
  /** The line boxes of a text, from the shipped fonts' layout. */
  const linesOf = (value: string, more: Record<string, unknown> = {}) =>
    looks.lines(text('t', value, { x: 0, y: 0, width: 600, height: 300 }, more).props as TextProps)

  it('gives each laid-out line a box as wide as its words, each below the one before', () => {
    const [short, long] = linesOf('Hi\nHello there')
    expect(short && long).toBeTruthy()
    expect(short?.x).toBeCloseTo(0, 0)
    expect(short?.width).toBeLessThan(long?.width ?? 0)
    expect(long?.y).toBeGreaterThanOrEqual((short?.y ?? 0) + (short?.height ?? 0) - 1)
  })

  it('moves the lines by the alignment, and gives a text with no words none', () => {
    const [centred] = linesOf('Hi', { align: 'center', verticalAlign: 'middle' })
    expect((centred?.x ?? 0) + (centred?.width ?? 0) / 2).toBeCloseTo(300, 0)
    expect((centred?.y ?? 0) + (centred?.height ?? 0) / 2).toBeCloseTo(150, 0)
    expect(linesOf('')).toEqual([])
  })
})
