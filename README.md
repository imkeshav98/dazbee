# Select across frames (#460): screenshots

Taken by the `@evidence` tests in `tests/e2e/specs/canvas/select-across-frames.spec.ts` on branch `feat/460-select-across-frames`, at 1280×760, 820×1180 and 390×844 (touch), in the dark and light themes.

In every picture the headline is selected in two linked frames, Feed square and Landscape: Ctrl+Alt+A selected its copies in every linked frame, then Shift and a click took the Story's copy out again.

- The Feed square's copy has the selection box and its size; the Landscape's copy has its own solid outline; the Story's unselected copy has the dashed outline of a linked copy.
- The labels of both frames that hold a selected copy are in the accent colour.

| File | What it shows |
| --- | --- |
| `select-across-<width>-<theme>-1-bar.png` | The top bar for the two copies: their font sizes differ (110 and 72), so the size field shows `--`, its Mixed hint. On the phone the stage has moved so the bar covers no selected frame's label. |
| `select-across-<width>-<theme>-2-position.png` | The same selection with the Position panel open: W, H, X and Y differ between the copies and read Mixed. The panel's header says "2 layers". |

`<width>` is 1280, 820 or 390; `<theme>` is dark or light.
