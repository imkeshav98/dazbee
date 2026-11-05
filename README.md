# Evidence: feat/500-click-through, review round

A click picks what shows: shapes by their outline, photos by their pixels, text by its lines (#500). The white ring in a shot marks where the pointer or finger is, since a headless screenshot has no cursor.

## `evidence/`: the branch at its final commit

- `click-through-hover-*.png`: the `@evidence` test at 1280×760, dark. The hover outline sits on the layer that shows through: under a cut-out photo's clear corner, through an ellipse's empty corner, and beside a short line of text.
- `hover-<spot>-<size>-<theme>.png`: the same three spots hovered at 1280×760 and 820×1180, dark and light.
- `tap-<spot>-<size>-<theme>.png`: the same spots tapped at 390×844 on a touch screen, dark and light. The tap selects the layer beneath (its handles and size label show).

Each layer beneath reaches 20 px past the one over it, so an outline on the wrong one would show.

## `perf-click-through-200-see-through-layers.json`

The `@perf` test at the final commit: 200 layers stacked over one point where none shows (ellipses, stars with an 8 px outline stroke, cut-out photos, short texts, open stroked arcs). Hover median 0.9 ms (p95 1.7), what a click picks (`selectAt`) median 0.4 ms (p95 1.0), the whole pointer-down handler median 3.1 ms. Headless Chromium, SwiftShader, cloud machine.

## `qa/`: Goldfish QA, before this round's fixes

Taken on 722d210, the build before the review round. A file with `FAIL` in its name is one the QA's script flagged, which is not always a bug:

- Found and fixed in this round: `pen-FAIL-*` and `shapes-FAIL-open-arc-*`, `shapes-FAIL-hover-open-arc-*` (an open path picked in the area its line goes round); `text-FAIL-*bullets-marker` (a left-to-right list's bullet passed the click on); `hover-while-typing-below-lines.png` (the hover outline, while typing, missed the text a click there stays in).
- Kept as notes for later: `photos-FAIL-*faint-5-opacity*`, `misc-FAIL-*` (a photo at 5% paint opacity, a layer at opacity 0, a fill colour at alpha 0 and a black luminance mask are still picked); `containers-FAIL-in-entered-auto-ellipse-corner.png` (inside an auto layout box, a selected child keeps a click on its empty corner).
- Not bugs: the QA's hover checker compared outline boxes, and those layers shared a box with the layer under them. The QA confirmed each by clicks and by eye: `interactions-FAIL-hover-frame-2-*`, `photos-FAIL-hover-turned-90-*`, `screens-FAIL-hover-*`, `shapes-FAIL-hover-turned-*`, `containers-FAIL-hover-locked-*`.

The `*.log` files are the QA scripts' own output, and `perf.log` its timings over 200 layers of other kinds.

## `confirm/`: the fixes, in the running app

Taken on 9ade9cd by a second goldfish, which checked each fix with real input:

- `b1-*`: while typing, a hover after a short line or below the lines no longer outlines the layer underneath; a click there keeps the caret in the text.
- `b2-*`: list bullets and numbers, left to right and right to left, pick their text.
- `b3-*`: an inside or centred stroke over a cut-out photo's clear part picks the photo; the clear part away from the stroke passes through.
- `b4-*`: a clipping box's outside stroke picks the box; a child cut off past the stroke passes through.
- `b5-*`: an open path (pen-drawn or seeded) passes the click on inside the area its line goes round and is picked on and next to its line; closed stroke-only paths are picked anywhere inside.
- `b6-after-drag.png`: a selected open path drags from inside its area, undone and redone.
