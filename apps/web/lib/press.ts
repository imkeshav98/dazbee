// What a finger or pen holds pressed. Once a press has stayed put for a moment, the element under it
// takes `data-pressed` until the press lifts, or turns into a scroll, which cancels it; a quick tap
// takes it for a moment as it lifts; a press that slides away at once is a scroll and takes nothing.
// The `active:` variant (app/globals.css) reads this mark beside :active, because a held touch can't
// be counted on to match :active:
// - In headless Chromium, a touch held through the DevTools protocol (Input.dispatchTouchEvent, or a
//   3-second Input.synthesizeTapGesture) never matched :active while held, even on a bare button with
//   only an :active rule; it matched only after the finger lifted. The glass controls check
//   (tests/e2e/specs/app/glass-controls.spec.ts) holds a finger the same way, and saw no pressed tint
//   on Add page or a page's row until this mark was added.
// - Safari on iOS triggers :active only "when there is a touch event set on the HTML element"
//   (Apple's Safari Web Content Guide, "Adjusting the Text Size", on highlighting elements:
//   https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/AdjustingtheTextSize/AdjustingtheTextSize.html).
// A mouse press is left to :active, and a disabled control is never pressed.

/** A finger or pen press: what it went down on, where, and its mark's timer. */
interface Press {
  target: Element
  x: number
  y: number
  timer: number
  marked: boolean
}

/** The mark on what a finger or pen holds. */
const PRESSED = 'data-pressed'
/** How long a press stays put before it is marked, and how long a quick tap's mark lasts, in ms. */
const HOLD = 100
/** How far, in CSS pixels, a press may move before it counts as a scroll. */
const SLOP = 8

/** Marks what each finger or pen press holds, for as long as it is held; gives the function that stops. */
export function markPresses(): () => void {
  // Each press held, by pointer: two fingers may hold one control.
  const presses = new Map<number, Press>()

  const mark = (press: Press) => {
    press.marked = true
    press.target.setAttribute(PRESSED, '')
  }
  const unmark = (target: Element) => {
    if (![...presses.values()].some((press) => press.target === target && press.marked)) target.removeAttribute(PRESSED)
  }
  const forget = (pointerId: number) => {
    const press = presses.get(pointerId)
    if (!press) return null
    window.clearTimeout(press.timer)
    presses.delete(pointerId)
    return press
  }

  const down = (event: PointerEvent) => {
    const target = event.target
    if (event.pointerType === 'mouse' || !(target instanceof Element) || target.closest(':disabled')) return
    forget(event.pointerId)
    const press: Press = { target, x: event.clientX, y: event.clientY, timer: 0, marked: false }
    press.timer = window.setTimeout(() => mark(press), HOLD)
    presses.set(event.pointerId, press)
  }
  const move = (event: PointerEvent) => {
    const press = presses.get(event.pointerId)
    if (!press || press.marked) return
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP) forget(event.pointerId)
  }
  const up = (event: PointerEvent) => {
    const press = forget(event.pointerId)
    if (!press) return
    if (press.marked) return unmark(press.target)
    // A quick tap: marked for a moment as it lifts, so it shows it was pressed.
    press.target.setAttribute(PRESSED, '')
    window.setTimeout(() => unmark(press.target), HOLD)
  }
  const cancel = (event: PointerEvent) => {
    const press = forget(event.pointerId)
    if (press?.marked) unmark(press.target)
  }

  // In the capture phase, so a control that stops a pointer event still takes and loses the mark.
  document.addEventListener('pointerdown', down, true)
  document.addEventListener('pointermove', move, true)
  document.addEventListener('pointerup', up, true)
  document.addEventListener('pointercancel', cancel, true)
  return () => {
    document.removeEventListener('pointerdown', down, true)
    document.removeEventListener('pointermove', move, true)
    document.removeEventListener('pointerup', up, true)
    document.removeEventListener('pointercancel', cancel, true)
    for (const press of presses.values()) {
      window.clearTimeout(press.timer)
      press.target.removeAttribute(PRESSED)
    }
    presses.clear()
  }
}
