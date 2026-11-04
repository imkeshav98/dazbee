import { describe, expect, it } from 'vitest'

import {
  clickedRect,
  draggedRect,
  drawsBox,
  keepRatio,
  newDrawn,
  newImage,
  newPath,
  newShape,
  SHAPE_MENU_TOOLS,
  withImage,
} from './draw-tools.ts'

describe('SHAPE_MENU_TOOLS', () => {
  it('lists Box after Rectangle and Ellipse', () => {
    expect(SHAPE_MENU_TOOLS).toEqual(['rect', 'ellipse', 'box', 'polygon', 'star', 'line', 'arrow'])
  })
})

describe('drawsBox', () => {
  it('holds for Box and the Frame tool, and for no shape', () => {
    expect(drawsBox('box')).toBe(true)
    expect(drawsBox('frame')).toBe(true)
    expect(SHAPE_MENU_TOOLS.filter((tool) => drawsBox(tool))).toEqual(['box'])
  })
})

describe('newDrawn', () => {
  it('makes a white box named Box for Box and the Frame tool, and a shape for a shape tool', () => {
    for (const tool of ['box', 'frame'] as const)
      expect(newDrawn(tool)).toMatchObject({
        type: 'box',
        name: 'Box',
        props: { fills: [{ type: 'solid', color: '#FFFFFFFF' }] },
      })
    expect(newDrawn('ellipse')).toMatchObject({
      type: 'graphic',
      name: 'Ellipse',
      props: { shape: { kind: 'ellipse' } },
    })
  })
})

describe('drawing a shape (#44)', () => {
  it('spans the drag in any direction, square with Shift, out from the centre with Alt', () => {
    expect(draggedRect('rect', { x: 100, y: 100 }, { x: 40, y: 160 }, false, false)).toEqual({
      x: 40,
      y: 100,
      width: 60,
      height: 60,
      rotation: 0,
    })
    expect(draggedRect('ellipse', { x: 100, y: 100 }, { x: 180, y: 130 }, true, false)).toEqual({
      x: 100,
      y: 100,
      width: 80,
      height: 80,
      rotation: 0,
    })
    expect(draggedRect('star', { x: 100, y: 100 }, { x: 70, y: 140 }, true, false)).toEqual({
      x: 60,
      y: 100,
      width: 40,
      height: 40,
      rotation: 0,
    })
    expect(draggedRect('polygon', { x: 100, y: 100 }, { x: 130, y: 120 }, false, true)).toEqual({
      x: 70,
      y: 80,
      width: 60,
      height: 40,
      rotation: 0,
    })
  })

  it('draws a line as a rect as long as it, turned to its angle, in 45° steps with Shift', () => {
    expect(draggedRect('line', { x: 0, y: 0 }, { x: 30, y: 40 }, false, false)).toEqual({
      x: -10,
      y: 20,
      width: 50,
      height: 0,
      rotation: 53.13,
    })
    // 10° off the diagonal snaps onto it; the length stays the pointer's distance.
    const snapped = draggedRect('arrow', { x: 0, y: 0 }, { x: 100, y: 70 }, true, false)
    expect(snapped.rotation).toBe(45)
    expect(snapped.width).toBe(122.07)
    // Leftwards is a half turn, not a negative width.
    expect(draggedRect('line', { x: 100, y: 0 }, { x: 0, y: 0 }, false, false)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 0,
      rotation: 180,
    })
  })

  it('draws a click at the usual size around where it landed, a box twice as big', () => {
    expect(clickedRect('rect', { x: 300, y: 200 })).toEqual({ x: 250, y: 150, width: 100, height: 100, rotation: 0 })
    expect(clickedRect('arrow', { x: 300, y: 200 })).toEqual({ x: 250, y: 200, width: 100, height: 0, rotation: 0 })
    expect(clickedRect('box', { x: 300, y: 200 })).toEqual({ x: 200, y: 100, width: 200, height: 200, rotation: 0 })
  })

  it('makes each tool its own shape, with what it needs to show', () => {
    expect(newShape('star').props).toMatchObject({ shape: { kind: 'star' }, fills: [{ type: 'solid' }] })
    expect(newShape('arrow').props).toMatchObject({ shape: { kind: 'line', end: 'arrow' }, strokes: [{ width: 4 }] })
    expect(newShape('line').props).not.toHaveProperty('fills')
  })
})

