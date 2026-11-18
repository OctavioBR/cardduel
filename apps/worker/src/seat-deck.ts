import {
  CURRENT_CATALOG_VERSION,
  checkCompetitiveDeck,
  checkValidDeck,
  getCatalog,
} from "@card-duel/catalog";
import type { DeckSpec, FactionId } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import copy from "./strings/en.json";

export type CommittedDeck =
  | { ok: true; deck: DeckSpec; name: string; catalogVersion: string }
  | { ok: false; message: string };

/**
 * Loads one of the account's Decks and checks it can take a Seat: a Valid Deck, and a
 * Competitive Deck for a Competitive Room or the Competitive Queue. The Deck is copied with
 * the current catalog version (ADR-0004), so later edits do not change a committed Deck.
 */
export async function commitDeck(
  db: D1Database,
  accountId: string,
  deckId: string,
  competitive: "room" | "queue" | null,
): Promise<CommittedDeck> {
  const row = await db
    .prepare("SELECT name, faction, leader, cards FROM decks WHERE id = ? AND account_id = ?")
    .bind(deckId, accountId)
    .first<{ name: string; faction: FactionId; leader: string | null; cards: string }>();
  if (!row) return { ok: false, message: copy.thatDeckWasNotFound };
  const version = CURRENT_CATALOG_VERSION;
  if (!version) throw new Error("No catalog version");
  const catalog = getCatalog(version);
  const input = {
    faction: row.faction,
    leader: row.leader,
    cards: JSON.parse(row.cards) as string[],
  };
  const problems = checkValidDeck(input, catalog);
  if (problems.length > 0)
    return {
      ok: false,
      message: formatCopy(copy.isNotAValidDeck, {
        p0: row.name,
        p1: problems.map((p) => p.message).join(" "),
      }),
    };
  if (competitive) {
    const problems = checkCompetitiveDeck(input, catalog);
    if (problems.length > 0)
      return {
        ok: false,
        message: formatCopy(
          competitive === "room" ? copy.thisIsACompetitiveRoomAnd : copy.competitiveQueueNeeds,
          {
            p0: row.name,
            p1: problems.map((p) => p.message).join(" "),
          },
        ),
      };
  }
  return {
    ok: true,
    deck: { faction: input.faction, leader: input.leader as string, cards: input.cards },
    name: row.name,
    catalogVersion: version,
  };
}

/** Remembers the Deck as the account's last used one, Home's default Deck (#108). */
export async function rememberLastDeck(
  db: D1Database,
  accountId: string,
  deckId: string,
): Promise<void> {
  await db
    .prepare("UPDATE accounts SET last_deck_id = ? WHERE id = ?")
    .bind(deckId, accountId)
    .run();
}
