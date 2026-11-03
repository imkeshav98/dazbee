// Files the API tests upload and read: images, fonts, and the SHA-256 they are stored under.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

import { FONT_FILES_DIR } from '@dazbee/fonts/node'

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** One of the font files we ship. */
export const fontFile = (file: string) => new Uint8Array(readFileSync(join(FONT_FILES_DIR, file)))

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff
  for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A real, decodable RGBA PNG whose colours come from `seed`, so different seeds give different bytes. */
export function png(width: number, height: number, seed: string): Uint8Array {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const rows = Buffer.alloc(height * (1 + width * 4))
  for (let i = 0; i < rows.length; i++)
    rows[i] = i % (1 + width * 4) === 0 ? 0 : (seed.charCodeAt(i % seed.length) * (i + 7)) & 0xff
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return new Uint8Array(
    Buffer.concat([
      signature,
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', new Uint8Array()),
    ]),
  )
}

/** One PNG chunk: its length, type, data and CRC. */
function chunk(type: string, data: Uint8Array) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  out.set(data, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