describe('placing an image from the asset library (#52)', () => {
  const photo = { id: 'a1', name: 'Sneaker.jpg', width: 1920, height: 1200 }

  it('takes at most half the frame, keeps its shape and centres on the point', () => {
    const layer = newImage(photo, { x: 540, y: 540 }, { width: 1080, height: 1080 })
    expect(layer).toEqual({
      type: 'graphic',
      name: 'Sneaker.jpg',
      props: {
        x: 270,
        y: 371,
        width: 540,
        height: 338,
        shape: { kind: 'rect' },
        fills: [{ type: 'image', assetId: 'a1', fit: 'fill' }],
      },
    })
    // A tall frame: the width is what limits it.
    expect(newImage(photo, { x: 0, y: 0 }, { width: 300, height: 1000 }).props).toMatchObject({
      width: 150,
      height: 94,
    })
  })

  it('keeps a small image at its own size and names an unnamed one Image', () => {
    expect(
      newImage({ ...photo, name: ' ', width: 40, height: 30 }, { x: 100, y: 100 }, { width: 1080, height: 1080 }),
    ).toMatchObject({
      name: 'Image',
      props: { x: 80, y: 85, width: 40, height: 30 },
    })
  })
})

describe('newPath', () => {
  it('makes the pen’s path a graphic in its box, stroked near-black until a style is picked (#45)', () => {
    expect(newPath('M0 0 L40 30', { x: 10, y: 20, width: 40, height: 30 })).toEqual({
      type: 'graphic',
      name: 'Path',
      props: {
        x: 10,
        y: 20,
        width: 40,
        height: 30,
        shape: { kind: 'path', d: 'M0 0 L40 30', drawnIn: { width: 40, height: 30 } },
        strokes: [{ paint: { type: 'solid', color: '#1F2329FF' }, width: 2, cap: 'round', join: 'round' }],
      },
    })
  })
})

describe('withImage', () => {
  const pink = { type: 'solid' as const, color: '#FF2E7EFF' }
  it('puts an image on top of fills that have none', () => {
    expect(withImage([pink], 'a1')).toEqual([pink, { type: 'image', assetId: 'a1', fit: 'fill', opacity: 1 }])
  })
  it('swaps the topmost image, keeping its fit, opacity, adjustments and filter but not its crop', () => {
    const old = {
      type: 'image' as const,
      assetId: 'a1',
      fit: 'crop' as const,
      opacity: 0.5,
      crop: { x: 1, y: 2, width: 3, height: 4 },
      filter: 'mono' as const,
    }
    const under = { type: 'image' as const, assetId: 'a0', fit: 'fill' as const, opacity: 1 }
    expect(withImage([under, pink, old], 'a2')).toEqual([
      under,
      pink,
      { type: 'image', assetId: 'a2', fit: 'crop', opacity: 0.5, filter: 'mono' },
    ])
  })
})

describe('keepRatio', () => {
  const wide = { width: 200, height: 100 }
  it('reaches as far as the pointer went on the longer side, in the image’s shape', () => {
    expect(keepRatio({ x: 0, y: 0 }, { x: 100, y: 10 }, wide)).toEqual({ x: 100, y: 50 })
    expect(keepRatio({ x: 0, y: 0 }, { x: 10, y: 100 }, wide)).toEqual({ x: 200, y: 100 })
    expect(keepRatio({ x: 100, y: 100 }, { x: 0, y: 90 }, wide)).toEqual({ x: 0, y: 50 })
  })

  it('leaves the pointer be for an image with no size', () => {
    expect(keepRatio({ x: 0, y: 0 }, { x: 30, y: 40 }, { width: 0, height: 100 })).toEqual({ x: 30, y: 40 })
  })
})
