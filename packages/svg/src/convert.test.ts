import { describe, expect, it, vi } from 'vitest'

import { loadCanvasKit } from '@dazbee/renderer/node'

import { SvgError, svgToLayers } from './convert.ts'
import { growth, MAX_GROWTH } from './test-growth.ts'

const ck = await loadCanvasKit()
const svg = (body: string, attrs = 'width="100" height="100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`
const layers = (text: string) => {
  const out = svgToLayers(ck, text)
  return { ...out, list: Object.values(out.tree.nodes) }
}
const problem = (text: string) => {
  try {
    svgToLayers(ck, text)
  } catch (error) {
    return error instanceof SvgError ? error.problem : String(error)
  }
  return 'none'
}

/** The elements the conversion has read, while `limit` is set: past it, the next read throws. */
const reads = vi.hoisted(() => ({ count: 0, limit: Number.POSITIVE_INFINITY }))
vi.mock('./style.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./style.ts')>()
  return {
    ...actual,
    // The conversion works out the style of each element it reads, so this counts the reads. Masks,
    // clips and gradient stops work out more styles than that; a fan of uses has none.
    styleOf: (...args: Parameters<typeof actual.styleOf>) => {
      if (++reads.count > reads.limit) throw new Error(`read more than ${reads.limit} elements`)
      return actual.styleOf(...args)
    },
  }
})
/** What the conversion makes of `text`, and how many elements it read, stopping it past `limit`. */
const elementsRead = (text: string, limit: number) => {
  reads.count = 0
  reads.limit = limit
  try {
    return { problem: problem(text), count: reads.count }
  } finally {
    reads.limit = Number.POSITIVE_INFINITY
  }
}
/** The conversion's work budget: it reads at most this many elements of a file, then refuses it. */
const WORK_BUDGET = 100_000

