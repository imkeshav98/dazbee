import { describe, expect, it } from 'vitest'

import { deepFreeze, isRecord } from './json.ts'

describe('isRecord', () => {
  it('is true for plain objects only', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(isRecord(undefined)).toBe(false)
    expect(isRecord('a')).toBe(false)
    expect(isRecord(1)).toBe(false)
  })
})

describe('deepFreeze', () => {
  it('freezes an object and everything inside it, and hands it back', () => {
    const value = { a: { b: [{ c: 1 }] } }
    expect(deepFreeze(value)).toBe(value)
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.a)).toBe(true)
    expect(Object.isFrozen(value.a.b)).toBe(true)
    expect(Object.isFrozen(value.a.b[0])).toBe(true)
  })

  it('hands back values that are not objects as they are', () => {
    expect(deepFreeze(1)).toBe(1)
    expect(deepFreeze(null)).toBe(null)
    expect(deepFreeze('a')).toBe('a')
  })

  it('stops at an object that is frozen already', () => {
    const inner = { c: 1 }
    const value = Object.freeze({ inner })
    deepFreeze(value)
    expect(Object.isFrozen(inner)).toBe(false)
  })
})
