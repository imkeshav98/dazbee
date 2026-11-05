// Measures the big carousel, cards × 5 linked frames, as a Yjs document (#10): its size on the wire
// and in Postgres, how long opening and reading it take, and what one command costs on it.
// `node scripts/measure-doc.ts [cards]` (20 by default); pin it to one core with `taskset -c 0`
// to match the server.
import { gzipSync } from 'node:zlib'

import * as Y from 'yjs'

import { loadDesign, openSession, readDesign } from '@dazbee/doc'
import { parseDesign } from '@dazbee/schema'

import { bigCarousel } from '../src/big-carousel.ts'

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
const time = (run: () => void, times: number) =>
  median(
    Array.from({ length: times }, () => {
      const start = performance.now()
      run()
      return performance.now() - start
    }),
  )
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

const cards = Number(process.argv[2] ?? 20)
const parsed = parseDesign(bigCarousel(cards))
if (!parsed.success) throw new Error(parsed.errors.join('\n'))
const design = parsed.design
const doc = loadDesign(design)
const size = () => {
  const update = Y.encodeStateAsUpdate(doc)
  return `${kb(update.length)} (${kb(gzipSync(update).length)} gzipped)`
}
console.log(
  `design: ${Object.keys(design.pages).length} pages, ${Object.keys(design.frames).length} frames, ${Object.keys(design.nodes).length} layers`,
)
console.log(`design JSON: ${kb(JSON.stringify(design).length)}`)
console.log(`Yjs state, fresh: ${size()}`)
const update = Y.encodeStateAsUpdate(doc)
console.log(`load the state into a new doc: ${time(() => Y.applyUpdate(new Y.Doc(), update), 9).toFixed(1)} ms median`)
// Opening a design as a tab does: the state into a new doc, then the session's whole first read.
const open = time(() => {
  const opened = new Y.Doc()
  Y.applyUpdate(opened, update)
  const tab = openSession(opened)
  Object.keys(tab.design().nodes)
  tab.destroy()
}, 5)
console.log(`open (load the state, then a session's first read): ${open.toFixed(1)} ms median of 5`)
console.log(`readDesign (the whole design as validated JSON): ${time(() => readDesign(doc), 9).toFixed(1)} ms median`)

// A command checks its input against the session's design view, which only validates what
// changed since the last command (#23).
const session = openSession(doc)
let x = 0
console.log(
  `one node.update command: ${time(() => session.run('node.update', { ids: ['p7-title'], patch: { x: x++ % 200 } }), 201).toFixed(2)} ms median`,
)
console.log(
  `one node.update command on a linked copy: ${time(() => session.run('node.update', { ids: ['p7-story-cta'], patch: { x: x++ % 200 } }), 201).toFixed(2)} ms median`,
)
console.log(
  `one text.edit command (a typed key): ${time(() => session.run('text.edit', { id: 'p7-body', op: { kind: 'insert', at: 0, text: 'a' } }), 201).toFixed(2)} ms median`,
)

// A working session: 1,000 more edits of the kinds people make, then the size again.
for (let i = 0; i < 1000; i++) {
  const card = `p${(i % Math.min(cards, 20)) + 1}`
  if (i % 3 === 0) session.run('text.edit', { id: `${card}-title`, op: { kind: 'insert', at: 0, text: 'N' } })
  else if (i % 3 === 1) session.run('text.edit', { id: `${card}-title`, op: { kind: 'delete', at: 0, length: 1 } })
  else session.run('node.update', { ids: [i % 2 ? `${card}-cta` : `${card}-story-cta`], patch: { x: 700 + (i % 50) } })
}
console.log(`Yjs state after 1,000 more edits: ${size()}`)
session.destroy()
