// CanvasKit paths as the layers keep them: a path's SVG data, its box, and its copy under a matrix.

import type { CanvasKit, Path } from '@dazbee/canvaskit'
import type { Rect } from '@dazbee/schema'

import { ckMatrix, type Matrix } from './transform.ts'

/** A number in path data: three decimals are a thousandth of a pixel. */
const num = (n: number) => String(Math.round(n * 1000) / 1000)

/**
 * A path's SVG data. Skia's own writer splits conics, as circles are made of, into many
 * quadratics; here each conic becomes one cubic, the usual way to draw a quarter circle.
 */
export function pathData(path: Path): string {
  const cmds = path.toCmds()
  const out: string[] = []
  let x = 0
  let y = 0
  for (let i = 0; i < cmds.length;) {
    const verb = cmds[i++]
    const at = (k: number) => cmds[i + k] ?? 0
    switch (verb) {
      case 0:
        out.push(`M${num(at(0))} ${num(at(1))}`)
        x = at(0)
        y = at(1)
        i += 2
        break
      case 1:
        out.push(`L${num(at(0))} ${num(at(1))}`)
        x = at(0)
        y = at(1)
        i += 2
        break
      case 2:
        out.push(`Q${[0, 1, 2, 3].map((k) => num(at(k))).join(' ')}`)
        x = at(2)
        y = at(3)
        i += 4
        break
      case 3: {
        const [cx, cy, ex, ey, w] = [at(0), at(1), at(2), at(3), at(4)]
        const k = (4 * w) / (3 * (1 + w))
        out.push(
          `C${[x + (cx - x) * k, y + (cy - y) * k, ex + (cx - ex) * k, ey + (cy - ey) * k, ex, ey].map(num).join(' ')}`,
        )
        x = ex
        y = ey
        i += 5
        break
      }
      case 4:
        out.push(`C${[0, 1, 2, 3, 4, 5].map((k) => num(at(k))).join(' ')}`)
        x = at(4)
        y = at(5)
        i += 6
        break
      case 5:
        out.push('Z')
        break
      default:
        return path.toSVGString()
    }
  }
  return out.join('')
}

export const transformed = (ck: CanvasKit, path: Path, m: Matrix) => {
  const builder = new ck.PathBuilder(path)
  return builder.transform(ckMatrix(m)).detachAndDelete()
}
export const boundsOf = (path: Path): Rect => {
  const [left = 0, top = 0, right = 0, bottom = 0] = path.computeTightBounds()
  return { x: left, y: top, width: right - left, height: bottom - top }
}
