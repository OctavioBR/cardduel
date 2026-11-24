# cardduel

An online two-player card game played over rounds on a three-row battlefield.

## Development

`pnpm dev` runs the web app (Vite, http://localhost:5173) and the Worker together. `pnpm check` runs what CI runs: typecheck, lint, unit tests and end-to-end tests.

### Dev-only routes

These pages exist only in the Vite dev server (`import.meta.env.DEV`); production builds leave them out. They need no sign-in and no Worker: the Match engine runs in the browser.

| Route | What it shows |
|---|---|
| `/dev/local` | A **Local Room**: one browser plays both Seats of a Match. The **Local Room · looking at** box (top right) switches between Seat 1 and Seat 2. |
| `/dev/cards` | The **card gallery**: every card of the current Card Catalog at every size, with raised and lowered Strength. |

`/dev/local` takes these query parameters:

| Parameter | Values | Default |
|---|---|---|
| `seed` | Any number. The same seed and the same actions give the same Match. | `1` |
| `deck` | `plain`: plain Units only. `starter`: the v1 Starter Decks, Swarm against Court. `v2`: the v2 Starter Decks, Kingdom against Vikings. `elves`: the v2 Starter Decks, Elves against Vikings. | `plain` |
| `scenario` | A fixed board for working on one part of the Match UI; when set, `seed` and `deck` are ignored. `scorch`, `horn` and `medic`, or `leader-<kind>` for a Leader ability: `playWeatherFromDeck`, `clearWeather`, `hornRow`, `scorchRow`, `returnFromDiscard`, `drawChosenFromDeck`, `lookAtOpponentHand`. | none |

Examples: `/dev/local?seed=7&deck=starter`, `/dev/local?deck=elves`, `/dev/local?scenario=leader-hornRow`.
