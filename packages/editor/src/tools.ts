// The tool a drag on the stage uses, the image the image tool places, and snapping.
import type { ShapeMenuTool } from './gestures/drawing/draw-tools.ts'

/**
 * What a drag on the stage does: select and move, pan with the hand, draw a shape (#44), a path
 * (#45), a text box (#47), a box or a frame, or place the image picked for the image tool.
 */
export type Tool = 'select' | 'hand' | 'pen' | 'text' | 'frame' | 'image' | ShapeMenuTool
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
  /** Shows that the tool or the image to place changed, before the tool listeners hear of it: the cursor. */
  changed: () => void
  /** Told when snapping turns on or off. */
  onSnapping: () => void
}

export interface EditorTools {
  tool(): Tool
  /**
   * Switches to a tool; the image tool keeps its image, any other forgets it. With `image`, that
   * is then the image the image tool places, or null to forget it.
   */
  setTool(next: Tool, image?: PlacedAsset | null): void
  /** The image the image tool places with its next click or drag, or null. */
  imageToPlace(): PlacedAsset | null
  /** Whether a drag snaps to layers and the frame. */
  snapping(): boolean
  setSnapping(on: boolean): void
  /** Calls back with the tool whenever it changes, by a key or after drawing a shape. */
  onTool(listener: (tool: Tool) => void): () => boolean
  destroy(): void
}

export function editorTools({ finish, changed, onSnapping }: ToolsDeps): EditorTools {
  /** What a drag on the stage does now. */
  let tool: Tool = 'select'
  /** The image the image tool places with the next click or drag; picked after the tool is. */
  let imageToPlace: PlacedAsset | null = null
  /** Snapping to layers and the frame while dragging; Ctrl (⌘) still turns it off for a drag. */
  let snapping = true
  /** Told when the tool changes, by a key or after drawing a shape, so the tool dock follows. */
  const toolListeners = new Set<(tool: Tool) => void>()

  function current() {
    return tool
  }
  function toPlace() {
    return imageToPlace
  }
  function snaps() {
    return snapping
  }

  function setTool(next: Tool, image?: PlacedAsset | null) {
    if (next !== tool) {
      finish()
      if (next !== 'image') imageToPlace = null
      tool = next
      changed()
      for (const listener of toolListeners) listener(tool)
    }
    if (image === undefined) return
    imageToPlace = image
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

  function destroy() {
    toolListeners.clear()
  }

  return {
    tool: current,
    setTool,
    imageToPlace: toPlace,
    snapping: snaps,
    setSnapping,
    onTool,
    destroy,
  }
}
