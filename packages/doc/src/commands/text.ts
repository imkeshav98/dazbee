import type * as Y from 'yjs'
import { z } from 'zod'

import { formatScope, NodeId, RunStyle } from '@dazbee/schema'

import { overrideKey } from '../design-doc.ts'
import { lockProblem } from './checks.ts'
import { defineCommand } from './define.ts'
import { Placement } from './placement.ts'

const TextOp = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('insert'), at: z.number().int().min(0), text: z.string().min(1) }),
  z.object({ kind: z.literal('delete'), at: z.number().int().min(0), length: z.number().int().positive() }),
  z.object({
    kind: z.literal('style'),
    at: z.number().int().min(0),
    length: z.number().int().positive(),
    style: RunStyle,
  }),
])

/** Offsets count UTF-16 units. Inserted text takes the style of the character before it. */
export const textEdit = defineCommand({
  name: 'text.edit',
  input: z.object({ id: NodeId, op: TextOp }),
  check: ({ design }, { id, op }) => {
    const node = design.nodes[id]
    if (!node) return `no layer "${id}"`
    if (node.type !== 'text') return `"${id}" is a ${node.type}, not a text layer`
    const locked = lockProblem(id, node, op.kind === 'style' ? 'style' : 'content')
    if (locked) return locked
    const end = op.at + (op.kind === 'insert' ? 0 : op.length)
    if (end > node.props.text.length)
      return `the range ${op.at}–${end} runs past the end of the text (${node.props.text.length})`
    return undefined
  },
  apply: ({ r, design }, { id, op }) => {
    const ytext = (r.nodes.get(id)?.get('props') as Y.Map<unknown>).get('text') as Y.Text
    if (op.kind === 'insert') ytext.insert(op.at, op.text)
    else if (op.kind === 'delete') ytext.delete(op.at, op.length)
    else ytext.format(op.at, op.length, op.style)
    if (op.kind === 'style') return
    // A format's own runs stay on their characters, as the base's do; a format with text of its own keeps its runs.
    for (const [scope, byNode] of Object.entries(design.overrides)) {
      const own = byNode[id]
      if (!own || 'text' in own || !Array.isArray(own.runs)) continue
      const runs = (own.runs as { start: number; end: number; style: unknown }[]).flatMap((run) => {
        const moved =
          op.kind === 'insert' ? insertedInto(run, op.at, op.text.length) : deletedFrom(run, op.at, op.length)
        return moved.end > moved.start ? [moved] : []
      })
      r.overrides.set(overrideKey(scope, id, 'runs'), runs)
    }
  },
})

/**
 * Sets the box of text that grows to the size it is drawn at (#47), measured by the caller in each
 * format: its width and height for auto width, its height for auto height. The editor runs it as
 * text is typed, in the same undo step, so the box is always where the words are.
 */
export const textFit = defineCommand({
  name: 'text.fit',
  input: z.object({
    id: NodeId,
    sizes: z.record(z.string(), z.object({ width: z.number().min(0), height: z.number().min(0) })),
  }),
  check: ({ design }, { id, sizes }) => {
    const node = design.nodes[id]
    if (!node) return `no layer "${id}"`
    if (node.type !== 'text') return `"${id}" is a ${node.type}, not a text layer`
    return Object.keys(sizes)
      .map((f) => (design.formats[f] ? undefined : `no format "${f}"`))
      .find(Boolean)
  },
  apply: ({ r, design }, { id, sizes }) => {
    const place = new Placement(design)
    const primary = sizes[design.meta.primaryFormatId]
    if (primary) place.set('base', id, primary)
    for (const [formatId, size] of Object.entries(sizes)) place.set(formatScope(formatId), id, size)
    place.write(r)
  },
})

/** A run after `length` characters go in at `at`: they take the style of the character before them, so a run ending there grows. */
function insertedInto<T extends { start: number; end: number }>(run: T, at: number, length: number): T {
  if (at <= run.start) return { ...run, start: run.start + length, end: run.end + length }
  return at <= run.end ? { ...run, end: run.end + length } : run
}

/** A run after the `length` characters from `at` go; empty once they all did. */
function deletedFrom<T extends { start: number; end: number }>(run: T, at: number, length: number): T {
  const map = (p: number) => (p <= at ? p : p >= at + length ? p - length : at)
  return { ...run, start: map(run.start), end: map(run.end) }
}
