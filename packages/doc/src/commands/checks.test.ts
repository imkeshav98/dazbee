import { describe, expect, it } from 'vitest'

import { type Design, parseDesign } from '@dazbee/schema'

import { testDesign } from '../test-design.ts'
import { missingLayer } from './checks.ts'

const design = (): Design => {
  const result = parseDesign(testDesign())
  if (!result.success) throw new Error(result.errors.join('\n'))
  return result.design
}

describe('missingLayer', () => {
  it('names the first id with no layer', () => {
    expect(missingLayer(design(), ['box', 'gone', 'lost'])).toBe('no layer "gone"')
  })

  it('is undefined when every id names a layer, or there are none', () => {
    expect(missingLayer(design(), ['box', 'headline'])).toBeUndefined()
    expect(missingLayer(design(), [])).toBeUndefined()
  })
})
