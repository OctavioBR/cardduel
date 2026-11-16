# Run on the Cloudflare Workers Free plan as a single Worker

Hosting cost must be as close to zero as possible, so the whole backend targets the Cloudflare Workers Free plan: one Worker serves the static web client (including card images as static assets), the HTTP API (accounts, Decks, Room creation) and the WebSocket upgrade into Room Durable Objects. The rules engine is a shared package imported by both the Worker and the client.

## Consequences

- The Free plan caps CPU at ~10ms per request. Anything CPU-heavy (notably password hashing, see ADR-0005) must be tuned to fit or will be throttled. Moving to Workers Paid ($5/month, 30s CPU) is the planned escape hatch before a public launch, not a redesign.
- Daily Free quotas (100k requests, 13,000 GB-s Durable Object duration) shape later choices, e.g. WebSocket hibernation in ADR-0002.
