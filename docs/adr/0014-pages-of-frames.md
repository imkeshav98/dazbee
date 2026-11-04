# Pages of frames, each owning its layers

A design holds pages, and each page holds frames placed freely on its canvas. A frame has its own name, width, height, position on the page and background, and it owns its layers: a top-level layer's parent is its frame. There is no grid of pages × sizes, no primary format, no design kind, no page background and no overrides map.

Layers made from one another share a **link id**. Duplicating a frame, Add size, a paste onto another frame on the same page, and Copy to other frames ▸ Layer copy layers and keep their link ids; every other way of making a layer gives it a new one. A frame holds at most one copy of a link id, and link ids never cross pages. Copy to other frames, `Ctrl+Alt+A` and the "in all frames" actions find a layer's copies by its link id.

Because each frame owns its copies, every edit stays in its frame with no exception: text keeps its character-level merging, and order, grouping, masks, names, bindings, hide and lock are each copy's own. The cost is size: a design holds one copy of each layer per frame, about twice the grid's size on the big-carousel benchmark (`tests/pixels/src/big-carousel.ts`, 20 cards × 5 sizes: 152 KB as the grid with overrides, 332 KB as copies). The limit is under 1 MB and under 300 ms to open, at 20 cards.

The layer type that users see as Box is named `box` in code, so "frame" means one thing in the app and in the code.

Designs made before this change are not converted (`docs/agents/code-layout.md`, Data).

This replaces ADR-0003's reason for one document per design (masters and spanning layers): the design stays one Yjs document because Copy to other frames changes several frames in one undo step. ADR-0007's scopes become: variant within a frame and variant; a value meant for every size of an ad is keyed by link id.

## Considered Options

- **One layer tree per page, each layer recording the frames it appears in, each frame keeping its own values as overrides**: rejected. Order, parent, grouping, masks, names, bindings, lock and a text layer's characters live on the shared layer, so they would reach every frame and break "every edit stays in its frame"; making them per frame needs new storage for each and a membership rule a dozen commands must keep.
- **A primary frame whose edits reach the others** (Figma Sites, Google Web Designer): rejected by Keshav, because an edit's reach would depend on which frame it was made in.
- **Copies kept in step by a push action, with no link** (Creatopy, InDesign): rejected. Without a link id nothing knows two headlines are the same layer, so Copy to other frames and `Ctrl+Alt+A` could only guess by name.
