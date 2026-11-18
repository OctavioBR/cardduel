import {
  CURRENT_CATALOG_VERSION,
  checkCompetitiveDeck,
  checkValidDeck,
  type DeckProblem,
  getCatalog,
} from "@card-duel/catalog";
import type { FactionId } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import type { Account } from "./auth/session";
import { json } from "./http";
import copy from "./strings/en.json";

const FACTIONS: FactionId[] = ["swarm", "court"];
export const MAX_DECK_NAME = 40;
/** A generous cap on stored card ids; a Valid Deck needs far fewer. */
export const MAX_DECK_CARDS = 80;

export interface DeckRow {
  id: string;
  name: string;
  faction: FactionId;
  leader: string | null;
  cards: string;
  updated_at: number;
}

export interface DeckJson {
  id: string;
  name: string;
  faction: FactionId;
  leader: string | null;
  cards: string[];
  updatedAt: number;
  catalogVersion: string;
  /** Valid Deck problems (empty: it can take a Seat) and Competitive Deck problems (warnings). */
  problems: { valid: DeckProblem[]; competitive: DeckProblem[] };
}

function catalog() {
  if (!CURRENT_CATALOG_VERSION) throw new Error("No catalog version");
  return getCatalog(CURRENT_CATALOG_VERSION);
}

export function toJson(row: DeckRow): DeckJson {
  const cards = JSON.parse(row.cards) as string[];
  const deck = { faction: row.faction, leader: row.leader, cards };
  const c = catalog();
  return {
    id: row.id,
    name: row.name,
    faction: row.faction,
    leader: row.leader,
    cards,
    updatedAt: row.updated_at,
    catalogVersion: c.version,
    problems: { valid: checkValidDeck(deck, c), competitive: checkCompetitiveDeck(deck, c) },
  };
}

function badRequest(message: string): Response {
  return json({ error: "bad_request", message }, { status: 400 });
}

/** Reads and checks a Deck body; every field is optional for updates. */
async function readDeckBody(
  request: Request,
): Promise<
  { name?: string; faction?: FactionId; leader?: string | null; cards?: string[] } | Response
