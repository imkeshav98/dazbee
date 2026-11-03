// A design with two pages and three formats, for the tests of the frame grid and the camera.
import { parseDesign } from '@dazbee/schema'

export const design = (() => {
  const parsed = parseDesign({
    meta: { schemaVersion: 5, designId: 'd', name: 'D', kind: 'carousel', primaryFormatId: 'sq' },
    formats: {
      story: { name: 'Story', width: 1080, height: 1920, order: 'a1' },
      sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' },
      mpu: { name: 'MPU', width: 300, height: 250, order: 'a2' },
    },
    pages: { two: { name: 'Two', order: 'a1' }, one: { name: 'One', order: 'a0' } },
    nodes: {},
  })
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  return parsed.design
})()
