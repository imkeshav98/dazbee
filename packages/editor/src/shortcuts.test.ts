import { describe, expect, it } from 'vitest'

import { pressFor, shortcutFor, SHORTCUTS } from './shortcuts.ts'

const key = (
  key: string,
  code: string,
  mods: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {},
) => ({
  key,
  code,
  ctrlKey: Boolean(mods.ctrl),
  metaKey: Boolean(mods.meta),
  shiftKey: Boolean(mods.shift),
  altKey: Boolean(mods.alt),
})

describe('shortcuts', () => {
  it('match letters by the character typed and other keys by their code, with exact modifiers', () => {
    expect(shortcutFor(key('d', 'KeyD', { ctrl: true }))).toBe('duplicate')
    expect(shortcutFor(key('d', 'KeyD', { meta: true }))).toBe('duplicate')
    expect(shortcutFor(key('d', 'KeyD'))).toBeNull()
    expect(shortcutFor(key('}', 'BracketRight', { ctrl: true, shift: true }))).toBe('bringToFront')
    expect(shortcutFor(key(']', 'BracketRight', { ctrl: true }))).toBe('bringForward')
    expect(shortcutFor(key('!', 'Digit1', { shift: true }))).toBe('zoomToFit')
    expect(shortcutFor(key('ArrowLeft', 'ArrowLeft', { shift: true }))).toBe('nudgeLeftFar')
    expect(shortcutFor(key('Z', 'KeyZ', { ctrl: true, shift: true }))).toBe('redo')
    // With Alt a Mac types another character; the key's place still names it.
    expect(shortcutFor(key('å', 'KeyA', { alt: true }))).toBe('alignLeft')
    expect(shortcutFor(key('H', 'KeyH', { alt: true, shift: true }))).toBe('distributeHorizontal')
    expect(shortcutFor(key('R', 'KeyR', { shift: true }))).toBe('toggleRulers')
  })

  it('give the style and linked-copy actions Ctrl+Alt, with Shift for the ones that reach the linked copies', () => {
    expect(shortcutFor(key('c', 'KeyC', { ctrl: true, alt: true }))).toBe('copyStyle')
    expect(shortcutFor(key('v', 'KeyV', { ctrl: true, alt: true }))).toBe('pasteStyle')
    expect(shortcutFor(key('C', 'KeyC', { ctrl: true, alt: true, shift: true }))).toBe('styleToLinked')
    expect(shortcutFor(key('T', 'KeyT', { ctrl: true, alt: true, shift: true }))).toBe('textToLinked')
    expect(shortcutFor(key('L', 'KeyL', { ctrl: true, alt: true, shift: true }))).toBe('lockLinked')
    expect(shortcutFor(key('H', 'KeyH', { ctrl: true, alt: true, shift: true }))).toBe('hideLinked')
    // ⌘⌥C on a Mac types ç; the key's place still names it.
    expect(shortcutFor(key('ç', 'KeyC', { meta: true, alt: true }))).toBe('copyStyle')
    expect(shortcutFor(key('l', 'KeyL', { ctrl: true, shift: true }))).toBe('lock')
    expect(pressFor('hideLinked')).toBe('Control+Alt+Shift+KeyH')
    // Copy to other frames ▸ Layer and Delete from all frames are menu items with no key.
    const keysOf = (action: string) => SHORTCUTS.find((s) => s.action === action)?.keys
    expect(keysOf('layerToLinked')).toEqual([])
    expect(keysOf('deleteLinked')).toEqual([])
  })

  it('give each key one action', () => {
    const specs = SHORTCUTS.flatMap((s) => s.keys)
    expect(new Set(specs).size).toBe(specs.length)
  })

  it('spell keys the way Playwright presses them', () => {
    expect(pressFor('bringToFront')).toBe('Control+Shift+BracketRight')
    expect(pressFor('lock', 'Meta')).toBe('Meta+Shift+KeyL')
    expect(pressFor('nudgeUpFar')).toBe('Shift+ArrowUp')
  })
})
