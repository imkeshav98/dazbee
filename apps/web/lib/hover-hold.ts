// Holds back the hover tint of the rows inside an element until a pointer that hovers moves in it:
// rows that show up under a pointer at rest, as a row's short menu does when it opens in its menu's
// place on a phone, aren't lit as if the pointer had moved onto them, and a finger, which never
// hovers, lights none. The `hovered:` variant (app/globals.css) reads the mark this sets.

/** The mark on what holds rows whose hover tint waits for the pointer to move. */
const HELD = 'data-hover-held'

/** Holds back the hover tint inside `el` until a mouse or pen moves in it. */
export function holdHover(el: HTMLElement | null) {
  if (!el || el.hasAttribute(HELD)) return
  el.setAttribute(HELD, '')
  const moved = (event: PointerEvent) => {
    // A finger doesn't hover, and a move the browser makes up as what lies under a resting pointer
    // changes doesn't move it.
    if (event.pointerType === 'touch' || (event.movementX === 0 && event.movementY === 0)) return
    el.removeAttribute(HELD)
    el.removeEventListener('pointermove', moved)
  }
  el.addEventListener('pointermove', moved)
}
