// Schema version 4: frames have rounded corners, one radius or each corner's own in one value, and
// a version 3 design comes up as it is.
import { describe, expect, it } from 'vitest'
import { migrateDesign, parseDesign, SCHEMA_VERSION } from './index.ts'

const designWith = (frame: Record<string, unknown>, version = SCHEMA_VERSION) => ({
  meta: { schemaVersion: version, designId: 'd1', name: 'D', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  nodes: { f: { type: 'frame', parentId: 'p1', index: 'a0', name: 'Box', props: { x: 0, y: 0, width: 300, height: 200, ...frame } } },
  overrides: {},
})

describe('frame corners', () => {
  it('keeps a frame\'s radius and each corner\'s own, in format overrides too', () => {
    const result = parseDesign({ ...designWith({ cornerRadius: [0, 12, 40, 8] }), overrides: { 'format:sq': { f: { cornerRadius: 6 } } } })
    if (!result.success) throw new Error(result.errors.join('\n'))
    expect(result.design.nodes.f?.props).toMatchObject({ cornerRadius: [0, 12, 40, 8] })
    expect(result.design.overrides['format:sq']?.f?.cornerRadius).toBe(6)
  })

  it('gives a frame without them square corners', () => {
    const result = parseDesign(designWith({}))
    if (!result.success) throw new Error(result.errors.join('\n'))
    expect(result.design.nodes.f?.props).toMatchObject({ cornerRadius: 0 })
  })

  it('refuses a negative radius, and three corners', () => {
    expect(parseDesign(designWith({ cornerRadius: -1 })).success).toBe(false)
    expect(parseDesign(designWith({ cornerRadius: [0, 4, -1, 2] })).success).toBe(false)
    expect(parseDesign(designWith({ cornerRadius: [0, 4, 2] })).success).toBe(false)
  })
})

describe('migration from version 3', () => {
  it('brings a version 3 design up as it is, at the current version', () => {
    const v3 = designWith({}, 3)
    const migrated = migrateDesign(v3) as ReturnType<typeof designWith>
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION)
    expect({ ...migrated, meta: { ...migrated.meta, schemaVersion: 3 } }).toEqual(v3)
    expect(parseDesign(v3).success).toBe(true)
  })
})