> {
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return json({ error: "bad_request", message: copy.sendJSON }, { status: 415 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return badRequest(copy.sendAJSONObject);
  const out: { name?: string; faction?: FactionId; leader?: string | null; cards?: string[] } = {};
  if (body.name !== undefined) {
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > MAX_DECK_NAME
    ) {
      return badRequest(formatCopy(copy.aDeckNameHas1To, { p0: MAX_DECK_NAME }));
    }
    out.name = body.name.trim();
  }
  if (body.faction !== undefined) {
    if (!FACTIONS.includes(body.faction as FactionId)) return badRequest(copy.unknownFaction);
    out.faction = body.faction as FactionId;
  }
  if (body.leader !== undefined) {
    if (body.leader !== null && typeof body.leader !== "string")
      return badRequest(copy.theLeaderIsACardId);
    out.leader = body.leader as string | null;
  }
  if (body.cards !== undefined) {
    if (
      !Array.isArray(body.cards) ||
      body.cards.length > MAX_DECK_CARDS ||
      !body.cards.every((c) => typeof c === "string" && c.length <= 64)
    ) {
      return badRequest(formatCopy(copy.cardsAreAListOfAt, { p0: MAX_DECK_CARDS }));
    }
    out.cards = body.cards as string[];
  }
  return out;
}

async function ownDeck(db: D1Database, account: Account, id: string): Promise<DeckRow | null> {
  return db
    .prepare(
      "SELECT id, name, faction, leader, cards, updated_at FROM decks WHERE id = ? AND account_id = ?",
    )
    .bind(id, account.id)
    .first<DeckRow>();
}

const notFound = () => json({ error: "not_found", message: copy.noSuchDeck }, { status: 404 });

/** Routes under /api/decks for the signed-in account. Another player's Deck is a 404. */
export async function handleDecks(
  request: Request,
  db: D1Database,
  account: Account,
  path: string,
): Promise<Response> {
  const method = request.method;
  if (path === "" || path === "/") {
    if (method === "GET") {
      const faction = new URL(request.url).searchParams.get("faction");
      const query = faction
        ? db
            .prepare(
              "SELECT id, name, faction, leader, cards, updated_at FROM decks WHERE account_id = ? AND faction = ? ORDER BY updated_at DESC",
            )
            .bind(account.id, faction)
        : db
            .prepare(
              "SELECT id, name, faction, leader, cards, updated_at FROM decks WHERE account_id = ? ORDER BY updated_at DESC",
            )
            .bind(account.id);
      const [{ results }, last] = await Promise.all([
        query.all<DeckRow>(),
        db
          .prepare("SELECT last_deck_id FROM accounts WHERE id = ?")
          .bind(account.id)
          .first<{ last_deck_id: string | null }>(),
      ]);
      // Newest edit first; Home defaults to the last used Deck, else the first Valid one (#108).
      return json({ decks: results.map(toJson), lastDeckId: last?.last_deck_id ?? null });
    }
    if (method === "POST") {
      const body = await readDeckBody(request);
      if (body instanceof Response) return body;
      if (!body.faction) return badRequest(copy.chooseAFaction);
      return insertDeck(db, account, {
        name: body.name ?? copy.newDeck,
        faction: body.faction,
        leader: body.leader ?? null,
        cards: body.cards ?? [],
      });
    }
    return json({ error: "method_not_allowed" }, { status: 405 });
  }

  if (path === "/copy-starter" && method === "POST") {
    const body = await readDeckBody(request);
    if (body instanceof Response) return body;
    if (!body.faction) return badRequest(copy.chooseAFaction);
    const starter = catalog().starterDecks[body.faction];
    return insertDeck(db, account, {
      name:
        body.name ??
        formatCopy(copy.starter, { p0: body.faction === "swarm" ? copy.swarm : copy.court }),
      faction: body.faction,
      leader: starter.leader,
      cards: [...starter.cards],
    });
  }

  const id = path.match(/^\/([A-Za-z0-9-]{1,64})$/)?.[1];
  if (!id) return json({ error: "not_found" }, { status: 404 });
  const row = await ownDeck(db, account, id);
  if (!row) return notFound();
  if (method === "GET") return json({ deck: toJson(row) });
  if (method === "DELETE") {
    await db
      .prepare("DELETE FROM decks WHERE id = ? AND account_id = ?")
      .bind(id, account.id)
      .run();
    return new Response(null, { status: 204 });
  }
  if (method === "PUT" || method === "PATCH") {
    const body = await readDeckBody(request);
    if (body instanceof Response) return body;
    if (body.faction && body.faction !== row.faction)
      return badRequest(copy.aDeckSFactionCannotChange);
    const next: DeckRow = {
      ...row,
      name: body.name ?? row.name,
      leader: body.leader !== undefined ? body.leader : row.leader,
      cards: body.cards ? JSON.stringify(body.cards) : row.cards,
      updated_at: Date.now(),
    };
    await db
      .prepare(
        "UPDATE decks SET name = ?, leader = ?, cards = ?, updated_at = ? WHERE id = ? AND account_id = ?",
      )
      .bind(next.name, next.leader, next.cards, next.updated_at, id, account.id)
      .run();
    return json({ deck: toJson(next) });
  }
  return json({ error: "method_not_allowed" }, { status: 405 });
}

async function insertDeck(
  db: D1Database,
  account: Account,
  deck: { name: string; faction: FactionId; leader: string | null; cards: string[] },
): Promise<Response> {
  const row: DeckRow = {
    id: crypto.randomUUID(),
    name: deck.name,
    faction: deck.faction,
    leader: deck.leader,
    cards: JSON.stringify(deck.cards),
    updated_at: Date.now(),
  };
  await db
    .prepare(
      "INSERT INTO decks (id, account_id, name, faction, leader, cards, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(row.id, account.id, row.name, row.faction, row.leader, row.cards, row.updated_at)
    .run();
  return json({ deck: toJson(row) }, { status: 201 });
}
