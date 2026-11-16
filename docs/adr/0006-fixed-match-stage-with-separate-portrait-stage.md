# The Match screen is a fixed 16:9 stage scaled to fit, with a separate portrait stage for phones

The Match screen is laid out once at a logical 1280×720 and scaled uniformly to fit the window, letterboxed, instead of reflowing with the viewport. Six Rows, a hand, two side panels and the Scores have to stay legible and in fixed relation to each other, and a fluid layout keeps breaking that at in-between sizes. Phones get a second, portrait stage built from the same components (Rows stacked full width, the hand as a scrollable strip, side panels folded into a top bar) rather than a squeezed desktop layout. Every other screen (home, Deck builder, sign-in) is an ordinary fluid responsive page.

## Considered Options

- **One fluid board using container queries**: rejected. Six Rows plus a hand do not stay readable across the in-between sizes.
- **Landscape-only on phones, reusing the desktop stage**: rejected as the end state because cards get tiny. It is the v1 behaviour until the portrait stage ships, with a "rotate your device" notice in portrait.

## Consequences

- Hit-testing for drag-and-drop happens inside a CSS-transformed container, which is why drag is built on pointer events rather than HTML5 drag-and-drop or dnd-kit.
