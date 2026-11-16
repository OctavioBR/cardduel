# English product copy

Production web copy lives in `apps/web/src/strings/en.json`; feature namespaces may also provide their own `strings/en.json`. Account and Room API messages live in the Worker equivalent. Deck validation copy lives in the catalog package and Match rejection copy in the engine package. Card names and ability text remain in the versioned catalog language data.

Dynamic messages use `formatCopy` with named replacement values. Replacement text is literal: usernames containing `$&` or braces cannot change a message template. Keep whitespace that belongs between adjacent JSX expressions in the language entry. Choose separate complete templates for singular and plural copy.

## Literal audit exclusions

The production-source review excludes CSS classes, inline transforms, SVG paths, routes and URLs, protocol discriminants, card IDs, HTTP headers and cookie syntax, SQL, keyboard event keys, and ARIA role identifiers. These are machine identifiers rather than translated text. Empty decorative image alt text and punctuation/number separators do not require language entries. User-provided Deck names and account usernames are data. Numeric Scores and counts are data; surrounding labels are language entries.

Development-only pages, Local Room scenario diagnostics, test fixtures, internal thrown invariant errors, validation of catalog authoring data and server console diagnostics remain outside the product-copy pass. The animation plan's displayed Round result text is included; its DOM selectors and animation CSS stay technical literals.
