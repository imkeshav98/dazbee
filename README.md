# Evidence: the top bar without duplicates (#498)

Screenshots from branch `feat/498-top-bar` (taken at commit 539a7e4), taken by the `@evidence` tests in `tests/e2e/specs/top-bar/bar-screens.spec.ts` on the top bar test design, at 1280×760, 820×1180 and 390×844 (touch) in dark and light: `shots/<state>-<width>x<height>-<theme>.png`. The first 14 states carry the names of the approved mock's pictures on `mock/498`.

| State | What it shows |
|---|---|
| `1-text` | A text's bar: font, size, colour, Text style ▾, Align ▾, list, case, Spacing, Effects, Transparency, Position. On a phone, two rows of 44 px targets 8 px apart, Position's icon ending the first; every button with an icon shows it alone there, named by its label |
| `2-shape` | A star's bar, ending with Position |
| `3-photo` | A photo's bar: Edit, Replace, Crop, Corners, Outline, Effects, Transparency, Position (icons alone on a phone) |
| `4-box` | A box's bar, ending with Position |
| `5-several` | Two layers: the bar ends with Line up ▾ then Position, together on the first row |
| `6-locked` | A locked layer: Locked, Unlock, Position |
| `7-align-open` | Align ▾ open: rows Align, Direction, Vertical |
| `8-position` | Position for a text: W, H, X, Y, Rotate and Lock ratio, Order, Line up with the frame in two rows of three (Backward and To back greyed, the text being at the back) |
| `9-position-locked` | Position for a locked layer, X reached by the keyboard: greyed with "The layer is locked" just above it; Order live |
| `10-position-several` | Position for two layers: no Line up |
| `11-position-turned` | A turned layer: the button reads Position ↻ 30° (on a phone its icon and the angle) |
| `option-R2` | The turned layer's bar alone |
| `option-S1` | Text style ▾ open: Bold, Italic, Underline, Strikethrough |
| `option-T1` | Align ▾ open (as 7) |
| `styles-on` | Bold and Italic on: Text style tinted, named "Text style: Bold, Italic" |
| `styles-on-open` | The same with its pop-up open, the two toggles pressed |
| `rtl-text-align-open` | Right-to-left text in the English app: Direction on Right to left, the Align icon drawn right-aligned for Start |
| `arabic-text` | The app in Arabic: a text's bar, mirrored |
| `arabic-align-open` | The app in Arabic: Align ▾, every direction whole |
| `arabic-position` | The app in Arabic: Position, every label whole |
