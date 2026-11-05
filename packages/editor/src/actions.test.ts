import { describe, expect, it } from 'vitest'

import { idsOf, pairsIn } from './selection.ts'
import { FLOW, harness } from './test-actions.ts'

describe('editorActions', () => {
  describe('perform', () => {
    it('zooms and switches tools without a selection, and says it did', () => {
      const { actions, log } = harness()
      expect(actions.perform('zoomToFit')).toBe(true)
      expect(actions.perform('zoomTo100')).toBe(true)
      expect(actions.perform('zoomIn')).toBe(true)
      expect(actions.perform('toggleRulers')).toBe(true)
      expect(actions.perform('toolPen')).toBe(true)
      expect(log).toEqual(['fitAll', 'zoomTo 1', 'zoomIn', 'toggleRulers', 'overlay', 'viewChanged', 'tool pen'])
    })

    it('leaves undo and redo to the editor, which ends what is open first', () => {
      const { actions, session, selection, frame, at } = harness()
      selection.select(['a'], frame.id)
      actions.perform('nudgeRight')
      expect(actions.perform('undo')).toBe(false)
      expect(at('a')).toEqual({ x: 101, y: 100 })
      expect(session.canUndo()).toBe(true)
    })

    it('does nothing to the layers without a selection', () => {
      const { actions, session } = harness()
      expect(actions.perform('delete')).toBe(false)
      expect(actions.perform('alignLeft')).toBe(false)
      expect(session.canUndo()).toBe(false)
    })

    it('ends the pen path with Enter or Escape', () => {
      const { actions, log } = harness(true)
      expect(actions.perform('deselect')).toBe(true)
      expect(log).toEqual(['pen finish'])
    })

    it('deletes the selected layers as one undo step, letting the selection go', () => {
      const { actions, session, selection, frame } = harness()
      selection.select(['a', 'b'], frame.id)
      expect(actions.perform('delete')).toBe(true)
      expect(session.design().nodes.a).toBeUndefined()
      expect(session.design().nodes.b).toBeUndefined()
      expect(selection.current()).toBeNull()
      session.undo()
      expect(session.design().nodes.a).toBeDefined()
      expect(session.design().nodes.b).toBeDefined()
    })

    it('groups the selected layers and selects the group', () => {
      const { actions, session, selection, frame } = harness()
      selection.select(['a', 'b'], frame.id)
      actions.perform('group')
      const [group] = idsOf(selection.current())
      expect(session.design().nodes[group ?? '']?.type).toBe('group')
      expect(session.design().nodes.a?.parentId).toBe(group)
    })

    it('ungroups a box, what its auto layout placed staying where it is drawn, and selects what it held', () => {
      const { actions, session, selection, frame, at } = harness()
      selection.select(['row'], frame.id)
      expect(actions.perform('ungroup')).toBe(true)
      expect(session.design().nodes.row).toBeUndefined()
      expect(session.design().nodes.inRow?.parentId).toBe('sq')
      expect(at('inRow')).toEqual({ x: 100, y: 500 })
      expect(idsOf(selection.current())).toEqual(['inRow'])
      session.undo()
      expect(session.design().nodes.inRow?.parentId).toBe('row')
    })

    it('leaves a box in a flow whole when the flow would place what it holds elsewhere, saying nothing', () => {
      const { actions, session, selection, frame, log, drawn } = harness(false, FLOW)
      const before = drawn()
      expect(before.inHug).toMatchObject({ x: 490, y: 850, width: 60, height: 60 })
      expect(before.filling).toMatchObject({ x: 200, y: 820, width: 240, height: 120 })
      selection.select(['hugging'], frame.id)
      expect(actions.perform('ungroup')).toBe(true)
      expect(drawn()).toEqual(before)
      expect(session.design().nodes.hugging).toBeDefined()
      expect(log).not.toContain('placedByLayout')
      expect(session.canUndo()).toBe(false)
      expect(idsOf(selection.current())).toEqual(['hugging'])
    })

    it('ungroups a group in a flow when what it held takes its place there, nothing moving', () => {
      const { actions, session, selection, frame, log, drawn } = harness(false, FLOW)
      const before = drawn()
      selection.select(['fixed', 'filling'], frame.id)
      actions.perform('group')
      const [group = ''] = idsOf(selection.current())
      expect(drawn()).toMatchObject(before)
      expect(actions.perform('ungroup')).toBe(true)
      expect(session.design().nodes[group]).toBeUndefined()
      expect(session.design().nodes.filling?.parentId).toBe('flow')
      expect(drawn()).toEqual(before)
      expect(log).not.toContain('placedByLayout')
    })

    it('aligns the selected layers to the left one, as one undo step', () => {
      const { actions, session, selection, frame, at } = harness()
      selection.select(['a', 'b'], frame.id)
      actions.perform('alignLeft')
      expect(at('a')).toEqual({ x: 100, y: 100 })
      expect(at('b')).toEqual({ x: 100, y: 300 })
      actions.perform('alignBottom')
      expect(at('a')).toEqual({ x: 100, y: 300 })
      session.undo()
      expect(at('a')).toEqual({ x: 100, y: 100 })
      session.undo()
      expect(at('b')).toEqual({ x: 250, y: 300 })
    })

    it('aligns one layer to its frame', () => {
      const { actions, selection, frame, at } = harness()
      selection.select(['a'], frame.id)
      actions.perform('alignRight')
      expect(at('a')).toEqual({ x: 980, y: 100 })
    })

    it('spaces the selected layers evenly between the outer ones', () => {
      const { actions, selection, frame, at } = harness()
      selection.select(['a', 'b', 'c'], frame.id)
      actions.perform('distributeHorizontal')
      expect(at('a')).toEqual({ x: 100, y: 100 })
      expect(at('b')).toEqual({ x: 400, y: 300 })
      expect(at('c')).toEqual({ x: 700, y: 120 })
    })

    it('says auto layout places the layers in a flow, and aligns the rest', () => {
      const { actions, selection, frame, at, log } = harness()
      selection.select(['b', 'c', 'inRow'], frame.id)
      actions.perform('alignTop')
      expect(log).toContain('placedByLayout')
      expect(at('b')).toEqual({ x: 250, y: 120 })
      expect(at('c')).toEqual({ x: 700, y: 120 })
      expect(at('inRow')).toEqual({ x: 0, y: 0 })
    })

    describe('across frames', () => {
      it("selects the linked copies of the selection in the page's other frames, after it", () => {
        const { actions, selection, frame, wide } = harness()
        expect(actions.perform('selectLinkedCopies')).toBe(false)
        selection.select(['a', 'b'], frame.id)
        expect(actions.perform('selectLinkedCopies')).toBe(true)
        expect(selection.current()).toEqual([...pairsIn(frame.id, ['a', 'b']), ...pairsIn(wide.id, ['wide-a'])])
        // Again, nothing more to add.
        actions.perform('selectLinkedCopies')
        expect(selection.current()).toEqual([...pairsIn(frame.id, ['a', 'b']), ...pairsIn(wide.id, ['wide-a'])])
      })

      it('nudges every copy by the same amount, each press one undo step', () => {
        const { actions, session, selection, frame, wide, at } = harness()
        selection.selectAcross([...pairsIn(frame.id, ['a']), ...pairsIn(wide.id, ['wide-a'])])
        actions.perform('nudgeRight')
        actions.perform('nudgeDownFar')
        expect(at('a')).toEqual({ x: 101, y: 110 })
        expect(at('wide-a')).toEqual({ x: 101, y: 110 })
        session.undo()
        expect(at('a')).toEqual({ x: 101, y: 100 })
        expect(at('wide-a')).toEqual({ x: 101, y: 100 })
        session.redo()
        expect(at('wide-a')).toEqual({ x: 101, y: 110 })
      })

      it('deletes the selected layers in every frame as one undo step', () => {
        const { actions, session, selection, frame, wide } = harness()
        selection.selectAcross([...pairsIn(frame.id, ['a', 'b']), ...pairsIn(wide.id, ['wide-a'])])
        expect(actions.perform('delete')).toBe(true)
        expect(['a', 'b', 'wide-a'].map((id) => session.design().nodes[id])).toEqual([undefined, undefined, undefined])
        expect(selection.current()).toBeNull()
        session.undo()
        expect(['a', 'b', 'wide-a'].every((id) => session.design().nodes[id])).toBe(true)
      })

      it("groups each frame's selected layers in that frame, as one undo step, selecting every group", () => {
        const { actions, session, selection, frame, wide } = harness()
        selection.selectAcross([...pairsIn(frame.id, ['a', 'b']), ...pairsIn(wide.id, ['wide-a'])])
        actions.perform('group')
        const groups = selection.current() ?? []
        expect(groups.map((layer) => layer.frameId)).toEqual([frame.id, wide.id])
        const nodes = session.design().nodes
        expect(groups.map((layer) => nodes[layer.id]?.type)).toEqual(['group', 'group'])
        expect([nodes.a?.parentId, nodes.b?.parentId, nodes['wide-a']?.parentId]).toEqual([
          groups[0]?.id,
          groups[0]?.id,
          groups[1]?.id,
        ])
        session.undo()
        expect(session.design().nodes['wide-a']?.parentId).toBe(wide.id)
        expect(session.design().nodes.a?.parentId).toBe(frame.id)
      })

      it("lines up each frame's layers in that frame, as one undo step", () => {
        const { actions, session, selection, frame, wide, at } = harness()
        selection.selectAcross([...pairsIn(frame.id, ['a', 'c']), ...pairsIn(wide.id, ['wide-a'])])
        actions.perform('alignRight')
        expect(at('a')).toEqual({ x: 700, y: 100 })
        // One layer lines up with its frame.
        expect(at('wide-a')).toEqual({ x: 1100, y: 100 })
        session.undo()
        expect([at('a'), at('wide-a')]).toEqual([
          { x: 100, y: 100 },
          { x: 100, y: 100 },
        ])
      })

      it('duplicates the selected layers in their own frames, selecting the new ones', () => {
        const { actions, session, selection, frame, wide } = harness()
        selection.selectAcross([...pairsIn(frame.id, ['a']), ...pairsIn(wide.id, ['wide-a'])])
        actions.perform('duplicate')
        const copies = selection.current() ?? []
        expect(copies.map((layer) => layer.frameId)).toEqual([frame.id, wide.id])
        expect(copies.map((layer) => session.design().nodes[layer.id]?.parentId)).toEqual([frame.id, wide.id])
        expect(copies.some((layer) => ['a', 'wide-a'].includes(layer.id))).toBe(false)
      })
    })

    it('nudges by a pixel, or ten with Shift, each press one undo step', () => {
      const { actions, session, selection, frame, at } = harness()
      selection.select(['a'], frame.id)
      actions.perform('nudgeRight')
      actions.perform('nudgeDownFar')
      expect(at('a')).toEqual({ x: 101, y: 110 })
      session.undo()
      expect(at('a')).toEqual({ x: 101, y: 100 })
    })

    it('nudges a layer in a flow along it, which says why it can go no further', () => {
      const { actions, selection, frame, log } = harness()
      selection.select(['inRow'], frame.id)
      actions.perform('nudgeRight')
      expect(log).toContain('flowEnd')
    })

    it("selects every top-level layer that can be picked of the selection's frame, else of the frame last selected in on the page, else of the frame nearest the middle of the view", () => {
      const { actions, selection, frame, wide } = harness()
      actions.perform('selectAll')
      expect(selection.current()).toEqual(pairsIn(wide.id, ['wide-a']))
      selection.select(['a'], frame.id)
      selection.select([], frame.id)
      actions.perform('selectAll')
      expect(selection.current()).toEqual(pairsIn(frame.id, ['a', 'b', 'c', 'row']))
      selection.select(['wide-a'], wide.id)
      actions.perform('selectAll')
      expect(selection.current()).toEqual(pairsIn(wide.id, ['wide-a']))
    })

    it('locks the selected layers, then unlocks them when every one is locked', () => {
      const { actions, session, selection, frame } = harness()
      selection.select(['a'], frame.id)
      actions.perform('lock')
      expect(session.design().nodes.a?.lock).toMatchObject({ move: true, style: true, content: true })
      actions.perform('lock')
      expect(session.design().nodes.a?.lock?.move).toBeFalsy()
    })

    it('hides the selected layers, keeping them selected, their copies in the other frame left as they are; again shows them', () => {
      const { actions, session, selection, frame } = harness()
      const copy = session.design().nodes['wide-a']
      selection.select(['a'], frame.id)
      actions.perform('hide')
      expect(session.design().nodes.a?.props.visible).toBe(false)
      expect(session.design().nodes['wide-a']).toEqual(copy)
      expect(idsOf(selection.current())).toEqual(['a'])
      actions.perform('hide')
      expect(session.design().nodes.a?.props.visible).toBe(true)
    })

    it('lets the picked frame go with Esc, and deletes it with Delete, its layers too and their linked copies left, as one undo step the page hears of', () => {
      const { actions, frameActions, session, selection, frame, log } = harness()
      frameActions.onFrameDelete((name) => log.push(`deleted ${name}`))
      selection.pickFrame(frame.id)
      expect(actions.perform('deselect')).toBe(true)
      expect(selection.pickedFrame()).toBeNull()
      selection.pickFrame(frame.id)
      expect(actions.perform('delete')).toBe(true)
      expect(session.design().frames[frame.id]).toBeUndefined()
      expect(session.design().nodes.a).toBeUndefined()
      expect(session.design().nodes['wide-a']).toBeDefined()
      expect(selection.pickedFrame()).toBeNull()
      expect(log).toEqual(['overlay', 'deleted Square', 'overlay'])
      session.undo()
      expect(session.design().frames[frame.id]).toBeDefined()
      expect(session.design().nodes.a).toBeDefined()
      expect(session.canUndo()).toBe(false)
    })

    it('duplicates the picked frame with its layers as linked copies, picking the copy and showing it, as one undo step', () => {
      const { actions, session, selection, frame, log } = harness()
      selection.pickFrame(frame.id)
      expect(actions.perform('duplicate')).toBe(true)
      const copy = selection.pickedFrame() ?? ''
      expect(copy).not.toBe(frame.id)
      const made = session.design().frames[copy]
      expect(made).toMatchObject({ name: 'Square', width: 1080, height: 1080 })
      expect(log).toEqual([
        `showArea ${JSON.stringify({ x: made?.x, y: made?.y, width: 1080, height: 1080 })}`,
        'overlay',
      ])
      const links = Object.values(session.design().nodes)
        .filter((node) => node.parentId === copy)
        .map((node) => node.link)
      expect(links.sort()).toEqual(['a', 'b', 'c', 'pin', 'row'])
      session.undo()
      expect(session.design().frames[copy]).toBeUndefined()
      expect(session.canUndo()).toBe(false)
    })

    it('moves the picked frame by a pixel, or ten with Shift, each press one undo step', () => {
      const { actions, session, selection, wide } = harness()
      selection.pickFrame(wide.id)
      actions.perform('nudgeRight')
      actions.perform('nudgeDownFar')
      actions.perform('nudgeLeftFar')
      actions.perform('nudgeUp')
      expect(session.design().frames[wide.id]).toMatchObject({ x: 1271, y: 9 })
      expect(session.design().nodes['wide-a']?.props).toMatchObject({ x: 100, y: 100 })
      session.undo()
      expect(session.design().frames[wide.id]).toMatchObject({ x: 1271, y: 10 })
    })

    it("leaves the picked frame and its layers be under the layers' other keys", () => {
      const { actions, session, selection, frame } = harness()
      selection.pickFrame(frame.id)
      for (const action of ['group', 'alignLeft', 'lock', 'hide', 'mask', 'bringToFront'] as const)
        expect(actions.perform(action)).toBe(false)
      expect(session.canUndo()).toBe(false)
      expect(selection.pickedFrame()).toBe(frame.id)
    })

    it('selects every layer that can be picked of the picked frame', () => {
      const { actions, selection, frame } = harness()
      selection.pickFrame(frame.id)
      actions.perform('selectAll')
      expect(selection.current()).toEqual(pairsIn(frame.id, ['a', 'b', 'c', 'row']))
      expect(selection.pickedFrame()).toBeNull()
    })

    it('draws the overlay after a change to the layers', () => {
      const { actions, selection, frame, log } = harness()
      selection.select(['a'], frame.id)
      actions.perform('nudgeLeft')
      expect(log).toEqual(['overlay'])
    })
  })

  describe('ungroupState', () => {
    it('is ready for a box or a group whose layers stay where they are drawn once it comes apart', () => {
      const { actions, selection, frame } = harness(false, FLOW)
      selection.select(['row'], frame.id)
      expect(actions.ungroupState()).toBe('ready')
      selection.select(['fixed', 'filling'], frame.id)
      actions.perform('group')
      expect(actions.ungroupState()).toBe('ready')
    })

    it('says auto layout places what a box in a flow holds elsewhere, and nothing changes', () => {
      const { actions, session, selection, frame, drawn } = harness(false, FLOW)
      const before = drawn()
      selection.select(['hugging'], frame.id)
      expect(actions.ungroupState()).toBe('placedByLayout')
      expect(drawn()).toEqual(before)
      expect(session.canUndo()).toBe(false)
    })

    it('is ready while one of the selected boxes comes apart, and none with no group or box selected', () => {
      const { actions, selection, frame } = harness(false, FLOW)
      selection.select(['hugging', 'row'], frame.id)
      expect(actions.ungroupState()).toBe('ready')
      selection.select(['a'], frame.id)
      expect(actions.ungroupState()).toBe('none')
      selection.select([], frame.id)
      expect(actions.ungroupState()).toBe('none')
    })

    it('says a group or box locked against deleting is locked, in a flow or not, and its key does nothing', () => {
      const { actions, session, selection, frame, log } = harness(false, FLOW)
      selection.select(['fixed', 'filling'], frame.id)
      actions.perform('group')
      const [group = ''] = idsOf(selection.current())
      session.run('node.lock', { ids: [group, 'row'], lock: { delete: true } })
      for (const id of [group, 'row']) {
        selection.select([id], frame.id)
        expect(actions.ungroupState()).toBe('locked')
        expect(actions.perform('ungroup')).toBe(true)
        expect(session.design().nodes[id]).toBeDefined()
      }
      expect(log).not.toContain('placedByLayout')
    })

    it('takes the unlocked one apart from a selection with a locked one, saying nothing', () => {
      const { actions, session, selection, frame, log } = harness(false, FLOW)
      selection.select(['fixed', 'filling'], frame.id)
      actions.perform('group')
      const [group = ''] = idsOf(selection.current())
      session.run('node.lock', { ids: ['row'], lock: { delete: true } })
      selection.select([group, 'row'], frame.id)
      expect(actions.ungroupState()).toBe('ready')
      actions.perform('ungroup')
      expect(session.design().nodes[group]).toBeUndefined()
      expect(session.design().nodes.row).toBeDefined()
      expect(log).not.toContain('placedByLayout')
    })
  })

  describe('fitSelection', () => {
    it("fits the box around the selection, else the picked frame, else the shown page's frames", () => {
      const { actions, selection, frame, wide, log } = harness()
      actions.fitSelection()
      selection.select(['a', 'b'], frame.id)
      actions.fitSelection()
      selection.pickFrame(wide.id)
      actions.fitSelection()
      expect(log).toEqual([
        'fitAll',
        `fitArea ${JSON.stringify({ x: frame.x + 100, y: frame.y + 100, width: 250, height: 300 })}`,
        `fitArea ${JSON.stringify({ x: 1280, y: 0, width: 1200, height: 628 })}`,
      ])
    })
  })
})
