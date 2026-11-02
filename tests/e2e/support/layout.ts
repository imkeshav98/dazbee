// What a person would see wrong with a page's layout at a screen size: pieces of the page drawn over
// each other, controls drawn over each other, anything reaching past the window or cut short by
// what holds it, and words cut short by their box.
import type { Page } from '@playwright/test'

/** A box on screen, in CSS pixels from the window's top left corner. */
export interface Rect { x: number; y: number; width: number; height: number }

/**
 * The layout problems on the page now, one line each; an empty list when there are none.
 *
 * `pieces` are the parts of the page that must not cover each other, each a CSS selector (every
 * element it matches that shows, none when it matches none) or a box on screen. Every control that
 * shows is also checked against every other control that is not inside it. Pieces and controls must
 * lie inside the window, top to bottom as well unless the page `scrolls`. A control must not be cut
 * by an ancestor that clips without scrolling, and words must not be cut short by a box that clips
 * them, except inside the elements `uncut` matches, a CSS selector these two checks leave out.
 */
export function layoutProblems(page: Page, { pieces = {}, scrolls = false, uncut = null }: { pieces?: Record<string, string | Rect>; scrolls?: boolean; uncut?: string | null } = {}) {
  return page.evaluate(({ pieces, scrolls, uncut }) => {
    interface Box { left: number; top: number; right: number; bottom: number }
    const problems: string[] = []
    const width = document.documentElement.clientWidth
    const height = window.innerHeight
    const boxOf = (r: { x: number; y: number; width: number; height: number }): Box => ({ left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height })
    const area = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    const at = (b: Box) => `${Math.round(b.left)},${Math.round(b.top)}–${Math.round(b.right)},${Math.round(b.bottom)}`
    const outside = (b: Box) => b.left < -1 || b.right > width + 1 || (!scrolls && (b.top < -1 || b.bottom > height + 1))
    const shows = (el: Element) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    const leftOut = (el: Element) => uncut !== null && el.closest(uncut) !== null
    const nameOf = (el: Element) => el.getAttribute('data-testid') || el.getAttribute('aria-label') || (el.textContent ?? '').trim().slice(0, 40) || el.tagName.toLowerCase()

    // The pieces: each inside the window, none over another.
    const placed: { name: string; box: Box }[] = []
    for (const [name, piece] of Object.entries(pieces)) {
      if (typeof piece !== 'string') {
        placed.push({ name, box: boxOf(piece) })
        continue
      }
      const found = [...document.querySelectorAll(piece)].filter(shows)
      found.forEach((el, i) => placed.push({ name: found.length > 1 ? `${name} ${i + 1}` : name, box: boxOf(el.getBoundingClientRect()) }))
    }
    for (const [i, a] of placed.entries()) {
      if (outside(a.box)) problems.push(`${a.name} (${at(a.box)}) reaches past the window (${width} × ${height})`)
      for (const b of placed.slice(i + 1)) {
        if (area(a.box, b.box) > 1) problems.push(`${a.name} (${at(a.box)}) and ${b.name} (${at(b.box)}) overlap`)
      }
    }

    // The controls: the part of each that shows, after what scrolls it; each whole and inside the
    // window, none over another.
    const CONTROLS = 'button, a[href], summary, input:not([type="hidden"]), textarea, select, [role="radio"], [role="tab"], [role="combobox"], [role="slider"], [role="menuitem"], [role="option"]'
    const controls: { el: Element; name: string; box: Box }[] = []
    for (const el of document.querySelectorAll(CONTROLS)) {
      if (!shows(el)) continue
      const whole = boxOf(el.getBoundingClientRect())
      // Smaller than this is only for screen readers, as a visually hidden file input is.
      if (whole.right - whole.left < 4 || whole.bottom - whole.top < 4) continue
      const box = { ...whole }
      let cut: string | null = null
      let hidden = false
      for (let up = el.parentElement; up && up !== document.body && up !== document.documentElement; up = up.parentElement) {
        const style = getComputedStyle(up)
        const holder = boxOf(up.getBoundingClientRect())
        for (const axis of ['x', 'y'] as const) {
          const overflow = axis === 'x' ? style.overflowX : style.overflowY
          if (overflow === 'visible') continue
          const [start, end] = axis === 'x' ? (['left', 'right'] as const) : (['top', 'bottom'] as const)
          if (overflow === 'auto' || overflow === 'scroll') {
            // Scrolled out of view: a person scrolls to it.
            box[start] = Math.max(box[start], holder[start])
            box[end] = Math.min(box[end], holder[end])
          } else if (box[end] <= holder[start] || box[start] >= holder[end]) {
            // Wholly outside what clips it: not shown at all.
            hidden = true
          } else if (!cut && (box[start] < holder[start] - 1 || box[end] > holder[end] + 1)) {
            cut = nameOf(up)
          }
        }
      }
      if (hidden || box.right - box.left < 1 || box.bottom - box.top < 1) continue
      const name = nameOf(el)
      if (cut && !leftOut(el)) problems.push(`${name} (${at(whole)}) is cut off by ${cut}`)
      else if (outside(box)) problems.push(`${name} (${at(box)}) reaches past the window (${width} × ${height})`)
      controls.push({ el, name, box })
    }
    for (const [i, a] of controls.entries()) {
      for (const b of controls.slice(i + 1)) {
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue
        if (area(a.box, b.box) > 4) problems.push(`${a.name} (${at(a.box)}) and ${b.name} (${at(b.box)}) overlap`)
      }
    }

    // Words cut short: an element that clips its own text, with the words reaching past its sides.
    const range = document.createRange()
    for (const el of document.body.querySelectorAll('*')) {
      if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SCRIPT', 'STYLE'].includes(el.tagName) || !(el instanceof HTMLElement)) continue
      if (el.clientWidth < 4 || leftOut(el) || getComputedStyle(el).overflowX === 'visible' || !shows(el)) continue
      const room = el.getBoundingClientRect().left + el.clientLeft
      for (const node of el.childNodes) {
        const words = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '').trim() : ''
        if (!words) continue
        range.selectNodeContents(node)
        const text = range.getBoundingClientRect()
        if (text.left < room - 1 || text.right > room + el.clientWidth + 1) problems.push(`“${words.slice(0, 40)}” is cut short (${Math.round(text.width)} px of words in ${el.clientWidth} px)`)
      }
    }
    return problems
  }, { pieces, scrolls, uncut })
}
