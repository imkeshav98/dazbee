import { describe, expect, it } from 'vitest'

import { isPath } from './selection.ts'
import { fakeDesign, frame, FRAMES, graphic, harness } from './test-selection.ts'

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
    expect(selection.pickedFrame()).toBeNull()
    expect(selection.cropping()).toBeNull()
    expect(selection.pathEditing()).toBeNull()
    expect(selection.hovered()).toBeNull()
    expect(log).toEqual([])
  })

  describe('select', () => {
    it('keeps the group gone into only while the layers selected are in its frame', () => {
      const { selection } = harness()
      selection.enter('group')
      selection.select(['child'], 'p1-f1')
      expect(selection.entered()).toBe('group')
      selection.select([], 'p1-f1')
      expect(selection.entered()).toBe('group')
      // Pasted or picked in another frame: the group is no way out of there.
      selection.select(['dot'], 'p1-f2')
      expect(selection.entered()).toBeNull()
    })

    it('remembers the frame last selected in on each page, after the selection is let go', () => {
      const { selection } = harness()
      expect(selection.lastFrameOn('p1')).toBeNull()
      selection.select(['rect'], 'p1-f1')
      selection.select(['dot'], 'p1-f2')
      selection.select([], 'p1-f2')
      expect(selection.lastFrameOn('p1')).toBe('p1-f2')
      expect(selection.lastFrameOn('p2')).toBeNull()
    })

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

    it('leaves the group gone into as it is', () => {
      const { selection } = harness()
      selection.enter('group')
      selection.select(['child'], 'p1-f1')
      expect(selection.entered()).toBe('group')
    })

    it('lets the picked frame go once a layer is selected, and keeps it with none', () => {
      const { selection } = harness()
      selection.pickFrame('p1-f1')
      selection.select([], 'p1-f1')
      expect(selection.pickedFrame()).toBe('p1-f1')
      selection.select(['rect'], 'p1-f1')
      expect(selection.pickedFrame()).toBeNull()
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
    it('lets the picked frame go once it is no longer shown: deleted, or on a page not shown', () => {
      const { selection, world } = harness()
      selection.pickFrame('p1-f2')
      selection.keep()
      expect(selection.pickedFrame()).toBe('p1-f2')
      world.frames = [frame('p1', 'f1')]
      selection.keep()
      expect(selection.pickedFrame()).toBeNull()
    })

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
    it('lets the selection go when its frame is not shown, with its crop, path edit and the group gone into', () => {
      const { selection, log, world } = harness()
      selection.enter('group')
      selection.select(['child'], 'p1-f1')
      selection.crop({ id: 'child', frameId: 'p1-f1' })
      log.length = 0
      selection.dropOffPage()
      expect(selection.current()).toEqual({ ids: ['child'], frameId: 'p1-f1' })
      expect(selection.cropping()).toEqual({ id: 'child', frameId: 'p1-f1' })
      expect(selection.entered()).toBe('group')
      world.frames = [frame('p1', 'f2')]
      selection.dropOffPage()
      expect(selection.current()).toBeNull()
      expect(selection.cropping()).toBeNull()
      expect(selection.entered()).toBeNull()
      expect(log).toEqual([])
      world.frames = FRAMES

      selection.select(['path'], 'p1-f1')
      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      world.frames = [frame('p1', 'f2')]
      selection.dropOffPage()
      expect(selection.pathEditing()).toBeNull()
    })

    it('lets the picked frame go when it is not on the shown page', () => {
      const { selection, world } = harness()
      selection.pickFrame('p2-f1')
      world.frames = [frame('p1', 'f1')]
      selection.dropOffPage()
      expect(selection.pickedFrame()).toBeNull()
    })
  })

  describe('pickFrame', () => {
    it('picks a frame and shows it, telling no listener until they are told', () => {
      const { selection, log } = harness()
      selection.pickFrame('p1-f2')
      expect(selection.pickedFrame()).toBe('p1-f2')
      expect(log).toEqual(['changed'])
    })

    it('for the frame already picked, changes nothing and shows it, and the frame listeners hear it again once told', () => {
      const { selection, log } = harness()
      selection.pickFrame('p1-f1')
      selection.tellListeners()
      log.length = 0
      selection.pickFrame('p1-f1')
      expect(selection.pickedFrame()).toBe('p1-f1')
      selection.tellListeners()
      selection.tellListeners()
      expect(log).toEqual(['changed', 'frame p1-f1'])
    })

    it('with none picked, does nothing for null', () => {
      const { selection, log } = harness()
      selection.pickFrame(null)
      selection.tellListeners()
      expect(log).toEqual([])
    })

    it('lets the selection go, with its crop, path edit and the group gone into', () => {
      const { selection, log } = harness()
      selection.enter('group')
      selection.select(['path'], 'p1-f1')
      selection.editPath({ id: 'path', frameId: 'p1-f1' })
      log.length = 0
      selection.pickFrame('p1-f1')
      expect(selection.current()).toBeNull()
      expect(selection.entered()).toBeNull()
      expect(selection.pathEditing()).toBeNull()
      expect(selection.pickedFrame()).toBe('p1-f1')
    })

    it('with no selection, leaves the group gone into be', () => {
      const { selection } = harness()
      selection.enter('group')
      selection.pickFrame('p1-f1')
      expect(selection.entered()).toBe('group')
    })

    it('lets the frame go with null, keeping the selection', () => {
      const { selection, log } = harness()
      selection.pickFrame('p1-f1')
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f1' })
      selection.pickFrame('p1-f1')
      log.length = 0
      selection.pickFrame(null)
      expect(selection.pickedFrame()).toBeNull()
      expect(selection.current()).toBeNull()
      expect(log).toEqual(['changed'])
    })
  })

  describe('renameFrame', () => {
    it('picks the frame and keeps it as the one renamed until null, or until another frame is picked', () => {
      const { selection, log } = harness()
      selection.renameFrame('p1-f1')
      expect(selection.pickedFrame()).toBe('p1-f1')
      expect(selection.renamingFrame()).toBe('p1-f1')
      expect(log).toEqual(['changed'])
      selection.renameFrame(null)
      expect(selection.renamingFrame()).toBeNull()
      expect(selection.pickedFrame()).toBe('p1-f1')
      selection.renameFrame('p1-f1')
      selection.pickFrame('p1-f2')
      expect(selection.renamingFrame()).toBeNull()
      selection.pickFrame('p1-f1')
      expect(selection.renamingFrame()).toBeNull()
    })

    it('ends with the frame let go, as a layer selected does', () => {
      const { selection } = harness()
      selection.renameFrame('p1-f1')
      selection.select(['rect'], 'p1-f1')
      expect(selection.renamingFrame()).toBeNull()
    })
  })

  describe('tellListeners', () => {
    it('tells the selection listeners only when the selection differs from the last they heard', () => {
      const { selection, log } = harness()
      selection.tellListeners()
      expect(log).toEqual([])
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f1' })
      selection.tellListeners()
      selection.tellListeners()
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f1' })
      selection.tellListeners()
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f2' })
      selection.tellListeners()
      selection.selectKeepingModes({ ids: ['rect', 'path'], frameId: 'p1-f2' })
      selection.tellListeners()
      selection.selectKeepingModes(null)
      selection.tellListeners()
      expect(log).toEqual(['selection rect', 'selection rect', 'selection rect,path', 'selection '])
    })

    it('tells nothing for a change undone before the listeners hear', () => {
      const { selection, log } = harness()
      selection.select(['rect'], 'p1-f1')
      selection.select([], 'p1-f1')
      selection.tellListeners()
      expect(log).toEqual(['changed', 'changed'])
    })

    it('tells the frame listeners when the picked frame differs from the last they heard, after the selection listeners', () => {
      const { selection, log } = harness()
      selection.pickFrame('p1-f1')
      selection.tellListeners()
      selection.tellListeners()
      selection.pickFrame('p1-f2')
      selection.pickFrame('p1-f1')
      selection.tellListeners()
      selection.select(['rect'], 'p1-f1')
      log.length = 0
      selection.tellListeners()
      expect(log).toEqual(['selection rect', 'frame null'])
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

  describe('lightFrame', () => {
    it('says whether the frame lit from outside the stage changed, and lights none at first', () => {
      const { selection, log } = harness()
      expect(selection.litFrame()).toBeNull()
      expect(selection.lightFrame(null)).toBe(false)
      expect(selection.lightFrame('p1-f1')).toBe(true)
      expect(selection.lightFrame('p1-f1')).toBe(false)
      expect(selection.lightFrame('p1-f2')).toBe(true)
      expect(selection.litFrame()).toBe('p1-f2')
      expect(selection.lightFrame(null)).toBe(true)
      expect(selection.litFrame()).toBeNull()
      expect(log).toEqual([])
    })
  })

  describe('listeners', () => {
    it('stop hearing once they let go, and after destroy', () => {
      const { selection, log } = harness()
      const heard: string[] = []
      const stop = selection.onSelection((ids) => heard.push(ids.join(',')))
      const stopFrame = selection.onFramePick((frameId) => heard.push(`frame ${frameId}`))
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f1' })
      selection.tellListeners()
      expect(stop()).toBe(true)
      expect(stopFrame()).toBe(true)
      selection.selectKeepingModes(null)
      selection.pickFrame('p1-f1')
      selection.tellListeners()
      expect(heard).toEqual(['rect'])
      selection.destroy()
      log.length = 0
      selection.selectKeepingModes({ ids: ['rect'], frameId: 'p1-f1' })
      selection.tellListeners()
      selection.pickFrame('p1-f2')
      selection.tellListeners()
      expect(log).toEqual(['changed'])
    })
  })
})
