import { describe, expect, it } from 'vitest'

import type { ResourceBytes } from '@dazbee/renderer'
import type { DesignInput, Variables } from '@dazbee/schema'

import { type BrandKitDeps, editorBrandKit } from './brand-kit.ts'
import { sessionOf } from './layers/test-boxes.ts'
import { editorSelection } from './selection.ts'

const STYLE = { fontFamily: 'Noto Sans', fontSize: 20, color: '#000000FF' }
/** One page in one format: a square, a text, and a text bound to the brand's heading font. */
const DESIGN: DesignInput = {
  meta: { schemaVersion: 5, designId: 'd', name: 'D', kind: 'single', primaryFormatId: 'sq' },
  formats: { sq: { name: 'Square', width: 1080, height: 1080, order: 'a0' } },
  pages: { p1: { name: 'One', order: 'a0' } },
  nodes: {
    a: {
      type: 'graphic',
      parentId: 'p1',
      index: 'a0',
      name: 'Square',
      props: { x: 0, y: 0, width: 100, height: 100, shape: { kind: 'rect' }, fills: [] },
    },
    words: {
      type: 'text',
      parentId: 'p1',
      index: 'a1',
      name: 'Words',
      props: { x: 0, y: 200, width: 200, height: 40, text: 'Hello', boxMode: 'fixed', style: STYLE },
    },
    heading: {
      type: 'text',
      parentId: 'p1',
      index: 'a2',
      name: 'Heading',
      props: { x: 0, y: 300, width: 200, height: 40, text: 'Title', boxMode: 'fixed', style: STYLE },
      bindings: { fontFamily: 'brand:heading' },
    },
  },
}
const KIT: Variables = { 'brand:primary': '#FF0000FF', 'brand:heading': 'Noto Sans' }

/**
 * The brand kit on a real session and selection, with bytes that gain a family's files when its
 * load is let go, unless it is one of `failing`, logging what it asks of resources, the view and typing.
 */
function harness(failing: string[] = []) {
  const session = sessionOf(DESIGN)
  const log: string[] = []
  const selection = editorSelection({ drawn: () => session.design(), frames: () => [], changed: () => {} })
  let bytes: ResourceBytes = { fonts: [], fallbackFamilies: [], images: {}, variables: KIT }
  /** Lets every family load asked for so far arrive. */
  const arrivals: (() => void)[] = []
  const arrive = () => {
    for (const done of arrivals.splice(0)) done()
  }
  const deps: BrandKitDeps = {
    session,
    resources: {
      bytes: () => bytes,
      setVariables: (variables) => {
        log.push('setVariables')
        bytes = { ...bytes, variables }
      },
      loadFamilies: (families) => {
        log.push(`load ${families.join(',')}`)
        return families.map(
          (family) =>
            new Promise<void>((resolve) =>
              arrivals.push(() => {
                if (!failing.includes(family))
                  bytes = { ...bytes, fonts: [...bytes.fonts, { family, bytes: new Uint8Array() }] }
                resolve()
              }),
            ),
        )
      },
    },
    view: { redraw: () => log.push('redraw') },
    selection,
    typing: { fitText: (id) => log.push(`fit ${id}`) },
    signal: new AbortController().signal,
  }
  const kit = editorBrandKit(deps)
  const select = (ids: string[]) => selection.select(ids, 'p1/sq')
  return { kit, session, log, select, arrive }
}

describe('editorBrandKit', () => {
  describe('setVariables', () => {
    it('gives bound properties the new values, loads the brand fonts and redraws', async () => {
      const { kit, session, log, arrive } = harness()
      const done = kit.setVariables({ ...KIT, 'brand:heading': 'Inter' })
      arrive()
      await done
      expect(log.slice(0, 3)).toEqual(['setVariables', 'load Inter,Noto Sans', 'redraw'])
      expect(session.design().nodes.heading?.props).toMatchObject({ style: { fontFamily: 'Inter' } })
    })
  })

  describe('bindSelection', () => {
    it('binds a text’s colour and any other layer’s fill to a brand colour, in one undo step', () => {
      const { kit, session, select } = harness()
      select(['a', 'words'])
      expect(kit.bindSelection('color', 'brand:primary')).toBe(2)
      expect(session.design().nodes.a?.bindings).toEqual({ fill: 'brand:primary' })
      expect(session.design().nodes.words?.bindings).toEqual({ textColor: 'brand:primary' })
      session.undo()
      expect(session.design().nodes.a?.bindings).toBeUndefined()
      expect(session.design().nodes.words?.bindings).toBeUndefined()
    })

    it('binds only text to a brand font, fitting it in its new family', () => {
      const { kit, session, log, select } = harness()
      select(['a', 'words'])
      expect(kit.bindSelection('font', 'brand:heading')).toBe(1)
      expect(session.design().nodes.words?.bindings).toEqual({ fontFamily: 'brand:heading' })
      expect(log).toEqual(['fit words'])
    })

    it('unbinds with null', () => {
      const { kit, session, select } = harness()
      select(['heading'])
      expect(kit.bindSelection('font', null)).toBe(1)
      expect(session.design().nodes.heading?.bindings?.fontFamily).toBeUndefined()
    })

    it('changes nothing for a value the kit doesn’t have, or with nothing selected', () => {
      const { kit, session, select } = harness()
      expect(kit.bindSelection('color', 'brand:primary')).toBe(0)
      select(['a'])
      expect(kit.bindSelection('color', 'brand:missing')).toBe(0)
      expect(session.canUndo()).toBe(false)
    })
  })

  describe('refitBrandFonts', () => {
    it('gives text bound to a brand font the kit’s new family once its files are here, a change no one undoes', async () => {
      const { kit, session, log, arrive } = harness()
      const unbound = session.design().nodes.words
      const done = kit.setVariables({ ...KIT, 'brand:heading': 'Inter' })
      expect(session.design().nodes.heading?.props).toMatchObject({ style: { fontFamily: 'Noto Sans' } })
      arrive()
      await done
      expect(session.design().nodes.heading?.props).toMatchObject({ style: { fontFamily: 'Inter' } })
      expect(session.design().nodes.words).toEqual(unbound)
      expect(log).toContain('fit heading')
      expect(session.canUndo()).toBe(false)
    })

    it('leaves the text be when the family’s files don’t come', async () => {
      const { kit, session, log, arrive } = harness(['Inter'])
      const done = kit.setVariables({ ...KIT, 'brand:heading': 'Inter' })
      arrive()
      await done
      expect(session.design().nodes.heading?.props).toMatchObject({ style: { fontFamily: 'Noto Sans' } })
      expect(log).not.toContain('fit heading')
    })

    it('does nothing when every bound text has its brand family', async () => {
      const { kit, log } = harness()
      await kit.refitBrandFonts()
      expect(log).toEqual([])
    })
  })
})
