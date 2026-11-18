# AGENTS.md

## Content

Name every card, Faction and UI concept from `GLOSSARY.md`. `assets/` is reference only: never ship it or derive card content from it.

## Before pushing

Run `pnpm check` (what CI runs: typecheck, lint, test, e2e). e2e needs Playwright Chromium once: `pnpm --filter @card-duel/web exec playwright install chromium`.

## Docs by task

- Writing user-facing text or error messages: `docs/agents/ui-copy.md`
- UI or keyboard/screen-reader changes: `docs/accessibility/v1.md`
- Domain terms and past decisions: `GLOSSARY.md`, `docs/adr/` (see `docs/agents/domain.md`)

## Cloudflare

Worker dev, deploy and D1 migrations: the `apps/worker` scripts (Wrangler). Account-level resources outside the Worker: `cf` CLI.

## Agent skills

- Issue tracker: GitHub Issues via `gh`; see `docs/agents/issue-tracker.md`.
- Triage labels: see `docs/agents/triage-labels.md`.