describe('svgToLayers', () => {
  it('makes a path layer for each shape, in one group, with its box in the design', () => {
    const { tree, root, list } = layers(
      svg('<rect x="10" y="20" width="30" height="40" fill="#f00"/><circle cx="70" cy="70" r="10" fill="blue"/>'),
    )
    expect(tree.roots).toEqual([root])
    expect(tree.nodes[root]).toMatchObject({ type: 'group', props: { x: 10, y: 20, width: 70, height: 60 } })
    const [rect, circle] = list.filter((n) => n.type === 'graphic')
    expect(rect?.props).toMatchObject({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      fills: [{ type: 'solid', color: '#FF0000FF' }],
    })
    expect(circle?.props).toMatchObject({
      x: 60,
      y: 60,
      width: 20,
      height: 20,
      fills: [{ type: 'solid', color: '#0000FFFF' }],
    })
    // The outline is drawn from the layer's corner.
    expect(rect?.type === 'graphic' && rect.props.shape).toMatchObject({ kind: 'path', d: 'M0 40L0 0L30 0L30 40Z' })
  })

  it('bakes transforms and the viewBox into the outline, and scales strokes', () => {
    const { list } = layers(
      svg(
        '<g transform="translate(5 5)"><rect width="10" height="10" transform="scale(2)" fill="none" stroke="red" stroke-width="1"/></g>',
        'viewBox="0 0 50 50" width="100" height="100"',
      ),
    )
    const rect = list.find((n) => n.type === 'graphic')
    expect(rect?.props).toMatchObject({ x: 10, y: 10, width: 40, height: 40, fills: [] })
    expect(rect?.type === 'graphic' && rect.props.strokes[0]).toMatchObject({ width: 4, paint: { color: '#FF0000FF' } })
  })

  it('fits the drawing to a size', () => {
    const out = svgToLayers(ck, svg('<rect width="100" height="50"/>', 'viewBox="0 0 100 50"'), { fit: 400 })
    expect([out.width, out.height]).toEqual([400, 200])
    expect(out.tree.nodes[out.root]?.props).toMatchObject({ width: 400, height: 200 })
  })

  it('maps a gradient into the layer box', () => {
    const { list } = layers(
      svg(`
      <defs>
        <linearGradient id="a"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
        <linearGradient id="b" href="#a" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0"/>
        <radialGradient id="c" href="#a"/>
      </defs>
      <rect x="0" y="0" width="50" height="20" fill="url(#a)"/>
      <rect x="50" y="20" width="50" height="20" fill="url(#b)"/>
      <rect x="0" y="50" width="40" height="40" fill="url(#c)"/>`),
    )
    const [a, b, c] = list
      .filter((n) => n.type === 'graphic')
      .map((n) => (n.type === 'graphic' ? n.props.fills[0] : undefined))
    expect(a).toMatchObject({ type: 'linear', from: { x: 0, y: 0 }, to: { x: 1, y: 0 } })
    // The gradient spans 0–100 across the page; this rect is its right half.
    expect(b?.type === 'linear' && [b.from.x, b.to.x].map((v) => Math.round(v * 1000) / 1000)).toEqual([-1, 1])
    expect(c).toMatchObject({ type: 'radial', center: { x: 0.5, y: 0.5 }, radius: 0.5 })
  })

  it('reads <style> rules, the style attribute and currentColor in the order SVG applies them', () => {
    const { list } = layers(
      svg(`
      <style>.a { fill: green } #b { fill: rgb(0 0 255) } rect { fill: red }</style>
      <g color="#123456"><rect class="a" width="10" height="10"/><rect id="b" class="a" x="20" width="10" height="10"/>
      <rect x="40" width="10" height="10" fill="yellow" style="fill: currentColor"/></g>`),
    )
    const colors = list
      .filter((n) => n.type === 'graphic')
      .map((n) => (n.type === 'graphic' && n.props.fills[0]?.type === 'solid' ? n.props.fills[0].color : ''))
    expect(colors).toEqual(['#008000FF', '#0000FFFF', '#123456FF'])
  })

  it('drops a clip that holds everything and keeps one that cuts', () => {
    const whole = layers(
      svg(
        '<clipPath id="c"><rect width="100" height="100"/></clipPath><g clip-path="url(#c)"><rect x="10" y="10" width="20" height="20"/></g>',
      ),
    )
    expect(whole.list.some((n) => n.props.mask)).toBe(false)
    const cut = layers(
      svg(
        '<clipPath id="c"><circle cx="50" cy="50" r="20"/></clipPath><rect width="100" height="100" clip-path="url(#c)"/>',
      ),
    )
    const mask = cut.list.find((n) => n.props.mask)
    expect(mask).toMatchObject({ type: 'graphic', props: { mask: 'alpha', x: 30, y: 30, width: 40, height: 40 } })
  })

  it('makes text layers', () => {
    const { list } = layers(
      svg(
        '<text x="10" y="40" font-family="\'Brand Sans\', Arial" font-size="20" font-weight="bold" fill="#333">Hello <tspan>there</tspan></text>',
      ),
    )
    const text = list.find((n) => n.type === 'text')
    expect(text?.type === 'text' && text.props).toMatchObject({
      text: 'Hello there',
      style: { fontFamily: 'Brand Sans', fontSize: 20, fontWeight: 700, color: '#333333FF' },
    })
  })

  it('names what it leaves out', () => {
    const out = layers(
      svg(`
      <filter id="f"><feGaussianBlur stdDeviation="2"/></filter>
      <rect width="10" height="10" filter="url(#f)"/>
      <image href="data:image/png;base64,AAAA" width="10" height="10"/>
      <foreignObject width="10" height="10"><div>hi</div></foreignObject>
      <script>alert(1)</script>
      <use href="other.svg#x"/>`),
    )
    expect(out.skipped.sort()).toEqual(['external-reference', 'filter', 'foreign-object', 'image', 'script'])
    expect(out.list.filter((n) => n.type === 'graphic')).toHaveLength(1)
  })
})

