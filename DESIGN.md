# Design: BBCA dark workspace

Adapted from the user's DESIGN-apple.md reference to a dark data-entry product. A true-black canvas, clean system typography, open market figures, restrained Action Blue, and one pill-shaped primary action. No card grid, decorative gradient, glow, or shadow.

- Display font: SF Pro Display when installed, with native system fallbacks; headings use `--font-display`. Body uses `--font-body`.
- Root tokens define all colors. Blue is reserved for actions and keyboard focus; market values stay neutral.
- The instrument and session quote form one open typographic group, not separate cards.
- Input and result areas share one open composition divided by a single hairline. Only form controls are rounded; tablet and mobile stack naturally.
- Persistent input labels, 44px touch targets, tabular numbers, and visible focus states.
- Only actual quotes and model responses. Preserve timestamps, honest errors, and empty states.
- Content sections retain `data-od-id`. No promotional metrics or unnecessary imagery.
