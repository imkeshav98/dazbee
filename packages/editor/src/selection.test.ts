import { describe, expect, it } from 'vitest'

import type { Design } from '@dazbee/schema'

import type { Frame } from './canvas/frames.ts'
import { editorSelection, isPath } from './selection.ts'

const graphic = (kind: string, parentId?: string) => ({
  type: 'graphic',
  ...(parentId ? { parentId } : {}),
  props: { shape: { kind } },
})
/** Two pages; a rect, a path, and a group holding a rect, in the first page's first frame. */
const fakeDesign = () =>
  ({
    pages: { p1: { name: 'One' }, p2: { name: 'Two' } },
    nodes: {
      rect: graphic('rect', 'p1-f1'),
      path: graphic('path', 'p1-f1'),
      group: { type: 'group', parentId: 'p1-f1', props: {} },
      child: graphic('rect', 'group'),
    },
  }) as unknown as Design
const frame = (pageId: string, name: string) => ({ id: `${pageId}-${name}`, pageId, name }) as Frame
/** Two frames of the first page and one of the second, as the frames shown. */
const FRAMES = [frame('p1', 'f1'), frame('p1', 'f2'), frame('p2', 'f1')]

/** A selection over a fake design and frames whose dependencies and listeners log what they hear. */
function harness() {
  const log: string[] = []
  const world = { design: fakeDesign(), frames: FRAMES }
  const selection = editorSelection({
    drawn: () => world.design,
    frames: () => world.frames,
    changed: () => log.push('changed'),
  })
  selection.onSelection((ids) => log.push(`selection ${ids.join(',')}`))
  selection.onPagePick((pageId) => log.push(`page ${pageId}`))
  /** Takes layers out of the design. */
  const remove = (...ids: string[]) => {
    const nodes = Object.fromEntries(Object.entries(world.design.nodes).filter(([id]) => !ids.includes(id)))
    world.design = { ...world.design, nodes }
  }
  return { selection, log, world, remove }
}

describe('isPath', () => {
  it('says whether a layer is a graphic drawn as a path', () => {
    const design = fakeDesign()
    expect(isPath(design, 'path')).toBe(true)
    expect(isPath(design, 'rect')).toBe(false)
    expect(isPath(design, 'group')).toBe(false)
    expect(isPath(design, 'gone')).toBe(false)
  })
})

