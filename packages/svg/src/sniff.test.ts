import { describe, expect, it } from 'vitest'

import { svgMarkup } from './sniff.ts'

describe('svgMarkup', () => {
  it('takes markup that opens with <svg after a declaration, comments and a doctype', () => {
    expect(svgMarkup('<svg/>')).toBe('<svg/>')
    expect(
      svgMarkup(
        '\uFEFF  <?xml version="1.0"?>\n<!-- made by hand -->\n<!DOCTYPE svg [<!ENTITY a "b">]>\n<svg width="1"></svg>',
      ),
    ).toMatch(/^<\?xml/)
    expect(svgMarkup('<SVG>')).toBe('<SVG>')
  })

  it('refuses anything else', () => {
    for (const text of [
      '',
      'hello',
      '<html><svg></svg></html>',
      '<svgx/>',
      '<!-- open',
      '<!DOCTYPE svg [ <svg/>',
      undefined,
    ]) {
      expect(svgMarkup(text)).toBeNull()
    }
  })

  it('checks a flood of comments in a moment', () => {
    const started = performance.now()
    expect(svgMarkup(`${'<!--a-->'.repeat(100_000)}x`)).toBeNull()
    expect(svgMarkup(`${'<!--a-->'.repeat(100_000)}<svg/>`)).not.toBeNull()
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})
