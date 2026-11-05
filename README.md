# Evidence: feat/457-top-bar-more, review fixes

Screenshots from the `@evidence` tests in `tests/e2e/specs/top-bar/top-bar-more-screens.spec.ts`, in both themes, at 1280×760, 820×1180 and 390×844 (`<name>-<width>-<theme>.png`):

- `bar-<width>`: a text's bar. On a phone it wraps into two cards, Arrange ⋯ ending the first row (D1).
- `shape-<width>`, `text-<width>`: Arrange open for a shape and a text; on a phone, a sheet at the bottom.
- `order-<width>`, `line-up-<width>`: the menu beside Order and Line up, its row lit (D3). On a phone it lies on its row at the sheet's start edge (D5), and Line up's buttons are 44 px, with room between them (D2).
- `locked-<width>`: a locked text's Arrange, Line up, rotation and Text direction greyed, Line up reached by the keyboard showing its tooltip "The layer is locked" (C1, C2).
- `wrapped-760`: at 760×900, Arrange ends the first row after More controls, with the second row open (C3).
