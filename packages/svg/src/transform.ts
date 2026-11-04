// SVG transforms as 2D affine matrices [a, b, c, d, e, f]: a point (x, y) goes to
// (a·x + c·y + e, b·x + d·y + f), as SVG writes matrix(a b c d e f).

import { numbers } from './lengths.ts'

export type Matrix = readonly [number, number, number, number, number, number]

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** `m` then `n`: the point goes through m first. */
export const multiply = (n: Matrix, m: Matrix): Matrix => [
  n[0] * m[0] + n[2] * m[1],
  n[1] * m[0] + n[3] * m[1],
  n[0] * m[2] + n[2] * m[3],
  n[1] * m[2] + n[3] * m[3],
  n[0] * m[4] + n[2] * m[5] + n[4],
  n[1] * m[4] + n[3] * m[5] + n[5],
]

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y]
export const scale = (x: number, y = x): Matrix => [x, 0, 0, y, 0, 0]
export const apply = (m: Matrix, x: number, y: number) => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
})
/** How much the matrix scales lengths, on average: what a stroke's width is multiplied by. */
export const lengthScale = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))

/** The matrix a transform attribute says, applied right to left as SVG does. Unknown parts are skipped. */
export function parseTransform(text: string): Matrix {
  let out = IDENTITY
  for (const [, name, args] of text.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const n = (args ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    let m: Matrix = IDENTITY
    const [p = 0, q, r] = n
    switch (name) {
      case 'matrix':
        if (n.length === 6) m = n as unknown as Matrix
        break
      case 'translate':
        m = translate(p, q ?? 0)
        break
      case 'scale':
        m = scale(p, q ?? p)
        break
      case 'rotate': {
        const t = (p * Math.PI) / 180
        const turn: Matrix = [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]
        m = q === undefined ? turn : multiply(translate(q, r ?? 0), multiply(turn, translate(-q, -(r ?? 0))))
        break
      }
      case 'skewX':
        m = [1, 0, Math.tan((p * Math.PI) / 180), 1, 0, 0]
        break
      case 'skewY':
        m = [1, Math.tan((p * Math.PI) / 180), 0, 1, 0, 0]
        break
    }
    if (m.some((v) => !Number.isFinite(v))) continue
    out = multiply(out, m)
  }
  return out
}

/** Where a viewBox lands in a viewport of `width` × `height`, as preserveAspectRatio says. */
export function viewBoxMatrix(viewBox: string | undefined, width: number, height: number, aspect = ''): Matrix {
  const [minX = 0, minY = 0, w = 0, h = 0] = numbers(viewBox)
  if (!(w > 0 && h > 0)) return IDENTITY
  const [align = 'xMidYMid', fit = 'meet'] = aspect.trim().split(/\s+/)
  const origin = translate(-minX, -minY)
  if (align === 'none') return multiply(scale(width / w, height / h), origin)
  const s = fit === 'slice' ? Math.max(width / w, height / h) : Math.min(width / w, height / h)
  const share = (key: string) => (align.includes(`${key}Min`) ? 0 : align.includes(`${key}Max`) ? 1 : 0.5)
  return multiply(translate((width - w * s) * share('x'), (height - h * s) * share('Y')), multiply(scale(s), origin))
}

/** The 3×3 matrix CanvasKit takes, row by row, for an SVG matrix. */
export const ckMatrix = (m: Matrix) => [m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1]

export const invert = (m: Matrix): Matrix | null => {
  const det = m[0] * m[3] - m[1] * m[2]
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ]
}
