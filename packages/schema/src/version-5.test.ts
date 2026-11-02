// Schema version 5: frames have the stroke list shapes have, and a version 4 design comes up as
// it is.
import { describe, expect, it } from 'vitest'
import { migrateDesign, parseDesign, SCHEMA_VERSION } from './index.ts'

const designWith = (frame: Record<string, unknown>, version = SCHEMA_VERSION) => ({
  meta: { schemaVersion: version, designId: 'd1', name: 'D', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  nodes: { f: { type: 'frame', parentId: 'p1', index: 'a0', name: 'Box', props: { x: 0, y: 0, width: 300, height: 200, ...frame } } },
  overrides: {},
})
const outline = { paint: { type: 'solid', color: '#1A1420FF' }, width: 6, align: 'outside', dashes: [12, 6] }

describe('frame strokes', () => {
  it('keeps a frame\'s strokes, filled in as a shape\'s are, in format overrides too', () => {
    const result = parseDesign({ ...designWith({ strokes: [outline] }), overrides: { 'format:sq': { f: { strokes: [] } } } })
    if (!result.success) throw new Error(result.errors.join('\n'))
    expect(result.design.nodes.f?.props).toMatchObject({ strokes: [{ ...outline, cap: 'butt', join: 'miter', dashOffset: 0 }] })
    expect(result.design.overrides['format:sq']?.f?.strokes).toEqual([])
  })

  it('gives a frame without them no strokes', () => {
    const result = parseDesign(designWith({}))
    if (!result.success) throw new Error(result.errors.join('\n'))
    expect(result.design.nodes.f?.props).toMatchObject({ strokes: [] })
  })
})

describe('migration from version 4', () => {
  it('brings a version 4 design up as it is, at the current version', () => {
    const v4 = designWith({ cornerRadius: 12 }, 4)
    const migrated = migrateDesign(v4) as ReturnType<typeof designWith>
    expect(migrated.meta.schemaVersion).toBe(SCHEMA_VERSION)
    expect({ ...migrated, meta: { ...migrated.meta, schemaVersion: 4 } }).toEqual(v4)
    expect(parseDesign(v4).success).toBe(true)
  })
})
