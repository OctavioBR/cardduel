# The Match screen is a fixed 19:9 stage scaled to fit, with a separate portrait stage for phones

The Match screen is laid out once at a logical 1520×720 (19:9) and scaled uniformly to fit the window, letterboxed, instead of reflowing with the viewport. Six Rows, a hand, two side panels and the Scores have to stay legible and in fixed relation to each other, and a fluid layout keeps breaking that at in-between sizes. Phones get a second, portrait stage built from the same components (Rows stacked full width, the hand as a scrollable strip, side panels folded into a top bar) rather than a squeezed desktop layout. Every other screen (home, Deck builder, sign-in) is an ordinary fluid responsive page.

## Considered Options

- **One fluid board using container queries**: rejected. Six Rows plus a hand do not stay readable across the in-between sizes.
- **Landscape-only on phones, reusing the desktop stage**: rejected as the end state because cards get tiny. It is the v1 behaviour until the portrait stage ships, with a "rotate your device" notice in portrait.

## Consequences

- The stage was first 16:9 (1280×720). It was widened to 19:9, keeping the 720 height, so the battlefield gets the extra width and modern phones in landscape fill the screen with less letterboxing; 16:9 windows now letterbox top and bottom instead.

- The stage then became flexible between 16:11 and 20:9 so common windows stop letterboxing: it takes the window's shape inside that range and only letterboxes outside it. 1520×720 stays the reference layout. Wider windows keep the 720 height and gain width; squarer ones keep about the reference area, with a 1360 minimum width so a full starting hand fits, and the extra height goes to the Rows. The layout is still scaled uniformly, never reflowed: the Board's columns and Rows stretch, cards keep their size.

- Phones in landscape: the stage fits inside the side safe areas (notch or Dynamic Island), but not the bottom one, since the home indicator only overlays the hand strip's lower edge. On touch screens in landscape the page has some scroll room behind the fixed stage, so a swipe lets the browser collapse its toolbars and the stage grows into the freed height. Mobile browsers only hide their toolbars when the page scrolls, and the Fullscreen API is not available to pages on iPhone.

- Hit-testing for drag-and-drop happens inside a CSS-transformed container, which is why drag is built on pointer events rather than HTML5 drag-and-drop or dnd-kit.
