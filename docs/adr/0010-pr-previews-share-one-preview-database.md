# PR Previews share one Preview database

Every pull request from a branch in this repo gets a PR Preview: a Cloudflare Worker Preview (`wrangler preview --name pr-<number>`) of the `card-duel` Worker, built from that PR and linked in a PR comment. Each PR Preview gets its own Durable Object namespaces, so Rooms and the Matchmaker never cross between PR Previews or reach production. All PR Previews bind one remote D1 database, `card-duel-preview`, through the `previews` block of `wrangler.jsonc`. It is separate from production and from the local `.wrangler` database. A PR Preview deploy applies that PR's migrations to it.

PR Previews are served at `pr-<number>.cardduel.ooctav.io`, through `previews_enabled` on the production Custom Domain. They use the development Clerk instance, and `APP_ORIGIN` allows exactly the PR Preview's own URL.

## Considered Options

- **A D1 database per PR**: rejected. Creating, migrating and deleting a database on every PR adds lifecycle code and leaves orphans when cleanup fails. Each new PR Preview would also start without accounts or Decks.
- **Bind the production database**: rejected. A PR's migrations would run against production data before review.
- **Serve PR Previews on workers.dev**: rejected. Wrangler only gives a Preview a workers.dev URL when the Worker's `preview_urls` is true, and that flag also exposes every production version at a public workers.dev URL. `preview_urls` stays false.
- **Cloudflare Access in front of PR Previews**: rejected. Clerk sign-in already gates Decks and Rooms.

## Consequences

- One PR's migration can break other open PR Previews, and an abandoned PR leaves its schema behind. The **Reset Preview database** workflow drops every table and applies `main`'s migrations, erasing all PR Preview accounts and Decks.
- An account and its Decks created on one PR Preview appear on every other PR Preview, and never in production.
- Turning on `previews_enabled` reaches Cloudflare only through a production deploy, which stays manual (`deploy.yml`). PR Previews get no URL until that deploy has run once.
- Cloudflare adds `X-Robots-Tag: noindex` only to workers.dev Previews. The PR Preview workflow writes a static-assets `_headers` file into its own build to add it. Production builds never get that file.
