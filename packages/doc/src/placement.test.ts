import { describe, expect, it } from 'vitest'

import { parseDesign } from '@dazbee/schema'

import { mergedProps } from './placement.ts'
import { testDesign } from './test-design.ts'

const design = () => {
  const parsed = parseDesign(testDesign())
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  return parsed.design
}

describe('mergedProps', () => {
  it('gives a layer’s own props in the base', () => {
    const d = design()
    expect(mergedProps(d, 'base', 'headline')).toEqual(d.nodes.headline?.props)
  })

  it('puts a format’s overrides on top of the layer’s props', () => {
    const d = design()
    const merged = mergedProps(d, 'format:banner', 'headline')
    expect(merged).toEqual({ ...d.nodes.headline?.props, text: 'Sale', x: 4, runs: [] })
    expect(merged.y).toBe(600)
  })

  it('gives the layer’s own props in a format that overrides nothing of it', () => {
    const d = design()
    expect(mergedProps(d, 'format:sq', 'headline')).toEqual(d.nodes.headline?.props)
    expect(mergedProps(d, 'format:banner', 'box')).toEqual(d.nodes.box?.props)
  })

  it('only merges: values are not checked or filled', () => {
    const d = { ...design(), overrides: { 'format:banner': { box: { x: 'left', extra: 1 } } } }
    expect(mergedProps(d, 'format:banner', 'box')).toMatchObject({ x: 'left', extra: 1, y: 100 })
  })

  it('is empty for a layer that does not exist', () => {
    expect(mergedProps(design(), 'base', 'missing')).toEqual({})
    expect(mergedProps(design(), 'format:banner', 'missing')).toEqual({})
  })
})
