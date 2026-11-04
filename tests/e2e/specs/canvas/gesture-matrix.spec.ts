// The canvas gesture matrix in both formats: every canvas gesture against every kind of container,
// checked against what it should do (support/gesture-matrix.ts). Each test runs every gesture on a
// share of the layers. CI runs the tests tagged @gesture-matrix in jobs of their own, three per
// format tag. Each test writes its table of results to output/gesture-matrix-<format>-<part>.md.
import { writeOutput } from '../../support/editor.ts'
import { runMatrix } from '../../support/gesture-matrix.ts'
import { SUBJECTS } from '../../support/gesture-matrix-design.ts'
import { expect, test } from '../../support/test.ts'

test.describe.configure({ mode: 'parallel', timeout: 360_000 })

const PARTS = 6
const FORMATS = [
  ['sq', 'square'],
  ['wide', 'wide'],
] as const

for (const [formatId, name] of FORMATS) {
  for (let part = 1; part <= PARTS; part++) {
    // Every PARTS-th layer, so the containers and their children are shared out evenly.
    const subjects = SUBJECTS.filter((_, i) => i % PARTS === part - 1)
    test(
      `every canvas gesture in the ${name} format, part ${part} of ${PARTS}: ${subjects.join(', ')}`,
      { tag: ['@gesture-matrix', `@gesture-matrix-${formatId}`] },
      async ({ browser }) => {
        const { rows, unexpected, table } = await runMatrix(browser, formatId, subjects)
        writeOutput(`gesture-matrix-${formatId}-${part}.md`, `${table}\n`)
        console.log(
          `gesture matrix (${formatId}, part ${part}): ${rows.length} cases, ${rows.filter((r) => r.result === 'pass').length} pass, ${unexpected.length} unexpected`,
        )
        expect(unexpected).toEqual([])
      },
    )
  }
}
