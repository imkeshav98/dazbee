import { z } from 'zod'

import { FrameId } from './primitives.ts'

/** The image files an export makes. JPG has no transparency, so it is drawn over white. */
export const ExportType = z.enum(['png', 'jpg', 'pdf', 'svg'])
export type ExportType = z.infer<typeof ExportType>

/** The tokens a file name is built from: the design's, the page's and the frame's names. */
export const EXPORT_NAME_TOKENS = ['design', 'page', 'frame'] as const
export type ExportNameToken = (typeof EXPORT_NAME_TOKENS)[number]
/** The name a file takes when the request names none: its frame's. */
export const DEFAULT_EXPORT_NAME = '{frame}'

/**
 * What to export from a design: some frames, as one file type. The same request runs in the
 * browser's export worker and in Node. More than one file comes as one zip.
 */
export const ExportRequest = z.object({
  frameIds: FrameId.array().min(1),
  type: ExportType,
  /** JPG quality, 1 to 100. */
  quality: z.number().int().min(1).max(100).default(90),
  /** The file name, from `{design}`, `{page}` and `{frame}`; the extension is added. */
  name: z.string().min(1).max(200).default(DEFAULT_EXPORT_NAME),
})
export type ExportRequest = z.infer<typeof ExportRequest>
/** A request as a caller writes it, before the defaults are filled in. */
export type ExportRequestInput = z.input<typeof ExportRequest>
