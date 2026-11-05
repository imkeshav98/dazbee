import { describe, expect, it } from 'vitest'

import type { Editor } from '@dazbee/editor'

import { renameFrame } from './rename-frame.ts'

/** An editor with one frame, Sale, that logs each command it is asked to run. */
function fakeEditor() {
  const ran: unknown[] = []
  const editor = {
    design: () => ({ frames: { sale: { name: 'Sale' } } }),
    session: { run: (name: string, input: unknown) => ran.push([name, input]) },
  } as unknown as Editor
  return { editor, ran }
}

describe('renameFrame', () => {
  it('names the frame what was typed, trimmed, in one command', () => {
    const { editor, ran } = fakeEditor()
    renameFrame(editor, 'sale', '  Weekend sale ')
    expect(ran).toEqual([['frame.update', { frameId: 'sale', name: 'Weekend sale' }]])
  })

  it('keeps the name for an empty name, the same name, a cancelled field or a frame that is gone', () => {
    const { editor, ran } = fakeEditor()
    renameFrame(editor, 'sale', '   ')
    renameFrame(editor, 'sale', 'Sale')
    renameFrame(editor, 'sale', null)
    renameFrame(editor, 'gone', 'Weekend sale')
    expect(ran).toEqual([])
  })
})
