// Filling the catalogs' strings, and the words a count takes in each language.
import { describe, expect, it } from 'vitest'

import { ar } from './ar.ts'
import { en } from './en.ts'
import { counted, designCount } from './index.ts'

describe('counted', () => {
  it('takes the words each count takes in Arabic: 3 to 10 files plural, 11 and over singular', () => {
    const run = (n: number) => counted('ar', ar.editor.exports.run, n)
    expect(run(1)).toBe('تصدير ملف واحد')
    expect(run(2)).toBe('تصدير ملفين')
    expect(run(3)).toBe('تصدير 3 ملفات')
    expect(run(10)).toBe('تصدير 10 ملفات')
    expect(run(11)).toBe('تصدير 11 ملفًا')
    expect(run(99)).toBe('تصدير 99 ملفًا')
    expect(run(100)).toBe('تصدير 100 ملف')
  })

  it('takes one word for one in English and another for the rest', () => {
    const run = (n: number) => counted('en', en.editor.exports.run, n)
    expect(run(1)).toBe('Export 1 file')
    expect(run(2)).toBe('Export 2 files')
    expect(run(11)).toBe('Export 11 files')
  })
})

describe('designCount', () => {
  it('says none for none, the singular for one and the plural for the rest', () => {
    expect([0, 1, 2, 12].map((n) => designCount('en', en, n))).toEqual([
      'No designs yet',
      '1 design',
      '2 designs',
      '12 designs',
    ])
    expect([1, 2, 3, 11].map((n) => designCount('ar', ar, n))).toEqual([
      'تصميم واحد',
      'تصميمان',
      '3 تصاميم',
      '11 تصميمًا',
    ])
  })
})
