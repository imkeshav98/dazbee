// A brand's designs, always read and written within one workspace.
import { randomUUID } from 'node:crypto'

import { and, asc, desc, eq } from 'drizzle-orm'
import * as Y from 'yjs'

import { type Db, designs, designStates, readDesignState } from '@dazbee/db'
import { loadDesign, readDesign } from '@dazbee/doc'
import { type Design, type DesignInput, type DesignSummary, parseDesign } from '@dazbee/schema'

export class InvalidContent extends Error {}

const summary = {
  id: designs.id,
  brandId: designs.brandId,
  name: designs.name,
  createdAt: designs.createdAt,
  updatedAt: designs.updatedAt,
}
const toSummary = (row: {
  id: string
  brandId: string
  name: string
  createdAt: Date
  updatedAt: Date
}): DesignSummary => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })

/** One page holding one empty, white 1080×1080 frame: what a design starts as when nothing else is given. */
const blankDesign = (designId: string, name: string): DesignInput => ({
  meta: { designId, name },
  pages: { p1: { name: 'Page 1', order: 'a0' } },
  frames: {
    f1: {
      pageId: 'p1',
      name: 'Feed square',
      width: 1080,
      height: 1080,
      x: 0,
      y: 0,
      fills: [{ type: 'solid', color: '#FFFFFFFF' }],
      order: 'a0',
    },
  },
  nodes: {},
})

export async function listDesigns(db: Db, workspaceId: string, brandId: string): Promise<DesignSummary[]> {
  const rows = await db
    .select(summary)
    .from(designs)
    .where(and(eq(designs.workspaceId, workspaceId), eq(designs.brandId, brandId)))
    .orderBy(desc(designs.updatedAt), asc(designs.id))
  return rows.map(toSummary)
}

export async function findDesign(
  db: Db,
  workspaceId: string,
  brandId: string,
  designId: string,
): Promise<DesignSummary | null> {
  const [row] = await db
    .select(summary)
    .from(designs)
    .where(and(eq(designs.id, designId), eq(designs.workspaceId, workspaceId), eq(designs.brandId, brandId)))
  return row ? toSummary(row) : null
}

/** Renames a design of the brand; null when there is no such design. */
export async function renameDesign(
  db: Db,
  workspaceId: string,
  brandId: string,
  designId: string,
  name: string,
): Promise<DesignSummary | null> {
  const [row] = await db
    .update(designs)
    .set({ name })
    .where(and(eq(designs.id, designId), eq(designs.workspaceId, workspaceId), eq(designs.brandId, brandId)))
    .returning(summary)
  return row ? toSummary(row) : null
}

/** Deletes a design of the brand and its stored state; false when there is no such design. */
export async function deleteDesign(db: Db, workspaceId: string, brandId: string, designId: string): Promise<boolean> {
  const rows = await db
    .delete(designs)
    .where(and(eq(designs.id, designId), eq(designs.workspaceId, workspaceId), eq(designs.brandId, brandId)))
    .returning({ id: designs.id })
  return rows.length > 0
}

/**
 * Creates a design and its first Yjs state together, so the editor never opens a design with
 * nothing in it. `content` is checked like any design; its id and name become the new design's.
 */
export async function createDesign(
  db: Db,
  workspaceId: string,
  brandId: string,
  name: string,
  content?: unknown,
): Promise<DesignSummary> {
  const id = randomUUID()
  const input = content === undefined ? blankDesign(id, name) : withMeta(content, id, name)
  const parsed = parseDesign(input)
  if (!parsed.success) throw new InvalidContent(parsed.errors.slice(0, 5).join('; '))
  const state = Y.encodeStateAsUpdate(loadDesign(parsed.design))
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(designs).values({ id, workspaceId, brandId, name }).returning(summary)
    if (!row) throw new Error('insert returned no design')
    await tx.insert(designStates).values({ designId: id, state })
    return toSummary(row)
  })
}

/** The design as its stored Yjs state holds it, or null when it has none. */
export async function storedDesign(db: Db, designId: string): Promise<Design | null> {
  const state = await readDesignState(db, designId)
  if (!state) return null
  const doc = new Y.Doc()
  Y.applyUpdate(doc, state)
  return readDesign(doc)
}

function withMeta(content: unknown, designId: string, name: string): unknown {
  if (typeof content !== 'object' || content === null || !('meta' in content)) return content
  const { meta } = content as { meta: unknown }
  return { ...content, meta: typeof meta === 'object' && meta !== null ? { ...meta, designId, name } : meta }
}
