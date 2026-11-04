import { describe, expect, it } from 'vitest'

import { parseDesign } from './design.ts'
import { parseDesignIncrementally } from './parse-incremental.ts'
import { minimal } from './test-design.ts'

describe('parseDesignIncrementally', () => {
  it('reuses the validated layer for an unchanged layer object, and validates a replaced one again', () => {
    const d = minimal()
    const r2 = { ...d.nodes.r1, link: 'r2', name: 'Second' }
    const nodes = { ...d.nodes, r2 }
    const first = parseDesignIncrementally({ ...d, nodes })
    const changed = { ...d, nodes: { ...nodes, r2: { ...r2, props: { ...r2.props, x: 5 } } } }
    const second = parseDesignIncrementally(changed)
    if (!first.success || !second.success) throw new Error('expected both to parse')
    expect(second.design.nodes.r1).toBe(first.design.nodes.r1)
    expect(second.design.nodes.r2).not.toBe(first.design.nodes.r2)
    expect(second.design.nodes.r2?.props.x).toBe(5)
  })

  it('accepts its own output as input and returns the same layers', () => {
    const first = parseDesignIncrementally(minimal())
    if (!first.success) throw new Error('expected a design')
    const again = parseDesignIncrementally(first.design)
    if (!again.success) throw new Error('expected a design')
    expect(again.design.nodes.r1).toBe(first.design.nodes.r1)
    expect(again.design).toEqual(first.design)
  })

  it('refuses a layer whose link id changes to one its frame holds already', () => {
    const d = minimal()
    const r2 = { ...d.nodes.r1, link: 'r2', index: 'a1' }
    const first = parseDesignIncrementally({ ...d, nodes: { ...d.nodes, r2 } })
    expect(first.success).toBe(true)
    const relinked = { ...d, nodes: { ...d.nodes, r2: { ...r2, link: 'r1' } } }
    const second = parseDesignIncrementally(relinked)
    expect(second).toEqual(parseDesign(relinked))
    expect(second).toEqual({
      success: false,
      errors: ['nodes.r2.link: frame "sq" holds link "r1" twice, also on "r1"'],
    })
  })
})
