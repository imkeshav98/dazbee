# Evidence: fix/504-paint-targets

The paint editor that + opens under "In this design", from `specs/edit-panel/paint-targets.spec.ts` (@evidence).

File names: `paint-<width>[-touch]-<theme>-<panel>-<fill>.png`. `-touch` is a touch screen (hasTouch, isMobile). Panel `1` is a shape's Colour panel and `2` a frame's Background panel. Fill is `solid`, `line` (a line gradient) or `image` (the Background panel only: an image makes a shape a photo, whose bar has no Colour).

| File | Shows |
| --- | --- |
| `paint-1280-dark-1-line.png` | 1280, dark, shape's Colour panel, line |
| `paint-1280-dark-1-solid.png` | 1280, dark, shape's Colour panel, solid |
| `paint-1280-dark-2-image.png` | 1280, dark, frame's Background panel, image |
| `paint-1280-dark-2-line.png` | 1280, dark, frame's Background panel, line |
| `paint-1280-dark-2-solid.png` | 1280, dark, frame's Background panel, solid |
| `paint-1280-light-1-line.png` | 1280, light, shape's Colour panel, line |
| `paint-1280-light-1-solid.png` | 1280, light, shape's Colour panel, solid |
| `paint-1280-light-2-image.png` | 1280, light, frame's Background panel, image |
| `paint-1280-light-2-line.png` | 1280, light, frame's Background panel, line |
| `paint-1280-light-2-solid.png` | 1280, light, frame's Background panel, solid |
| `paint-390-touch-dark-1-line.png` | 390 touch, dark, shape's Colour panel, line |
| `paint-390-touch-dark-1-solid.png` | 390 touch, dark, shape's Colour panel, solid |
| `paint-390-touch-dark-2-image.png` | 390 touch, dark, frame's Background panel, image |
| `paint-390-touch-dark-2-line.png` | 390 touch, dark, frame's Background panel, line |
| `paint-390-touch-dark-2-solid.png` | 390 touch, dark, frame's Background panel, solid |
| `paint-390-touch-light-1-line.png` | 390 touch, light, shape's Colour panel, line |
| `paint-390-touch-light-1-solid.png` | 390 touch, light, shape's Colour panel, solid |
| `paint-390-touch-light-2-image.png` | 390 touch, light, frame's Background panel, image |
| `paint-390-touch-light-2-line.png` | 390 touch, light, frame's Background panel, line |
| `paint-390-touch-light-2-solid.png` | 390 touch, light, frame's Background panel, solid |
| `paint-820-dark-1-line.png` | 820, dark, shape's Colour panel, line |
| `paint-820-dark-1-solid.png` | 820, dark, shape's Colour panel, solid |
| `paint-820-dark-2-image.png` | 820, dark, frame's Background panel, image |
| `paint-820-dark-2-line.png` | 820, dark, frame's Background panel, line |
| `paint-820-dark-2-solid.png` | 820, dark, frame's Background panel, solid |
| `paint-820-light-1-line.png` | 820, light, shape's Colour panel, line |
| `paint-820-light-1-solid.png` | 820, light, shape's Colour panel, solid |
| `paint-820-light-2-image.png` | 820, light, frame's Background panel, image |
| `paint-820-light-2-line.png` | 820, light, frame's Background panel, line |
| `paint-820-light-2-solid.png` | 820, light, frame's Background panel, solid |
| `paint-820-touch-dark-1-line.png` | 820 touch, dark, shape's Colour panel, line |
| `paint-820-touch-dark-1-solid.png` | 820 touch, dark, shape's Colour panel, solid |
| `paint-820-touch-dark-2-image.png` | 820 touch, dark, frame's Background panel, image |
| `paint-820-touch-dark-2-line.png` | 820 touch, dark, frame's Background panel, line |
| `paint-820-touch-dark-2-solid.png` | 820 touch, dark, frame's Background panel, solid |
| `paint-820-touch-light-1-line.png` | 820 touch, light, shape's Colour panel, line |
| `paint-820-touch-light-1-solid.png` | 820 touch, light, shape's Colour panel, solid |
| `paint-820-touch-light-2-image.png` | 820 touch, light, frame's Background panel, image |
| `paint-820-touch-light-2-line.png` | 820 touch, light, frame's Background panel, line |
| `paint-820-touch-light-2-solid.png` | 820 touch, light, frame's Background panel, solid |
