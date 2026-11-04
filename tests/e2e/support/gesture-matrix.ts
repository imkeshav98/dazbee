// The canvas gesture matrix (#232): every canvas gesture against every kind of container, in one
// format of a design that has two, with real pointer and keyboard input. Each gesture is checked
// against what it should do: a move moves the layer by the drag, a resize sizes it from the handle
// dragged (scaling a group's or boolean's layers, never a frame's) and a path's drawing with its
// box, and fixes the sizing of the axes it drags while the other keeps its own, a turn turns it,
// align lines it up, the other format stays as it was, auto layout keeps placing its flow (a drag
// or an arrow moves a layer along it, and what it decides is said), the gesture is one undo step,
// and nothing logs an error. Failures that have a ticket of their own are listed in KNOWN.
import type { Browser, Page } from '@playwright/test'

import { formatScope } from '@dazbee/schema'

import { photo, upload } from './assets.ts'
import { designOf, screenPoint } from './editor.ts'
import { BESIDE, FLOW, HOLDS, LEAVES, matrixDesign, PATH_INK, type Subject } from './gesture-matrix-design.ts'
import { drawn, openStage, press, selectLayers } from './stage.ts'

const AUTO = new Set(['auto', 'aHug', 'col', 'autoTurned'])
const TEXT = new Set(['tWide', 'tTall', 'tFixed'])
/** Layers turned on the page as drawn, by degrees: a handle dragged along the page sizes them by the part along their side. */
const TURNED: Record<string, number> = { turned: 20, tInner: 20, autoTurned: 10, atA: 10 }
const ALL = [...LEAVES, ...Object.keys(HOLDS)]

const HANDLES: Record<string, { dx: number; dy: number; w: number; h: number }> = {
  e: { dx: 40, dy: 0, w: 40, h: 0 },
  w: { dx: -40, dy: 0, w: 40, h: 0 },
  s: { dx: 0, dy: 30, w: 0, h: 30 },
  n: { dx: 0, dy: -30, w: 0, h: 30 },
  se: { dx: 40, dy: 30, w: 40, h: 30 },
  nw: { dx: -40, dy: -30, w: 40, h: 30 },
  ne: { dx: 40, dy: -30, w: 40, h: 30 },
  sw: { dx: -40, dy: 30, w: 40, h: 30 },
}
const GESTURES = [
  'move',
  ...Object.keys(HANDLES).map((h) => `resize-${h}`),
  'rotate',
  'nudge',
  'align',
  'distribute',
  'duplicate',
  'paste',
  'group',
  'frame-selection',
  'ungroup',
  'delete',
] as const

/** Failures that have their own ticket: `subject gesture format` → issue number. */
const KNOWN: Record<string, number> = Object.fromEntries([])

type Box = { x: number; y: number; width: number; height: number }
type Boxes = Record<string, Box | null>
type Doc = {
  nodes: Record<string, { parentId: string; index: string; props: Record<string, unknown> }>
  overrides: Record<string, Record<string, Record<string, unknown>>>
}

const boxesIn = (page: Page, formatId: string): Promise<Boxes> =>
  page.evaluate(
    ({ formatId, ids }) => Object.fromEntries(ids.map((id) => [id, window.dazbee?.boxOf(id, 'p1', formatId) ?? null])),
    { formatId, ids: ALL },
  )
