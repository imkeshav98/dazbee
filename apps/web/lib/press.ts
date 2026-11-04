// What a finger or pen holds pressed: the element under the press takes `data-pressed` until the
// press lifts, or turns into a scroll, which cancels it. Phones don't reliably match :active while a
// touch is held, so the `active:` variant (app/globals.css) reads this mark too. A mouse press is
// left to :active, and a disabled control is never pressed.

/** The mark on what a finger or pen holds. */
const PRESSED = 'data-pressed'

/** Marks what each finger or pen press holds, for as long as it is held; gives the function that stops. */
export function markPresses(root: Document = document): () => void {
  // What each press holds, by pointer: two fingers may hold one control.
  const held = new Map<number, Element>()

  const press = (event: PointerEvent) => {
    const target = event.target
    if (event.pointerType === 'mouse' || !(target instanceof Element) || target.closest(':disabled')) return
    held.set(event.pointerId, target)
    target.setAttribute(PRESSED, '')
  }
  const lift = (event: PointerEvent) => {
    const target = held.get(event.pointerId)
    if (!target) return
    held.delete(event.pointerId)
    if (![...held.values()].includes(target)) target.removeAttribute(PRESSED)
  }

  // In the capture phase, so a control that stops a pointer event still takes and loses the mark.
  root.addEventListener('pointerdown', press, true)
  root.addEventListener('pointerup', lift, true)
  root.addEventListener('pointercancel', lift, true)
  return () => {
    root.removeEventListener('pointerdown', press, true)
    root.removeEventListener('pointerup', lift, true)
    root.removeEventListener('pointercancel', lift, true)
    for (const target of held.values()) target.removeAttribute(PRESSED)
    held.clear()
  }
}
