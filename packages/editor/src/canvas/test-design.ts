// A design with two pages of three frames each, for the tests of the canvas frames and the camera.
import { parseDesign } from '@dazbee/schema'

const white = [{ type: 'solid', color: '#FFFFFFFF' }] as const

export const design = (() => {
  const parsed = parseDesign({
    meta: { designId: 'd', name: 'D' },
    pages: { two: { name: 'Two', order: 'a1' }, one: { name: 'One', order: 'a0' } },
    frames: {
      'one-story': {
        pageId: 'one',
        name: 'Story',
        width: 1080,
        height: 1920,
        x: 1280,
        y: 0,
        fills: white,
        order: 'a1',
      },
      'one-sq': { pageId: 'one', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, fills: white, order: 'a0' },
      'one-mpu': { pageId: 'one', name: 'MPU', width: 300, height: 250, x: 2560, y: 0, fills: white, order: 'a2' },
      'two-sq': { pageId: 'two', name: 'Square', width: 1080, height: 1080, x: 0, y: 0, fills: white, order: 'a0' },
      'two-story': {
        pageId: 'two',
        name: 'Story',
        width: 1080,
        height: 1920,
        x: 1280,
        y: 0,
        fills: white,
        order: 'a1',
      },
      'two-mpu': { pageId: 'two', name: 'MPU', width: 300, height: 250, x: 2560, y: 0, fills: white, order: 'a2' },
    },
    nodes: {},
  })
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  return parsed.design
})()
