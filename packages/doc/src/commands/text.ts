// Commands for text layers: editing characters and styles, and fitting the box to the words.
import type * as Y from 'yjs'
import { z } from 'zod'

import { NodeId, RunStyle } from '@dazbee/schema'

import { boxPlan } from './box-plan.ts'
import { lockProblem, missingLayer } from './checks.ts'
import { defineCommand } from './define.ts'

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

/**
 * Edits a text layer's characters or styles. Offsets count UTF-16 units. Inserted text takes the
 * style of the character before it. Its linked copies in other frames keep their own text.
 */
export const textEdit = defineCommand({
  name: 'text.edit',
  input: z.object({ id: NodeId, op: TextOp }),
  check: ({ design }, { id, op }) => {
    const node = design.nodes[id]
    if (!node) return missingLayer(design, [id])
    if (node.type !== 'text') return `"${id}" is a ${node.type}, not a text layer`
    const locked = lockProblem(id, node, op.kind === 'style' ? 'style' : 'content')
    if (locked) return locked
    const end = op.at + (op.kind === 'insert' ? 0 : op.length)
    if (end > node.props.text.length)
      return `the range ${op.at}–${end} runs past the end of the text (${node.props.text.length})`
    return undefined
  },
  apply: ({ r }, { id, op }) => {
    const ytext = (r.nodes.get(id)?.get('props') as Y.Map<unknown>).get('text') as Y.Text
    if (op.kind === 'insert') ytext.insert(op.at, op.text)
    else if (op.kind === 'delete') ytext.delete(op.at, op.length)
    else ytext.format(op.at, op.length, op.style)
  },
})

/**
 * Sets the box of text that grows to the size it is drawn at (#47), as the caller measured it:
 * its width and height for auto width, its height for auto height. The editor runs it as text is
 * typed, in the same undo step, so the box is always where the words are.
 */
export const textFit = defineCommand({
  name: 'text.fit',
  input: z.object({ id: NodeId, width: z.number().min(0), height: z.number().min(0) }),
  check: ({ design }, { id }) => {
    const node = design.nodes[id]
    if (!node) return missingLayer(design, [id])
    if (node.type !== 'text') return `"${id}" is a ${node.type}, not a text layer`
    return undefined
  },
  apply: ({ r, design }, { id, width, height }) => {
    const plan = boxPlan(design)
    plan.set(id, { width, height })
    plan.write(r)
  },
})
