// An element's style as SVG works it out: what it inherits from its parent, then its presentation
// attributes, then the matching rules of the file's <style> sheets, then its style attribute.
// Selectors are the simple ones logo files use: a tag, .class, #id, *, those joined (`path.a`),
// and comma lists. Anything else in a sheet (@media, combinators, pseudo-classes) is left out.

import type { XmlElement } from './xml.ts'

export type Style = Record<string, string>

/** Properties a child takes from its parent unless it sets its own. */
const INHERITED = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'visibility', 'color', 'clip-rule',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'letter-spacing',
])

/** Every property this package reads; other attributes aren't style. */
const PROPERTIES = new Set([
  ...INHERITED, 'opacity', 'display', 'stop-color', 'stop-opacity', 'clip-path', 'mask', 'filter', 'mix-blend-mode',
])

interface Rule {
  tag?: string | undefined
  id?: string | undefined
  classes: string[]
  specificity: number
  order: number
  declarations: Style
}

/** The declarations in a style attribute or a rule's braces. */
export function parseDeclarations(text: string): Style {
  const out: Style = {}
  for (const part of text.split(';')) {
    const colon = part.indexOf(':')
    if (colon < 0) continue
    const name = part.slice(0, colon).trim().toLowerCase()
    const value = part.slice(colon + 1).replace(/!important/i, '').trim()
    if (name && value) out[name] = value
  }
  return out
}

function parseSelector(text: string) {
  const match = /^(\*|[a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/.exec(text.trim())
  if (!match) return null
  const tag = match[1] && match[1] !== '*' ? match[1] : undefined
  const parts = match[2]?.match(/[.#][\w-]+/g) ?? []
  const ids = parts.filter((p) => p.startsWith('#')).map((p) => p.slice(1))
  if (ids.length > 1) return null
  const classes = parts.filter((p) => p.startsWith('.')).map((p) => p.slice(1))
  return { tag, id: ids[0], classes, specificity: (ids.length ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0) }
}

/** The rules of every <style> sheet in the file, in the order they apply. */
export function readSheets(root: XmlElement, textOf: (e: XmlElement) => string): Rule[] {
  const rules: Rule[] = []
  const visit = (element: XmlElement) => {
    if (element.name === 'style') {
      const css = textOf(element).replace(/\/\*[\s\S]*?\*\//g, '')
      // At-rules and what they hold are dropped, braces and all.
      const flat = css.replace(/@[^{;]*(\{(?:[^{}]|\{[^{}]*\})*\}|;)/g, '')
      for (const [, selectors, body] of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const declarations = parseDeclarations(body ?? '')
        for (const text of (selectors ?? '').split(',')) {
          const selector = parseSelector(text)
          if (selector) rules.push({ ...selector, order: rules.length, declarations })
        }
      }
    }
    for (const child of element.children) if (typeof child !== 'string') visit(child)
  }
  visit(root)
  return rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order)
}

const matches = (rule: Rule, element: XmlElement) => {
  if (rule.tag && rule.tag !== element.name) return false
  if (rule.id && rule.id !== element.attrs.id) return false
  if (rule.classes.length === 0) return true
  const own = new Set((element.attrs.class ?? '').split(/\s+/))
  return rule.classes.every((c) => own.has(c))
}

/** The element's style, given its parent's. */
export function styleOf(element: XmlElement, parent: Style, rules: readonly Rule[]): Style {
  const style: Style = {}
  for (const [name, value] of Object.entries(parent)) if (INHERITED.has(name)) style[name] = value
  const set = (declarations: Style) => {
    for (const [name, value] of Object.entries(declarations)) {
      if (!PROPERTIES.has(name)) continue
      if (value === 'inherit') {
        if (parent[name] !== undefined) style[name] = parent[name]
      } else {
        style[name] = value
      }
    }
  }
  set(element.attrs)
  for (const rule of rules) if (matches(rule, element)) set(rule.declarations)
  if (element.attrs.style) set(parseDeclarations(element.attrs.style))
  return style
}