describe('svgToLayers with hostile files', () => {
  it('never defines or expands entities', () => {
    const laughs = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]>
      ${svg('<text x="0" y="20">&c;</text><rect width="10" height="10"/>')}`
    const { list } = layers(laughs)
    expect(list.find((n) => n.type === 'text')?.props).toMatchObject({ text: '&c;' })
  })

  it('never reads an external entity', () => {
    const xxe = `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${svg('<text y="20">&x;</text>')}`
    expect(layers(xxe).list.find((n) => n.type === 'text')?.props).toMatchObject({ text: '&x;' })
  })

  it('stops a <use> that refers to itself or to a loop', () => {
    const loop = svg('<g id="a"><use href="#b"/><rect width="5" height="5"/></g><g id="b"><use href="#a"/></g>')
    expect(() => svgToLayers(ck, loop)).not.toThrow()
  })

  it('refuses a file that would make too many layers', () => {
    const fan = (id: string, to: string) =>
      `<g id="${id}">${Array.from({ length: 10 }, () => `<use href="#${to}"/>`).join('')}</g>`
    const bomb = svg(
      `<defs><rect id="r0" width="1" height="1"/>${fan('r1', 'r0')}${fan('r2', 'r1')}${fan('r3', 'r2')}${fan('r4', 'r3')}</defs><use href="#r4"/>`,
    )
    expect(problem(bomb)).toBe('too-big')
  })

  it('refuses a fan of uses that draw nothing, before it runs away', () => {
    const fan = (id: string, to: string) =>
      `<g id="${id}">${Array.from({ length: 10 }, () => `<use href="#${to}"/>`).join('')}</g>`
    const levels = Array.from({ length: 30 }, (_, i) => fan(`e${i + 1}`, `e${i}`)).join('')
    // Stopped at twice the budget, so a fan that runs away fails at once.
    const fan30 = elementsRead(
      svg(`<defs><g id="e0"/>${levels}</defs><rect width="5" height="5"/><use href="#e30"/>`),
      2 * WORK_BUDGET,
    )
    expect(fan30.problem).toBe('too-big')
    expect(fan30.count).toBeLessThanOrEqual(WORK_BUDGET)
  })

  it('leaves out a mask that masks itself, or two that mask each other', () => {
    const self = layers(
      svg(
        '<mask id="m"><rect width="50" height="50" fill="white" mask="url(#m)"/></mask><rect width="80" height="80" mask="url(#m)"/>',
      ),
    )
    expect(self.list.some((n) => n.props.mask === 'luminance')).toBe(true)
    const pair = svg(
      '<mask id="a"><rect width="50" height="50" fill="white" mask="url(#b)"/></mask><mask id="b"><rect width="40" height="40" fill="white" mask="url(#a)"/></mask><rect width="80" height="80" mask="url(#a)"/>',
    )
    expect(() => svgToLayers(ck, pair)).not.toThrow()
  })

  it('refuses nesting deeper than it reads, through uses as well as groups', () => {
    const chain = Array.from(
      { length: 30 },
      (_, i) => `<g id="c${i + 1}">${'<g>'.repeat(20)}<use href="#c${i}"/>${'</g>'.repeat(20)}</g>`,
    ).join('')
    expect(problem(svg(`<defs><rect id="c0" width="1" height="1"/>${chain}</defs><use href="#c30"/>`))).toBe('too-big')
  })

  it('reads a flood of comments or a style sheet with no braces in linear time', () => {
    const floods = [
      {
        name: 'a flood of comments',
        file: (n: number) => `${'<!--a-->'.repeat(n)}x`,
        tenth: 500,
        problem: 'unreadable',
      },
      {
        name: 'a style sheet with no braces',
        file: (n: number) => svg(`<style>${'a'.repeat(n)}</style><rect width="5" height="5"/>`),
        tenth: 20_000,
        problem: 'none',
      },
      {
        name: 'a style sheet of open comments',
        file: (n: number) => svg(`<style>${'/*'.repeat(n)}</style><rect width="5" height="5"/>`),
        tenth: 5_000,
        problem: 'none',
      },
    ]
    for (const flood of floods) {
      expect(problem(flood.file(flood.tenth)), flood.name).toBe(flood.problem)
      const grown = growth(problem, flood.file(flood.tenth), flood.file(flood.tenth * 10))
      expect(grown.result, flood.name).toBe(flood.problem)
      expect(grown.times, flood.name).toBeLessThan(MAX_GROWTH)
    }
  })

  it('refuses what is not an SVG, or not well formed, or draws nothing', () => {
    expect(problem('<html><body/></html>')).toBe('not-svg')
    expect(problem('<svg><rect></svg>')).toBe('unreadable')
    expect(problem('not xml at all')).toBe('unreadable')
    expect(problem(svg('<rect width="0" height="10"/>'))).toBe('empty')
    expect(problem(`<svg>${'<g>'.repeat(300)}${'</g>'.repeat(300)}</svg>`)).toBe('unreadable')
  })
})
