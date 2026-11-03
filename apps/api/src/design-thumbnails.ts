// The picture of a design the home's bento shows (#84): its first page in its primary format,
// drawn on a small CPU surface like an export (ADR-0005), on a thread of its own, with the fonts
// and images we store. Like an asset's thumbnail (ADR-0010) it is an image we make and store, once
// per version of the design: the key carries the design's updatedAt, so an edit makes a new one.
import { Worker } from 'node:worker_threads'

import type { Db } from '@dazbee/db'
import type { Design, DesignCover, DesignSummary } from '@dazbee/schema'
import type { Storage } from '@dazbee/storage'

import { storedDesign } from './designs.ts'
import type { DrawJob, DrawResult } from './draw-worker.ts'
import { brandResourcesFor, firstPageId } from './render.ts'
import { designThumbnailKey } from './storage-keys.ts'

/** The longest side of a design's picture: the bento's big tile on a 2× screen. */
const DESIGN_THUMBNAIL_SIZE = 640

/** The page and format a design's picture shows: its first page, in its primary format. */
export function coverOf(design: Design) {
  const pageId = firstPageId(design)
  const formatId = design.formats[design.meta.primaryFormatId]
    ? design.meta.primaryFormatId
    : Object.keys(design.formats)[0]
  const format = formatId ? design.formats[formatId] : undefined
  if (!pageId || !formatId || !format) return null
  return { pageId, formatId, width: format.width, height: format.height }
}

/** Where a design's stored picture is, and the size of the format it shows. */
export type ThumbnailCover = DesignCover & { key: string }

/** The primary format's size, read from the stored design without drawing: what a tile needs to take its shape. */
export async function designCover(db: Db, summary: DesignSummary): Promise<DesignCover | null> {
  const design = await storedDesign(db, summary.id)
  const cover = design && coverOf(design)
  return cover ? { width: cover.width, height: cover.height } : null
}

// The drawing thread, started on the first picture and started again if it dies.
let worker: Worker | undefined
let nextJob = 0
const waiting = new Map<number, { resolve: (png: Uint8Array) => void; reject: (error: Error) => void }>()

function drawingThread(): Worker {
  if (worker) return worker
  const thread = new Worker(new URL('./draw-worker.ts', import.meta.url))
  // An idle thread doesn't keep the process (or a test run) alive.
  thread.unref()
  thread.on('message', (result: DrawResult) => {
    const job = waiting.get(result.id)
    waiting.delete(result.id)
    if ('png' in result) job?.resolve(result.png)
    else job?.reject(new Error(result.error))
  })
  const fail = (error: Error) => {
    if (worker === thread) worker = undefined
    for (const job of waiting.values()) job.reject(error)
    waiting.clear()
  }
  thread.on('error', fail)
  thread.on('exit', (code) => fail(new Error(`the design picture thread stopped (${code})`)))
  worker = thread
  return thread
}

function drawOnThread(job: Omit<DrawJob, 'id'>): Promise<Uint8Array> {
  const thread = drawingThread()
  const id = nextJob++
  return new Promise<Uint8Array>((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    thread.ref()
    thread.postMessage({ ...job, id } satisfies DrawJob)
  }).finally(() => {
    if (waiting.size === 0) thread.unref()
  })
}

// A picture being made, by its key, so two requests for the same one draw it once.
const making = new Map<string, Promise<void>>()

/**
 * The stored picture of the design as it is now, made first if this version has none, and the
 * primary format's size. It is drawn on its own thread (see draw-worker.ts), straight at its small
 * size. Null when the design has nothing to show.
 */
export async function ensureDesignThumbnail(
  db: Db,
  storage: Storage,
  workspaceId: string,
  summary: DesignSummary,
): Promise<ThumbnailCover | null> {
  const design = await storedDesign(db, summary.id)
  const cover = design && coverOf(design)
  if (!design || !cover) return null
  const key = designThumbnailKey(workspaceId, summary)
  const shape = { key, width: cover.width, height: cover.height }
  if (await storage.exists(key)) return shape
  let made = making.get(key)
  if (!made) {
    made = (async () => {
      const resources = await brandResourcesFor(db, storage, workspaceId, summary.brandId, design)
      const scale = Math.min(1, DESIGN_THUMBNAIL_SIZE / Math.max(cover.width, cover.height))
      const size = {
        width: Math.max(1, Math.round(cover.width * scale)),
        height: Math.max(1, Math.round(cover.height * scale)),
      }
      const png = await drawOnThread({
        design,
        pageId: cover.pageId,
        formatId: cover.formatId,
        format: { width: cover.width, height: cover.height },
        size,
        resources,
      })
      await storage.put(key, png, 'image/png')
    })().finally(() => making.delete(key))
    making.set(key, made)
  }
  await made
  return shape
}
