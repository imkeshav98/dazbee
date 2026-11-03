import { describe, expect, it } from 'vitest'

import { AnyScope, formatIdOf, formatScope, Scope } from './overrides.ts'

describe('Scope', () => {
  it('takes only format scopes', () => {
    expect(Scope.safeParse('format:sq').success).toBe(true)
    expect(Scope.safeParse('base').success).toBe(false)
  })
})

describe('AnyScope', () => {
  it('takes the base and format scopes, and defaults to the base', () => {
    expect(AnyScope.parse('format:sq')).toBe('format:sq')
    expect(AnyScope.parse('base')).toBe('base')
    expect(AnyScope.parse(undefined)).toBe('base')
    expect(AnyScope.safeParse('page:p1').success).toBe(false)
    expect(AnyScope.safeParse('format:').success).toBe(false)
  })
})

describe('formatScope', () => {
  it('names the scope of a format, which formatIdOf reads back', () => {
    expect(formatScope('sq')).toBe('format:sq')
    expect(formatIdOf(formatScope('sq'))).toBe('sq')
  })
})
