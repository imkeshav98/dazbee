// The speed report: the tests tagged @perf time what the other tests count. CI runs them on pushes
// to main only, one at a time, in a job of their own; they never fail on a number, since a shared
// runner drawing WebGL on the CPU times the machine as much as the editor. Each measurement goes
// to output/perf-*.json and, on CI, into the job's summary as a table.
import { appendFileSync } from 'node:fs'

import { writeOutput } from './editor.ts'
import { test } from './test.ts'

export const PERF = { tag: '@perf' }

const round = (n: number) => Math.round(n * 100) / 100

/** The median, 95th percentile and slowest of some timings in ms, and how many there were. */
export function spread(ms: number[]) {
  const sorted = [...ms].sort((a, b) => a - b)
  const at = (q: number) => round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0)
  return { samples: sorted.length, medianMs: at(0.5), p95Ms: at(0.95), maxMs: at(1) }
}

/** Reports one measurement: a row per step, each with its numbers. */
export function report(name: string, rows: Record<string, Record<string, number>>) {
  writeOutput(
    `perf-${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}.json`,
    JSON.stringify(rows, null, 2),
  )
  console.log(name, JSON.stringify(rows))
  test.info().annotations.push({ type: name, description: JSON.stringify(rows) })
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (!summary) return
  const columns = [...new Set(Object.values(rows).flatMap((row) => Object.keys(row)))]
  const table = [
    `### ${name}`,
    '',
    `| | ${columns.join(' | ')} |`,
    `| --- | ${columns.map(() => '---:').join(' | ')} |`,
    ...Object.entries(rows).map(
      ([step, row]) => `| ${step} | ${columns.map((column) => row[column] ?? '').join(' | ')} |`,
    ),
    '',
    '',
  ]
  appendFileSync(summary, table.join('\n'))
}
