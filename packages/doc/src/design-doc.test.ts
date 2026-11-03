import { describe, expect, it } from 'vitest'

import { parseDesign } from '@dazbee/schema'

import { anchorOffset, loadDesign, readDesign, textAnchor } from './index.ts'
import { testDesign, twoTabs } from './test-design.ts'

const parsed = () => {
  const result = parseDesign(testDesign())
  if (!result.success) throw new Error(result.errors.join('\n'))
  return result.design
}

describe('design document', () => {
  it('reads back exactly the design it was loaded with', () => {
    const doc = loadDesign(parsed())
    expect(readDesign(doc)).toEqual(parsed())
  })
})

describe('a text anchor', () => {
  it('keeps a caret on the same character while the other tab edits the text around it', () => {
    const { a, tabB, sync } = twoTabs()
    const anchor = textAnchor(a, 'headline', 6)
    tabB.run('text.edit', { id: 'headline', op: { kind: 'insert', at: 0, text: 'Big ' } })
    sync()
    expect(anchorOffset(a, anchor)).toBe(10)
    tabB.run('text.edit', { id: 'headline', op: { kind: 'delete', at: 0, length: 8 } })
    sync()
    expect(anchorOffset(a, anchor)).toBe(2)
  })

  it('is null for a layer that is gone or not text', () => {
    const { a, tabA } = twoTabs()
    expect(() => textAnchor(a, 'box', 0)).toThrow('"box" is not a text layer')
    const anchor = textAnchor(a, 'headline', 3)
    tabA.run('node.delete', { ids: ['headline'] })
    expect(anchorOffset(a, anchor)).toBeNull()
  })
})
