# Layers panel lists frames: after the review fixes

Screenshots from `feat/458-layers-frames`, taken in Chromium by the layers-frames specs.

- `layers-frames-<width>-<theme>-<n>.png`, at 1280×760, 820×1180 and 390×844, dark and light, from the `@evidence` tests in `layers-frames-screens.spec.ts`:
  1. the page's frames, closed;
  2. a layer deep in groups selected on the canvas, its frame and groups open;
  3. a frame picked from its row, brought out from under the panel;
  4. hidden and locked rows, one hovered, the story open too;
  5. the keyboard focus on a frame row.
- `layers-frames-390-touch-toggles.png`: 390×844 on a touch screen; every row shows its hide and lock as 44 px targets 8 px apart, in 44 px rows.
- `layers-frames-ar.png`: Arabic; the frame sizes read width × height, as the canvas labels do, and "only here" ends where the sizes do.
