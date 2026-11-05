// The workspace and its brands, always read and written within one workspace.

import { and, asc, eq } from 'drizzle-orm'

import { brands, type Db, newId, workspaces } from '@dazbee/db'
import type { BrandSummary, UpdateWorkspace, WorkspaceSummary } from '@dazbee/schema'

const workspaceSummary = { id: workspaces.id, name: workspaces.name }

export async function findWorkspace(db: Db, workspaceId: string): Promise<WorkspaceSummary | null> {
  const [row] = await db.select(workspaceSummary).from(workspaces).where(eq(workspaces.id, workspaceId))
  return row ?? null
}

export async function updateWorkspace(
  db: Db,
  workspaceId: string,
  { name }: UpdateWorkspace,
): Promise<WorkspaceSummary | null> {
  const [row] = await db
    .update(workspaces)
    .set({ name })
    .where(eq(workspaces.id, workspaceId))
    .returning(workspaceSummary)
  return row ?? null
}

export async function listBrands(db: Db, workspaceId: string): Promise<BrandSummary[]> {
  return db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(eq(brands.workspaceId, workspaceId))
    .orderBy(asc(brands.name), asc(brands.id))
}

export async function createBrand(db: Db, workspaceId: string, name: string, website?: string): Promise<BrandSummary> {
  const [row] = await db
    .insert(brands)
    .values({ id: newId(), workspaceId, name, website: website ?? null })
    .returning({ id: brands.id, name: brands.name })
  if (!row) throw new Error('insert returned no brand')
  return row
}

export async function findBrand(db: Db, workspaceId: string, brandId: string): Promise<BrandSummary | null> {
  const [row] = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.workspaceId, workspaceId)))
  return row ?? null
}
