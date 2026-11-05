# Evidence: a hover passing through faint layers (#508)

Each screenshot shows the faint frame at one screen size and theme, the pointer ring over one faint
layer, and the hover outline on the green floor beneath it, the layer a click and a tap there pick.

`faint-hover-<case>-<size>-<theme>.png`:

- `zero`: a blue square at opacity 0 (top left).
- `clearFill`: a square whose fill has alpha 0, with a dark stroke that still shows (top right); the pointer is inside it, off the stroke.
- `blackMask`: a purple square under a black luminance mask (bottom left).
- `faintPhoto`: the cut-out photo at 5% opacity, on its opaque middle (bottom right).

Sizes 1280x760, 820x1180 and 390x844; themes dark and light.
