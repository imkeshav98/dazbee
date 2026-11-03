// The tool a drag on the stage uses, the image the image tool places, and snapping.
import type { ShapeTool } from './gestures/draw-tools.ts'

/**
 * What a drag on the stage does: select and move, pan with the hand, draw a shape (#44), a path
 * (#45), a text box (#47) or a frame, or place the image picked for the image tool.
 */
export type Tool = 'select' | 'hand' | 'pen' | 'text' | 'frame' | 'image' | ShapeTool
/** An image asset as the editor places it. */
export interface PlacedAsset {
  id: string
  name: string
  width: number
  height: number
}

export interface ToolsDeps {
  /** Ends what the tool in use has open, before another tool takes over: the pen's path. */
  finish: () => void
  /** Shows the tool or the image to place changed, before the tool listeners hear of it: the cursor. */
  changed: () => void
  /** Told when snapping turns on or off. */
  onSnapping: () => void
}

export interface EditorTools {
  tool(): Tool
  /** Switches to a tool; the image tool keeps its image, any other forgets it. */
  setTool(next: Tool): void
  /** Picks the image the image tool places with its next click or drag, and switches to that tool; null forgets it. */
  armImage(asset: PlacedAsset | null): void
  /** The image the image tool places with the next click or drag, or null. */
  imageToPlace(): PlacedAsset | null
  /** Whether a drag snaps to layers and the frame. */
  snapping(): boolean
  setSnapping(on: boolean): void
  /** Calls back with the tool whenever it changes, by a key or after drawing a shape. */
  onTool(listener: (tool: Tool) => void): () => boolean
  destroy(): void
}

export function editorTools({ finish, changed, onSnapping }: ToolsDeps): EditorTools {
  let tool: Tool = 'select'
  /** Snapping to layers and the frame while dragging; Ctrl (⌘) still turns it off for a drag. */
  let snapping = true
  /** Told when the tool changes, by a key or after drawing a shape, so the tool dock follows. */
  const toolListeners = new Set<(tool: Tool) => void>()
  /** The image the image tool places with the next click or drag; picked after the tool is. */
  let imageToPlace: PlacedAsset | null = null

  function setTool(next: Tool) {
    if (next === tool) return
    finish()
    if (next !== 'image') imageToPlace = null
    tool = next
    changed()
    for (const listener of toolListeners) listener(tool)
  }
  function armImage(asset: PlacedAsset | null) {
    if (asset) setTool('image')
    imageToPlace = asset
    changed()
  }
  function setSnapping(on: boolean) {
    if (on === snapping) return
    snapping = on
    onSnapping()
  }

  function onTool(listener: (tool: Tool) => void) {
    toolListeners.add(listener)
    return () => toolListeners.delete(listener)
  }

  return {
    tool: () => tool,
    setTool,
    armImage,
    imageToPlace: () => imageToPlace,
    snapping: () => snapping,
    setSnapping,
    onTool,
    destroy: () => toolListeners.clear(),
  }
}