/** Where a colour is drawn in a format's export: the box around its pixels, in design pixels, or null. */
const inkOf = (page: Page, formatId: string, rgb: [number, number, number]) =>
  page.evaluate(
    ({ formatId, rgb }) => {
      const pixels = window.dazbee?.exportPixels('p1', formatId)
      if (!pixels) return null
      const width = formatId === 'wide' ? 1920 : 1080
      let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity]
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          Math.abs((pixels[i] ?? 0) - rgb[0]) > 8 ||
          Math.abs((pixels[i + 1] ?? 0) - rgb[1]) > 8 ||
          Math.abs((pixels[i + 2] ?? 0) - rgb[2]) > 8
        )
          continue
        const x = (i / 4) % width
        const y = Math.floor(i / 4 / width)
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x + 1)
        bottom = Math.max(bottom, y + 1)
      }
      return left === Infinity ? null : { x: left, y: top, width: right - left, height: bottom - top }
    },
    { formatId, rgb },
  )
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 })
  await page.mouse.move(b.x, b.y, { steps: 3 })
  await page.mouse.up()
  await drawn(page)
}
async function handleAt(page: Page, which: string) {
  const handle = page.locator(`.selection .handle[data-handle="${which}"]`)
  // A handle the selection hasn't is none, at once.
  if ((await handle.count()) === 0) return null
  const box = await handle.boundingBox()
  return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const close = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol
const same = (a: Box | null | undefined, b: Box | null | undefined) =>
  !a || !b || (close(a.x, b.x) && close(a.y, b.y) && close(a.width, b.width) && close(a.height, b.height))
const flowOrder = (doc: Doc, parent: string) =>
  Object.entries(doc.nodes)
    .filter(([id, n]) => n.parentId === parent && FLOW[id])
    .sort(([, a], [, b]) => (a.index < b.index ? -1 : 1))
    .map(([id]) => id)
    .join()
const notices = (page: Page) => page.evaluate(() => (window as unknown as { notices?: number }).notices ?? 0)

/** Runs one gesture on the subject; returns what went wrong, null when it did what it should, or 'n/a'. */
async function run(
  page: Page,
  subject: Subject,
  gesture: string,
  formatId: string,
  other: string,
): Promise<string | null> {
  const before = await boxesIn(page, formatId)
  const beforeOther = await boxesIn(page, other)
  const json = await designOf(page)
  const doc = JSON.parse(json) as Doc
  const count = Object.keys(doc.nodes).length
  const noticesBefore = await notices(page)
  const box = before[subject]
  if (!box) return 'no box before'
  const zoom = await page.evaluate(() => window.dazbee?.camera().zoom ?? 1)
  // A group's middle may be a gap between its layers: it is pressed on its first one.
  const grip =
    subject === 'group' || subject === 'bool' || subject === 'paths' ? (before[HOLDS[subject]?.[0] ?? ''] ?? box) : box
  const centre = await screenPoint(page, grip.x + grip.width / 2, grip.y + grip.height / 2, { pageId: 'p1', formatId })
  const turnBy = ((TURNED[subject] ?? 0) * Math.PI) / 180
  const flowParent = FLOW[subject]
  switch (true) {
    case gesture === 'move': {
      // In a flow, a drag to its other end; anywhere else, by 30, 20.
      const flow = flowParent ? (HOLDS[flowParent] ?? []).filter((id) => FLOW[id]) : []
      const isLast = flow.at(-1) === subject
      const end = flow
        .filter((id) => id !== subject)
        .map((id) => before[id])
        .filter((b): b is Box => b !== null)
        .at(isLast ? 0 : -1)
      // Past that sibling's far corner, so a row or a column takes it beyond it.
      const to = end
        ? await screenPoint(
            page,
            isLast ? end.x + 2 : end.x + end.width - 2,
            isLast ? end.y + 2 : end.y + end.height - 2,
            { pageId: 'p1', formatId },
          )
        : { x: centre.x + 30 * zoom, y: centre.y + 20 * zoom }
      await drag(page, centre, to)
      break
    }
    case gesture.startsWith('resize-'): {
      const which = gesture.slice(7)
      const h = HANDLES[which]
      const at = await handleAt(page, which)
      // Text that grows with its words has no top or bottom handles: only a fixed box has a height of its own.
      if (TEXT.has(subject) && subject !== 'tFixed' && (which === 'n' || which === 's'))
        return at ? `has an ${which} handle` : 'n/a'
      if (!h || !at) return `no ${which} handle`
      await drag(page, at, { x: at.x + h.dx * zoom, y: at.y + h.dy * zoom })
      break
    }
    case gesture === 'rotate': {
      const at = await handleAt(page, 'ne')
      if (!at) return 'no ne handle'
      await drag(page, { x: at.x + 12, y: at.y - 12 }, { x: at.x + 40, y: at.y + 30 })
      break
    }
    case gesture === 'nudge':
      await press(page, 'nudgeRight')
      break
    case gesture === 'align':
      await press(page, 'alignLeft')
      break
    case gesture === 'distribute': {
      const beside = BESIDE[subject]
      if (!beside) return 'n/a'
      await page.evaluate(({ ids, formatId }) => window.dazbee?.select(ids, 'p1', formatId), {
        ids: [subject, ...beside],
        formatId,
      })
      await press(page, 'distributeHorizontal')
      break
    }
    case gesture === 'duplicate':
      await press(page, 'duplicate')
      break
    case gesture === 'paste':
      await page.keyboard.press('Control+KeyC')
      await page.keyboard.press('Control+KeyV')
      await drawn(page)
      break
    case gesture === 'group':
      await press(page, 'group')
      break
    case gesture === 'frame-selection':
      await press(page, 'frameSelection')
      break
    case gesture === 'ungroup':
      await press(page, 'ungroup')
      break
    case gesture === 'delete':
      await press(page, 'delete')
      break
  }
  const after = await boxesIn(page, formatId)
  const afterOther = await boxesIn(page, other)
  const now = JSON.parse(await designOf(page)) as Doc
  const told = (await notices(page)) > noticesBefore
  const problems: string[] = []
  const b = after[subject]
  // Who may change: the subject and what it holds, what holds it, and a flow it is in.
  const inside = (id: string): string[] => (HOLDS[id] ?? []).flatMap((kid) => [kid, ...inside(kid)])
  const holders = Object.entries(HOLDS)
    .filter(([, kids]) => kids.includes(subject))
    .map(([id]) => id)
  const flowMates = flowParent ? [...inside(flowParent), flowParent] : AUTO.has(subject) ? inside(subject) : []
  const may = new Set([
    subject,
    ...inside(subject),
    ...holders,
    ...flowMates,
    ...(gesture === 'distribute' ? [...(BESIDE[subject] ?? []), ...(BESIDE[subject] ?? []).flatMap(inside)] : []),
  ])
  const placement =
    gesture === 'move' || gesture.startsWith('resize-') || ['rotate', 'nudge', 'align', 'distribute'].includes(gesture)
  // Moving in a flow reorders it, and a layer's order is the same in every format.
  const reorders = Boolean(flowParent) && (gesture === 'move' || gesture === 'nudge')
  if (placement) {
    for (const id of ALL) if (!may.has(id) && !same(before[id], after[id])) problems.push(`${id} changed`)
    for (const id of ALL)
      if (!(reorders && flowMates.includes(id)) && !same(beforeOther[id], afterOther[id]))
        problems.push(`${id} changed in ${other}`)
  }
  if (gesture === 'move' && b) {
    if (flowParent) {
      if (flowOrder(doc, flowParent) === flowOrder(now, flowParent)) problems.push('not moved along its flow')
    } else if (!close(b.x, box.x + 30, 1) || !close(b.y, box.y + 20, 1))
      problems.push(`moved to ${b.x},${b.y}, not by 30,20`)
  }
  if (gesture.startsWith('resize-') && b) {
    const which = gesture.slice(7)
    const h = HANDLES[which] as { dx: number; dy: number; w: number; h: number }
    // The drag along the layer's own sides, as it is turned.
    const sx = which.includes('e') ? 1 : which.includes('w') ? -1 : 0
    const wantW = box.width + sx * (h.dx * Math.cos(turnBy) + h.dy * Math.sin(turnBy))
    // A corner scales text: its box keeps its shape, by the factor of the side moved more, and its size with it.
    const corner = which.length === 2
    if (TEXT.has(subject) && corner) {
      const factor = Math.max((box.width + h.w) / box.width, (box.height + h.h) / box.height)
      const sizeOf = (d: Doc) =>
        (
          ({ ...d.nodes[subject]?.props, ...d.overrides[formatScope(formatId)]?.[subject] }).style as {
            fontSize: number
          }
        ).fontSize
      const want = Math.round(sizeOf(doc) * factor * 10) / 10
      if (!close(sizeOf(now), want, 0.15)) problems.push(`font size ${sizeOf(now)}, not ${want}`)
      // Auto width text takes the width its scaled words have; the others keep the box's shape.
      if (subject !== 'tWide' && !close(b.width, box.width * factor, box.width * factor * 0.04))
        problems.push(`width ${b.width}, not ${box.width * factor}`)
    } else if (h.w && !close(b.width, wantW, 1.5)) problems.push(`width ${b.width}, not ${wantW}`)
    if (h.h && !TEXT.has(subject) && !turnBy && !close(b.height, box.height + h.h, 1.5))
      problems.push(`height ${b.height}, not ${box.height + h.h}`)
    // A frame's layers keep their size; a group's or boolean's scale with it; a flow fills what it is given.
    const scaled = subject === 'group' || subject === 'bool' || subject === 'paths'
    if (!scaled) {
      for (const id of inside(subject).filter((id) => id !== 'aFill'))
        if (
          before[id] &&
          after[id] &&
          (!close((before[id] as Box).width, (after[id] as Box).width) ||
            !close((before[id] as Box).height, (after[id] as Box).height))
        )
          problems.push(`${id} resized inside a frame`)
    }
    if (AUTO.has(subject)) {
      for (const id of inside(subject).filter((id) => FLOW[id])) {
        const kid = after[id]
        if (
          kid &&
          b &&
          !turnBy &&
          (kid.x < b.x - 0.5 ||
            kid.y < b.y - 0.5 ||
            kid.x + kid.width > b.x + b.width + 0.5 ||
            kid.y + kid.height > b.y + b.height + 0.5)
        )
          problems.push(`${id} outside its frame`)
      }
    }
    // The axes dragged become fixed; the other keeps its sizing, so a hugging frame made narrower
    // still hugs its height.
    const sizingOf = (d: Doc) =>
      ({ ...d.nodes[subject]?.props, ...d.overrides[formatScope(formatId)]?.[subject] }).sizing as
        { width: string; height: string } | undefined
    const was = sizingOf(doc)
    if (was) {
      const want = { width: h.w ? 'fixed' : was.width, height: h.h ? 'fixed' : was.height }
      const is = sizingOf(now)
      if (is?.width !== want.width || is.height !== want.height)
        problems.push(`sizing ${JSON.stringify(is)}, not ${JSON.stringify(want)}`)
    }
    if (
      subject === 'photo' &&
      JSON.stringify(now.nodes.photo?.props.fills) !== JSON.stringify(doc.nodes.photo?.props.fills)
    )
      problems.push('crop changed')
    // A path draws to its new box, in the export too.
    for (const id of [subject, ...inside(subject)].filter((id) => PATH_INK[id])) {
      const ink = await inkOf(page, formatId, PATH_INK[id] as [number, number, number])
      const want = after[id]
      if (
        want &&
        (!ink ||
          !close(ink.x, want.x, 2) ||
          !close(ink.y, want.y, 2) ||
          !close(ink.width, want.width, 2) ||
          !close(ink.height, want.height, 2))
      ) {
        problems.push(
          `${id} drawn at ${ink ? `${ink.x},${ink.y} ${ink.width}×${ink.height}` : 'nowhere'}, not its box ${want.x},${want.y} ${want.width}×${want.height}`,
        )
      }
    }
  }
  if (gesture === 'rotate') {
    const turn = (d: Doc) =>
      Number({ ...d.nodes[subject]?.props, ...d.overrides[formatScope(formatId)]?.[subject] }.rotation ?? 0)
    if (close(turn(doc), turn(now), 0.5)) problems.push('not turned')
  }
  if (gesture === 'nudge' && b) {
    if (flowParent) {
      if (flowOrder(doc, flowParent) === flowOrder(now, flowParent) && !told)
        problems.push('nothing moved and nothing said')
    } else if (!close(b.x, box.x + 1)) problems.push(`nudged to ${b.x}, not ${box.x + 1}`)
  }
  if (gesture === 'align' && b) {
    if (flowParent) {
      if (!told) problems.push('a flow layer, and nothing said')
    } else {
      const holder = holders[0] && before[holders[0]]
      const left = holder ? holder.x : 0
      if (!close(b.x, left, 1) && !turnBy && !holders.includes('turned')) problems.push(`left at ${b.x}, not ${left}`)
    }
  }
  if (gesture === 'distribute' && flowParent && !told) problems.push('a flow layer, and nothing said')
  if ((gesture === 'duplicate' || gesture === 'paste') && Object.keys(now.nodes).length <= count)
    problems.push('no copy')
  if ((gesture === 'group' || gesture === 'frame-selection') && Object.keys(now.nodes).length !== count + 1)
    problems.push('no new container')
  if (gesture === 'ungroup' && (subject === 'group' || subject === 'bool' || subject === 'paths') && now.nodes[subject])
    problems.push('still there')
  if (gesture === 'delete' && now.nodes[subject]) problems.push('not deleted')
  if (['group', 'frame-selection', 'ungroup'].includes(gesture))
    for (const id of LEAVES) if (!same(before[id], after[id])) problems.push(`${id} moved`)
  // One undo step puts everything back.
  await press(page, 'undo')
  if ((await designOf(page)) !== json) {
    problems.push('one undo did not put it back')
    for (let i = 0; i < 5 && (await designOf(page)) !== json; i++) {
      await press(page, 'undo')
    }
  }
  return problems.length > 0 ? problems.join('; ') : null
}

/**
 * Runs the matrix in one format for the given layers; returns the table's rows and what failed
 * without a ticket. Each case is undone before the next, and a case that one undo doesn't put back
 * fails, so a share of the subjects gives the same results as the whole matrix.
 */
export async function runMatrix(browser: Browser, formatId: 'sq' | 'wide', subjects: readonly Subject[]) {
  const other = formatId === 'sq' ? 'wide' : 'sq'
  const asset = await upload(photo)
  const opened = await openStage(browser, matrixDesign(asset.id))
  const { page } = opened
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.evaluate((formatId) => {
    const editor = window.dazbee
    if (!editor) return
    editor.setSnapping(false)
    editor.fitFrame('p1', formatId)
    const counter = window as unknown as { notices: number }
    counter.notices = 0
    editor.onNotice(() => {
      counter.notices++
    })
  }, formatId)
  await drawn(page)
  const rows: { key: string; result: string }[] = []
  const unexpected: string[] = []
  for (const subject of subjects) {
    for (const gesture of GESTURES) {
      await selectLayers(page, [subject], { format: formatId })
      const errorsBefore = opened.errors.length
      const problem = await run(page, subject, gesture, formatId, other)
      const logged =
        opened.errors.length > errorsBefore ? `errors: ${opened.errors.slice(errorsBefore).join(' | ')}` : null
      opened.errors.length = errorsBefore
      const key = `${subject} ${gesture} ${formatId}`
      if (problem === 'n/a') {
        rows.push({ key, result: 'n/a' })
        continue
      }
      const failure = [problem, logged].filter(Boolean).join('; ') || null
      const ticket = KNOWN[key]
      rows.push({
        key,
        result: failure ? (ticket ? `#${ticket}` : `FAIL: ${failure}`) : ticket ? `pass (fixed? #${ticket})` : 'pass',
      })
      if (failure && !ticket) unexpected.push(`${key}: ${failure}`)
      if (!failure && ticket) unexpected.push(`${key}: passes now; take #${ticket} out of KNOWN`)
    }
  }
  const table = [
    '| Layer | Gesture | Format | Result |',
    '|---|---|---|---|',
    ...rows.map(({ key, result }) => `| ${key.split(' ').join(' | ')} | ${result} |`),
  ].join('\n')
  return { rows, unexpected, table }
}
