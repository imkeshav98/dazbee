// The stage's cursors over the selection's handles: resize ones along the handle as the box is
// turned, and the rotate one outside a corner.
/** The cursor outside a corner, where a press turns the selection. */
export const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M6 15a7 7 0 1 1 3 4.7" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M6 15a7 7 0 1 1 3 4.7" fill="none" stroke="black" stroke-width="1.75" stroke-linecap="round"/><path d="M3 12l3 3.5 3.5-3" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12l3 3.5 3.5-3" fill="none" stroke="black" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>')}") 12 12, crosshair`
/** Resize cursors point along the handle's direction as the box is turned. */
const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize']
const HANDLE_ANGLE = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 }

/** The resize cursor over a handle of a box turned by `rotation` degrees: the one nearest the handle's direction. */
export function resizeCursor(handle: keyof typeof HANDLE_ANGLE, rotation: number): string {
  return RESIZE_CURSORS[Math.round(((((HANDLE_ANGLE[handle] + rotation) % 180) + 180) % 180) / 45) % 4] ?? ''
}
