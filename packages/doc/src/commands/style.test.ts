import { describe, expect, it } from 'vitest'
import type * as Y from 'yjs'

import { brandRef, styleOf } from '@dazbee/schema'

import { readDesign } from '../design-doc.ts'
import { linkedDesign, openTestSession, testDoc } from '../test-design.ts'

const navy = '#14213DFF'

function open() {
  const doc = testDoc(linkedDesign())
  return { doc, tab: openTestSession(doc) }
}

describe('node.style', () => {
  it('sets a style on layers, leaving their linked copies, place and size, in one undo step', () => {
    const { doc, tab } = open()
    const from = readDesign(doc).nodes.badge
    if (!from) throw new Error('no badge')
    const style = {
      ...styleOf(from),
      fills: [{ type: 'solid' as const, color: navy }],
      opacity: 0.4,
      bindings: { fill: 'brand:primary' as const },
    }

    tab.run('node.style', { ids: ['bg', 'badge'], style })

    const design = readDesign(doc)
    for (const id of ['bg', 'badge']) {
      expect(design.nodes[id]).toMatchObject({
        props: { fills: [{ color: navy }], opacity: 0.4 },
        bindings: { fill: 'brand:primary' },
      })
    }
    expect(design.nodes.bg?.props).toMatchObject({ x: 0, y: 0, width: 1080, height: 1080 })
    expect(design.nodes['wide-bg']?.props).toMatchObject({ fills: [{ color: '#FF5A36FF' }], opacity: 1 })

    tab.undo()
    expect(readDesign(doc).nodes.bg?.props).toMatchObject({ fills: [{ color: '#FF5A36FF' }], opacity: 1 })
    expect(readDesign(doc).nodes.bg?.bindings).toBeUndefined()
  })

  it('sets a text’s look and clears spacing the style leaves out, keeping its font size', () => {
    const { doc, tab } = open()
    tab.run('node.update', { ids: ['wide-title'], patch: { paragraphSpacing: 8 } })
    const title = readDesign(doc).nodes.title
    if (!title) throw new Error('no title')
    const style = styleOf(title)

    tab.run('node.style', {
      ids: ['wide-title'],
      style: { ...style, text: style.text && { ...style.text, fontWeight: 800 } },
    })

    const props = readDesign(doc).nodes['wide-title']?.props as Record<string, unknown>
    expect(props.style).toMatchObject({ fontWeight: 800, fontSize: 40 })
    expect(props).not.toHaveProperty('paragraphSpacing')
  })

  it('leaves bindings alone when the style has the same ones in another key order', () => {
    const doc = testDoc(linkedDesign())
    const ynode = doc.getMap<Y.Map<unknown>>('nodes').get('title')
    ynode?.set('bindings', { fontFamily: brandRef('heading'), textColor: brandRef('ink') })
    const tab = openTestSession(doc)
    const title = readDesign(doc).nodes.title
    if (!title || !ynode) throw new Error('no title')
    const changed: string[] = []
    ynode.observe((event) => changed.push(...event.keysChanged))

    tab.run('node.style', { ids: ['title'], style: { ...styleOf(title), opacity: 0.5 } })

    expect(readDesign(doc).nodes.title?.props.opacity).toBe(0.5)
    expect(changed).not.toContain('bindings')
  })

  it('refuses a layer whose style is locked', () => {
    const { doc, tab } = open()
    tab.run('node.lock', { ids: ['badge'], lock: { style: true } })
    const bg = readDesign(doc).nodes.bg
    if (!bg) throw new Error('no background')
    const style = styleOf(bg)
    expect(() => tab.run('node.style', { ids: ['badge'], style })).toThrow(/locked \(style\)/)
  })
})
