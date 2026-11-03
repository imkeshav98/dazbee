// A small XML reader for SVG, safe for files from anyone: it reads elements, attributes and text,
// and nothing else. A DOCTYPE and everything in it is skipped, so no entity is ever defined or
// expanded and no external file is named; only the five predefined entities and character
// references are decoded. Processing instructions and comments are skipped too.

export interface XmlElement {
  /** The name without a namespace prefix: `svg:path` reads as `path`. */
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
}
type XmlNode = XmlElement | string

export class XmlError extends Error {}

/** More than this many elements, or this deep, and the file is refused rather than read. */
const MAX_ELEMENTS = 50_000
const MAX_DEPTH = 256

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

/** Text with its character references decoded; anything else that looks like an entity stays as written. */
function decode(text: string) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref.startsWith('#x')) return codePoint(Number.parseInt(ref.slice(2), 16)) ?? whole
    if (ref.startsWith('#')) return codePoint(Number.parseInt(ref.slice(1), 10)) ?? whole
    return NAMED[ref] ?? whole
  })
}
const codePoint = (n: number) => (Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : null)

const localName = (name: string) => name.slice(name.indexOf(':') + 1)

/** The document's root element. Throws XmlError when the text is not well enough formed to read. */
export function parseXml(text: string): XmlElement {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  const stack: XmlElement[] = []
  let root: XmlElement | null = null
  let count = 0
  const skipPast = (end: string) => {
    const at = text.indexOf(end, i)
    if (at < 0) throw new XmlError(`no "${end}" after position ${i}`)
    i = at + end.length
  }
  const addText = (value: string) => {
    const parent = stack.at(-1)
    if (parent && value) parent.children.push(value)
  }
  while (i < text.length) {
    if (text[i] !== '<') {
      const next = text.indexOf('<', i)
      const end = next < 0 ? text.length : next
      addText(decode(text.slice(i, end)))
      i = end
      continue
    }
    if (text.startsWith('<!--', i)) {
      skipPast('-->')
    } else if (text.startsWith('<![CDATA[', i)) {
      const at = text.indexOf(']]>', i)
      if (at < 0) throw new XmlError('an unclosed CDATA section')
      addText(text.slice(i + 9, at))
      i = at + 3
    } else if (text.startsWith('<?', i)) {
      skipPast('?>')
    } else if (text.startsWith('<!', i)) {
      // A DOCTYPE, with its internal subset if it has one: skipped whole, never read.
      const bracket = text.indexOf('[', i)
      const close = text.indexOf('>', i)
      if (close < 0) throw new XmlError('an unclosed declaration')
      if (bracket >= 0 && bracket < close) skipPast(']>')
      else i = close + 1
    } else if (text.startsWith('</', i)) {
      const close = text.indexOf('>', i)
      if (close < 0) throw new XmlError('an unclosed end tag')
      const name = localName(text.slice(i + 2, close).trim())
      const open = stack.pop()
      if (!open || open.name !== name) throw new XmlError(`</${name}> does not close <${open?.name ?? 'nothing'}>`)
      i = close + 1
    } else {
      const element = readTag()
      if (++count > MAX_ELEMENTS) throw new XmlError(`more than ${MAX_ELEMENTS} elements`)
      const parent = stack.at(-1)
      if (parent) parent.children.push(element.element)
      else if (!root) root = element.element
      else throw new XmlError('more than one root element')
      if (!element.closed) {
        stack.push(element.element)
        if (stack.length > MAX_DEPTH) throw new XmlError(`nested more than ${MAX_DEPTH} deep`)
      }
    }
  }
  if (stack.length > 0) throw new XmlError(`<${stack.at(-1)?.name ?? ''}> is never closed`)
  if (!root) throw new XmlError('no root element')
  return root

  function readTag(): { element: XmlElement; closed: boolean } {
    i++
    const nameMatch = /^[^\s/>]+/.exec(text.slice(i, i + 200))
    if (!nameMatch) throw new XmlError(`a tag with no name at position ${i}`)
    const element: XmlElement = { name: localName(nameMatch[0]), attrs: {}, children: [] }
    i += nameMatch[0].length
    for (;;) {
      while (/\s/.test(text[i] ?? '')) i++
      if (text.startsWith('/>', i)) {
        i += 2
        return { element, closed: true }
      }
      if (text[i] === '>') {
        i++
        return { element, closed: false }
      }
      if (i >= text.length) throw new XmlError(`<${element.name}> is never finished`)
      const attr = /^([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/.exec(text.slice(i, i + 1_000_000))
      if (!attr) {
        // An attribute with no value, as HTML allows: kept as empty.
        const bare = /^[^\s=/>]+/.exec(text.slice(i, i + 200))
        if (!bare) throw new XmlError(`a bad attribute in <${element.name}>`)
        element.attrs[localName(bare[0])] = ''
        i += bare[0].length
        continue
      }
      const name = attr[1] ?? ''
      // xlink:href and href both name what an element refers to.
      element.attrs[name === 'xlink:href' ? 'href' : name.startsWith('xmlns') ? name : localName(name)] = decode(
        attr[3] ?? attr[4] ?? '',
      )
      i += attr[0].length
    }
  }
}

/** The element's own text and its descendants', in order. */
export function textOf(element: XmlElement): string {
  return element.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('')
}
