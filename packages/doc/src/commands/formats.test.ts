import { describe, expect, it } from 'vitest'

import { inOrder } from '@dazbee/schema'

import { openSession, readDesign } from '../index.ts'
import { testDoc } from '../test-design.ts'

describe('format.add', () => {
  it('starts a format from the primary layout scaled to fit and centred, written as overrides', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    tab.run('node.update', { ids: ['box'], scope: 'format:sq', patch: { x: 140, rotation: 15 } })

    const story = tab.run('format.add', { id: 'story', name: 'Story', width: 1080, height: 1920 })

    const design = readDesign(doc)
    // 1080 wide either way, so scale 1 and the square's layout sits 420 px down, in the middle.
    expect(design.overrides['format:story']?.box).toEqual({ x: 140, y: 520, width: 200, height: 100, rotation: 15 })
    expect(design.overrides['format:story']?.headline).toEqual({ x: 60, y: 1020, width: 960, height: 100 })
    tab.undo()
    expect(readDesign(doc).formats[story]).toBeUndefined()
    expect(readDesign(doc).overrides['format:story']).toBeUndefined()

    // Half the square's size, with room to spare across: scale 0.5, centred both ways.
    tab.run('format.add', { id: 'small', name: 'Small', width: 600, height: 540 })
    expect(readDesign(doc).overrides['format:small']?.box).toEqual({
      x: 100,
      y: 50,
      width: 100,
      height: 50,
      rotation: 15,
    })
  })

  it('refuses sizes outside 1:3 to 3:1 or under the short side, as format.update does', () => {
    const tab = openSession(testDoc())
    expect(() => tab.run('format.add', { name: 'Skyscraper', width: 160, height: 600 })).toThrow(/1:3 to 3:1/)
    expect(() => tab.run('format.add', { name: 'Strip', width: 1600, height: 500 })).toThrow(/1:3 to 3:1/)
    expect(() => tab.run('format.add', { name: 'Tiny', width: 90, height: 90 })).toThrow(/short side/)
    expect(tab.run('format.add', { name: 'Edge', width: 1500, height: 500 })).toBeTruthy()
    expect(() => tab.run('format.update', { id: 'sq', width: 4000 })).toThrow(/1:3 to 3:1/)
  })
})

describe('format.update', () => {
  it('renames, resizes and reorders a format', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    tab.run('format.add', { id: 'story', name: 'Story', width: 1080, height: 1920 })
    tab.run('format.update', { id: 'story', name: 'Reel', width: 1080, height: 1350 })
    tab.run('format.update', { id: 'story', before: 'sq' })
    const order = (d = readDesign(doc)) => inOrder(d.formats).map(([id]) => id)
    expect(readDesign(doc).formats.story).toMatchObject({ name: 'Reel', width: 1080, height: 1350 })
    expect(order()).toEqual(['story', 'sq', 'banner'])
    tab.run('format.update', { id: 'story', before: null })
    expect(order()).toEqual(['sq', 'banner', 'story'])
    tab.undo()
    expect(order()).toEqual(['story', 'sq', 'banner'])
    expect(() => tab.run('format.update', { id: 'story', before: 'story' })).toThrow(/no other format/)
  })
})

describe('format.remove', () => {
  it('drops the format and its overrides, keeps the primary and the last one, and undo brings both back', () => {
    const doc = testDoc()
    const tab = openSession(doc)
    expect(readDesign(doc).overrides['format:banner']?.headline).toMatchObject({ x: 4 })

    tab.run('format.remove', { id: 'banner' })
    expect(readDesign(doc).formats.banner).toBeUndefined()
    expect(readDesign(doc).overrides['format:banner']).toBeUndefined()
    expect(() => tab.run('format.remove', { id: 'sq' })).toThrow(/at least one format/)

    tab.undo()
    expect(readDesign(doc).formats.banner).toMatchObject({ name: 'Banner' })
    expect(readDesign(doc).overrides['format:banner']?.headline).toMatchObject({ x: 4, text: 'Sale' })
    expect(() => tab.run('format.remove', { id: 'sq' })).toThrow(/another format primary/)

    tab.run('format.setPrimary', { id: 'banner' })
    expect(readDesign(doc).meta.primaryFormatId).toBe('banner')
    tab.run('format.remove', { id: 'sq' })
    expect(Object.keys(readDesign(doc).formats)).toEqual(['banner'])
  })
})
