import { CURRENT_CATALOG_VERSION, getCatalog } from "@card-duel/catalog";
import type { FactionId } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import copy from "./strings/en.json";

/** A player-owned copy of the current Card Catalog's Starter Deck. */
export function starterDeck(faction: FactionId) {
  if (!CURRENT_CATALOG_VERSION) throw new Error("No catalog version");
  const starter = getCatalog(CURRENT_CATALOG_VERSION).starterDecks[faction];
  return {
    name: formatCopy(copy.starter, { p0: faction === "swarm" ? copy.swarm : copy.court }),
    faction,
    leader: starter.leader,
    cards: [...starter.cards],
  };
}