describe('editorSelection', () => {
  it('starts with nothing selected, entered, picked, cropped, edited or hovered', () => {
    const { selection, log } = harness()
    expect(selection.current()).toBeNull()
    expect(selection.entered()).toBeNull()
    expect(selection.pickedPage()).toBeNull()
    expect(selection.cropping()).toBeNull()
    expect(selection.pathEditing()).toBeNull()
    expect(selection.hovered()).toBeNull()
    expect(log).toEqual([])
  })

  describe('select', () => {
    it('selects layers in one frame and shows it; none lets the selection go', () => {
      const { selection, log } = harness()
      selection.select(['rect', 'path'], 'p1-f1')
      expect(selection.current()).toEqual({ ids: ['rect', 'path'], frameId: 'p1-f1' })
      selection.select([], 'p1-f1')
      expect(selection.current()).toBeNull()
      expect(log).toEqual(['changed', 'changed'])
    })

    it('keeps a path edit only while its one layer stays selected in its frame', () => {
      const { selection } = harness()
      selection.select(['path'], 'p1-f1')
      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      selection.select(['path'], 'p1-f1')
      expect(selection.pathEditing()).toEqual({ id: 'path', frameId: 'p1-f1', selected: [] })
      selection.select(['path', 'rect'], 'p1-f1')
      expect(selection.pathEditing()).toBeNull()

      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      selection.select(['path'], 'p1-f2')
      expect(selection.pathEditing()).toBeNull()
      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      selection.select(['rect'], 'p1-f1')
      expect(selection.pathEditing()).toBeNull()
    })

    it('keeps a crop only while its one layer stays selected in its frame', () => {
      const { selection } = harness()
      selection.crop({ id: 'rect', frameId: 'p1-f1' })
      selection.select(['rect'], 'p1-f1')
      expect(selection.cropping()).toEqual({ id: 'rect', frameId: 'p1-f1' })
      selection.select(['rect'], 'p1-f2')
      expect(selection.cropping()).toBeNull()
      selection.crop({ id: 'rect', frameId: 'p1-f1' })
      selection.select([], 'p1-f1')
      expect(selection.cropping()).toBeNull()
    })

    it('leaves the group gone into and the picked page as they are', () => {
      const { selection } = harness()
      selection.pickPage('p1')
      selection.enter('group')
      selection.select(['child'], 'p1-f1')
      expect(selection.entered()).toBe('group')
      expect(selection.pickedPage()).toBe('p1')
    })
  })

  describe('selectKeepingModes', () => {
    it('sets the selection alone: a crop and a path edit stay, and nothing is shown', () => {
      const { selection, log } = harness()
      selection.crop({ id: 'rect', frameId: 'p1-f1' })
      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      selection.selectKeepingModes({ ids: ['child'], frameId: 'p1-f2' })
      expect(selection.current()).toEqual({ ids: ['child'], frameId: 'p1-f2' })
      expect(selection.cropping()).toEqual({ id: 'rect', frameId: 'p1-f1' })
      expect(selection.pathEditing()).toEqual({ id: 'path', frameId: 'p1-f1', selected: [] })
      expect(log).toEqual([])
    })

    it('with none, lets a crop and a path edit go with the selection, keeping the group gone into', () => {
      const { selection, log } = harness()
      selection.enter('group')
      selection.select(['path'], 'p1-f1')
      selection.crop({ id: 'path', frameId: 'p1-f1' })
      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      log.length = 0
      selection.selectKeepingModes(null)
      expect(selection.current()).toBeNull()
      expect(selection.cropping()).toBeNull()
      expect(selection.pathEditing()).toBeNull()
      expect(selection.entered()).toBe('group')
      expect(log).toEqual([])
    })
  })

  describe('keep', () => {
    it('drops selected layers that are gone, and the selection once none are left', () => {
      const { selection, remove } = harness()
      selection.select(['rect', 'path'], 'p1-f1')
      remove('rect')
      selection.keep()
      expect(selection.current()).toEqual({ ids: ['path'], frameId: 'p1-f1' })
      remove('path')
      selection.keep()
      expect(selection.current()).toBeNull()
    })

    it('lets the selection go when its frame is not on the shown page', () => {
      const { selection, world } = harness()
      selection.select(['rect'], 'p1-f2')
      world.frames = [frame('p1', 'f1')]
      selection.keep()
      expect(selection.current()).toBeNull()
    })

    it('leaves a group gone into once that group is gone', () => {
      const { selection, remove } = harness()
      selection.enter('group')
      selection.select(['rect'], 'p1-f1')
      selection.keep()
      expect(selection.entered()).toBe('group')
      remove('group', 'child')
      selection.keep()
      expect(selection.entered()).toBeNull()
    })

    it('ends a path edit when its layer is no longer selected or no longer a path', () => {
      const { selection, world } = harness()
      selection.select(['path'], 'p1-f1')
      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      selection.keep()
      expect(selection.pathEditing()).not.toBeNull()
      world.design = {
        ...world.design,
        nodes: { ...world.design.nodes, path: graphic('rect', 'p1-f1') },
      } as unknown as Design
      selection.keep()
      expect(selection.pathEditing()).toBeNull()

      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f1' })
      selection.keep()
      expect(selection.pathEditing()).toBeNull()
    })

    it('ends a crop when its layer is no longer selected, or the selection moved frame', () => {
      const { selection } = harness()
      selection.select(['rect'], 'p1-f1')
      selection.crop({ id: 'rect', frameId: 'p1-f1' })
      selection.keep()
      expect(selection.cropping()).not.toBeNull()
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f2' })
      selection.keep()
      expect(selection.cropping()).toBeNull()

      selection.crop({ id: 'rect', frameId: 'p1-f2' })
      selection.selectKeepingModes({ ids: ['path'], frameId: 'p1-f2' })
      selection.keep()
      expect(selection.cropping()).toBeNull()
    })

    it('with nothing selected, ends a crop and a path edit, and leaves the group gone into be', () => {
      const { selection, remove } = harness()
      selection.enter('group')
      selection.crop({ id: 'rect', frameId: 'p1-f1' })
      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      remove('group', 'child')
      selection.keep()
      expect(selection.entered()).toBe('group')
      expect(selection.cropping()).toBeNull()
      expect(selection.pathEditing()).toBeNull()
    })

    it('shows nothing and tells no one', () => {
      const { selection, log, remove } = harness()
      selection.select(['rect'], 'p1-f1')
      log.length = 0
      remove('rect')
      selection.keep()
      expect(log).toEqual([])
    })
  })

  describe('dropOffPage', () => {
    it('lets the selection go when its frame is not shown, with its crop and path edit, keeping the group gone into', () => {
      const { selection, log, world } = harness()
      selection.enter('group')
      selection.select(['rect'], 'p1-f2')
      selection.crop({ id: 'rect', frameId: 'p1-f2' })
      log.length = 0
      selection.dropOffPage()
      expect(selection.current()).toEqual({ ids: ['rect'], frameId: 'p1-f2' })
      expect(selection.cropping()).toEqual({ id: 'rect', frameId: 'p1-f2' })
      world.frames = [frame('p1', 'f1')]
      selection.dropOffPage()
      expect(selection.current()).toBeNull()
      expect(selection.cropping()).toBeNull()
      expect(selection.entered()).toBe('group')
      expect(log).toEqual([])

      selection.select(['path'], 'p1-f1')
      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      world.frames = [frame('p1', 'f2')]
      selection.dropOffPage()
      expect(selection.pathEditing()).toBeNull()
    })
  })

  describe('pickPage', () => {
    it('picks a page that has a frame, shows it and tells the page listeners', () => {
      const { selection, log } = harness()
      selection.pickPage('p2')
      expect(selection.pickedPage()).toBe('p2')
      expect(log).toEqual(['changed', 'page p2'])
    })

    it('picks no page for one the design lacks, or one with no frame shown', () => {
      const { selection, world, log } = harness()
      selection.pickPage('nope')
      expect(selection.pickedPage()).toBeNull()
      world.frames = [frame('p1', 'f1')]
      selection.pickPage('p2')
      expect(selection.pickedPage()).toBeNull()
      expect(log).toEqual([])
    })

    it('does nothing for the page already picked', () => {
      const { selection, log } = harness()
      selection.pickPage('p1')
      log.length = 0
      selection.pickPage('p1')
      expect(log).toEqual([])
    })

    it('lets the selection go, with its crop, path edit and the group gone into', () => {
      const { selection, log } = harness()
      selection.enter('group')
      selection.select(['path'], 'p1-f1')
      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      log.length = 0
      selection.pickPage('p1')
      expect(selection.current()).toBeNull()
      expect(selection.entered()).toBeNull()
      expect(selection.pathEditing()).toBeNull()
      expect(log).toEqual(['changed', 'changed', 'page p1'])
    })

    it('with no selection, leaves the group gone into be', () => {
      const { selection } = harness()
      selection.enter('group')
      selection.pickPage('p1')
      expect(selection.entered()).toBe('group')
    })

    it('lets the page go with null, keeping the selection', () => {
      const { selection, log } = harness()
      selection.pickPage('p1')
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f1' })
      log.length = 0
      selection.pickPage(null)
      expect(selection.pickedPage()).toBeNull()
      expect(selection.current()).toEqual({ ids: ['rect'], frameId: 'p1-f1' })
      expect(log).toEqual(['changed', 'page null'])
    })
  })

  describe('dropGonePage', () => {
    it('keeps the picked page while nothing is selected and its frames are there', () => {
      const { selection } = harness()
      expect(selection.dropGonePage()).toBe(false)
      selection.pickPage('p1')
      expect(selection.dropGonePage()).toBe(false)
      expect(selection.pickedPage()).toBe('p1')
    })

    it('lets the page go once a layer is selected', () => {
      const { selection, log } = harness()
      selection.pickPage('p1')
      selection.select(['rect'], 'p1-f1')
      log.length = 0
      expect(selection.dropGonePage()).toBe(true)
      expect(selection.pickedPage()).toBeNull()
      expect(log).toEqual([])
    })

    it('lets the page go once it is deleted, or its frames are no longer shown', () => {
      const { selection, world } = harness()
      selection.pickPage('p2')
      world.design = { ...world.design, pages: { p1: world.design.pages.p1 } } as Design
      expect(selection.dropGonePage()).toBe(true)

      world.design = fakeDesign()
      selection.pickPage('p2')
      world.frames = [frame('p1', 'f1')]
      expect(selection.dropGonePage()).toBe(true)
      expect(selection.pickedPage()).toBeNull()
    })
  })

  describe('tellListeners', () => {
    it('tells the selection listeners only when the selection differs from the last they heard', () => {
      const { selection, log } = harness()
      selection.tellListeners(false)
      expect(log).toEqual([])
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f1' })
      selection.tellListeners(false)
      selection.tellListeners(false)
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f1' })
      selection.tellListeners(false)
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f2' })
      selection.tellListeners(false)
      selection.selectKeepingModes({ ids: ['rect', 'path'], frameId: 'p1-f2' })
      selection.tellListeners(false)
      selection.selectKeepingModes(null)
      selection.tellListeners(false)
      expect(log).toEqual(['selection rect', 'selection rect', 'selection rect,path', 'selection '])
    })

    it('tells nothing for a change undone before the listeners hear', () => {
      const { selection, log } = harness()
      selection.select(['rect'], 'p1-f1')
      selection.select([], 'p1-f1')
      selection.tellListeners(false)
      expect(log).toEqual(['changed', 'changed'])
    })

    it('tells the page listeners the page went, after the selection listeners', () => {
      const { selection, log } = harness()
      selection.pickPage('p1')
      selection.select(['rect'], 'p1-f1')
      log.length = 0
      selection.tellListeners(selection.dropGonePage())
      expect(log).toEqual(['selection rect', 'page null'])
    })
  })

  describe('enter', () => {
    it('goes into a group or out of every one, showing nothing', () => {
      const { selection, log } = harness()
      selection.enter('group')
      expect(selection.entered()).toBe('group')
      selection.enter(null)
      expect(selection.entered()).toBeNull()
      expect(log).toEqual([])
    })
  })

  describe('crop', () => {
    it('starts and ends a crop, showing nothing', () => {
      const { selection, log } = harness()
      selection.crop({ id: 'rect', frameId: 'p1-f1' })
      expect(selection.cropping()).toEqual({ id: 'rect', frameId: 'p1-f1' })
      selection.crop(null)
      expect(selection.cropping()).toBeNull()
      expect(log).toEqual([])
    })
  })

  describe('editPath and pickAnchors', () => {
    it('goes into a path with no anchor picked, picks anchors, and leaves it', () => {
      const { selection, log } = harness()
      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      const editing = selection.pathEditing()
      selection.pickAnchors([{ contour: 0, index: 2 }])
      expect(selection.pathEditing()).toEqual({ id: 'path', frameId: 'p1-f1', selected: [{ contour: 0, index: 2 }] })
      // The same path edit, so what a press read from it before follows.
      expect(editing?.selected).toEqual([{ contour: 0, index: 2 }])
      selection.editPath(null)
      expect(selection.pathEditing()).toBeNull()
      selection.pickAnchors([{ contour: 0, index: 1 }])
      expect(selection.pathEditing()).toBeNull()
      expect(log).toEqual([])
    })
  })

  describe('hover', () => {
    it('says whether the layer under the pointer changed', () => {
      const { selection, log } = harness()
      expect(selection.hover(null)).toBe(false)
      expect(selection.hover({ id: 'rect', frameId: 'p1-f1' })).toBe(true)
      expect(selection.hover({ id: 'rect', frameId: 'p1-f1' })).toBe(false)
      expect(selection.hover({ id: 'rect', frameId: 'p1-f2' })).toBe(true)
      expect(selection.hover({ id: 'path', frameId: 'p1-f2' })).toBe(true)
      expect(selection.hovered()).toEqual({ id: 'path', frameId: 'p1-f2' })
      expect(selection.hover(null)).toBe(true)
      expect(selection.hovered()).toBeNull()
      expect(log).toEqual([])
    })
  })

  describe('listeners', () => {
    it('stop hearing once they let go, and after destroy', () => {
      const { selection, log } = harness()
      const heard: string[] = []
      const stop = selection.onSelection((ids) => heard.push(ids.join(',')))
      const stopPage = selection.onPagePick((pageId) => heard.push(`page ${pageId}`))
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f1' })
      selection.tellListeners(false)
      expect(stop()).toBe(true)
      expect(stopPage()).toBe(true)
      selection.selectKeepingModes(null)
      selection.pickPage('p1')
      expect(heard).toEqual(['rect'])
      selection.destroy()
      log.length = 0
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f1' })
      selection.tellListeners(true)
      selection.pickPage('p2')
      expect(log).toEqual(['changed', 'changed'])
    })
  })
})
