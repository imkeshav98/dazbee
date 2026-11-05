# Screenshots: `fix/488-phone-swatches` (#488), second round

Taken by the `@evidence` tests in `tests/e2e/specs/edit-panel/look-cards.spec.ts`, against the branch's built web app. A brand kit of 8 colours, the frames-on-canvas test design.

Each file is `swatches-<width>-<theme>-<panel>[-<control>].png`:

| Panel | What it shows |
| ----- | ------------- |
| 1 | A shape's Colour panel, + open, two fills |
| 2 | A frame's Background panel, + open, two background colours |
| 3 | A shape's Outline panel, two outlines |
| 4 | A shape's Colour panel with a line gradient in its paint editor |
| 5 | A text's Colour panel, + open |
| 6 | A shape's Effects panel with a drop shadow |

On a phone (`phone/`, 390×844, dark and light) each panel has one picture per control, scrolled into view:

| Control | What it is |
| ------- | ---------- |
| `kit` | The brand kit's colours |
| `design` | The colours in the design, with + |
| `paint-editor` | The paint editor's brand colours |
| `colour-box` | The box beside a colour field's hex |
| `paint-swatch` | A fill's or an outline's swatch, at the start of its row |
| `stops` | A gradient's stops on their bar |
| `popup` | The paint pop-up of the panel's first row |

`tablet/` (820×1180) and `desktop/` (1280×760) have each panel and its pop-up, in both themes.
