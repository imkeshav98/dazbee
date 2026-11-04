import { describe, expect, it } from 'vitest'

import { editorTools, type PlacedAsset, type Tool } from './tools.ts'

const ASSET: PlacedAsset = { id: 'a1', name: 'Photo', width: 40, height: 30 }

/** Tools whose dependencies log what they are told, in order. */
function logged() {
  const log: string[] = []
  const tools = editorTools({
    finish: () => log.push(`finish ${tools.tool()}`),
    changed: () => log.push(`changed ${tools.tool()} ${tools.imageToPlace()?.id ?? '-'}`),
    onSnapping: () => log.push(`snapping ${tools.snapping()}`),
  })
  tools.onTool((tool: Tool) => log.push(`tool ${tool}`))
  return { tools, log }
}

describe('editorTools', () => {
  it('starts on select, snapping, with no image to place', () => {
    const { tools } = logged()
    expect(tools.tool()).toBe('select')
    expect(tools.snapping()).toBe(true)
    expect(tools.imageToPlace()).toBeNull()
  })

  it('finishes what the tool had open, then switches, shows it, and tells the listeners', () => {
    const { tools, log } = logged()
    tools.setTool('pen')
    expect(log).toEqual(['finish select', 'changed pen -', 'tool pen'])
  })

  it('does nothing for the tool already in use', () => {
    const { tools, log } = logged()
    tools.setTool('select')
    expect(log).toEqual([])
  })

  it('picks the image to place with the image tool, and forgets it with another tool', () => {
    const { tools, log } = logged()
    tools.setTool('image', ASSET)
    expect(tools.tool()).toBe('image')
    expect(tools.imageToPlace()).toBe(ASSET)
    expect(log).toEqual(['finish select', 'changed image -', 'tool image', 'changed image a1'])
    tools.setTool('image')
    expect(tools.imageToPlace()).toBe(ASSET)
    tools.setTool('rect')
    expect(tools.imageToPlace()).toBeNull()
  })

  it('forgets the image to place with null, keeping the tool', () => {
    const { tools, log } = logged()
    tools.setTool('image', ASSET)
    log.length = 0
    tools.setTool('image', null)
    expect(tools.tool()).toBe('image')
    expect(tools.imageToPlace()).toBeNull()
    expect(log).toEqual(['changed image -'])
  })

  it('lets a tool switched to while finishing stand until the switch asked for', () => {
    const log: string[] = []
    let penPath = false
    const tools = editorTools({
      // As the pen does: finishing its path goes back to the select tool.
      finish: () => {
        if (!penPath) return
        penPath = false
        tools.setTool('select')
      },
      changed: () => {},
      onSnapping: () => {},
    })
    tools.onTool((tool) => log.push(tool))
    tools.setTool('pen')
    penPath = true
    tools.setTool('hand')
    expect(log).toEqual(['pen', 'select', 'hand'])
    expect(tools.tool()).toBe('hand')
  })

  it('says when snapping turns on or off, not when it stays', () => {
    const { tools, log } = logged()
    tools.setSnapping(true)
    tools.setSnapping(false)
    tools.setSnapping(false)
    tools.setSnapping(true)
    expect(log).toEqual(['snapping false', 'snapping true'])
  })

  it('stops calling back once a listener lets go, and after destroy', () => {
    const { tools, log } = logged()
    const heard: Tool[] = []
    const stop = tools.onTool((tool) => heard.push(tool))
    tools.setTool('hand')
    expect(stop()).toBe(true)
    tools.setTool('text')
    expect(heard).toEqual(['hand'])
    tools.destroy()
    log.length = 0
    tools.setTool('select')
    expect(log.filter((line) => line.startsWith('tool'))).toEqual([])
  })
})
