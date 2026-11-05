// Box queries for tests, over a real session: scenes rendered as the editor builds them, text
// measured half its font size a character and 1.2 times it a line, and images of the sizes a test
// gives. A hit test there reads text laid out with the shipped fonts.
import type { Image } from '@dazbee/canvaskit'
import { loadDesign, openSession, type Session } from '@dazbee/doc'
import { type MeasureText, render, type Resources } from '@dazbee/renderer'
import { type DesignInput, parseDesign } from '@dazbee/schema'

import type { Frame } from '../canvas/frames.ts'
import { hitTest } from '../canvas/hit-test.ts'
import { testLooks } from '../canvas/test-looks.ts'
import type { Size } from '../gestures/crop/crop.ts'
import type { EditorSelection } from '../selection.ts'
import { editorBoxes } from './boxes.ts'

/** Half the font size a character, a line 1.2 times it. */
export const measure: MeasureText = (props) => ({
  width: (props.text.length * props.style.fontSize) / 2,
  height: props.style.fontSize * 1.2,
})

const looks = testLooks()

/** A session over a design, which must parse. */
export function sessionOf(input: DesignInput): Session {
  const parsed = parseDesign(input)
  if (!parsed.success) throw new Error(parsed.errors.join('\n'))
  return openSession(loadDesign(parsed.design))
}

/** The box queries over a session and selection, in the frames given, with images of these sizes by asset id. */
export function testBoxes(
  session: Session,
  selection: Pick<EditorSelection, 'current' | 'entered'>,
  frames: Frame[],
  images: Record<string, Size> = {},
) {
  const decoded = new Map(
    Object.entries(images).map(([id, size]) => [id, { width: () => size.width, height: () => size.height } as Image]),
  )
  return editorBoxes({
    session,
    scenes: {
      scene: (frame) => render(session.design(), frame.id, undefined, measure),
      measure: () => measure,
      hit: (frame, p, options) =>
        hitTest(render(session.design(), frame.id, undefined, measure).layers, p, looks, options),
    },
    resources: {
      resources: () => ({ images: decoded }) as unknown as Resources,
      bytes: () => ({ fonts: [], fallbackFamilies: [], images: {} }),
    },
    selection,
    drawn: () => session.design(),
    frameOf: (key) => frames.find((f) => f.id === key),
  })
}
