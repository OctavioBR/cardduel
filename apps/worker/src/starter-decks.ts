import { CURRENT_CATALOG_VERSION, getCatalog, starterDeckOf } from "@card-duel/catalog";
import type { FactionId } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import copy from "./strings/en.json";

const FACTION_NAME: Record<FactionId, string> = {
  swarm: copy.swarm,
  court: copy.court,
  kingdom: copy.kingdom,
  vikings: copy.vikings,
  elves: copy.elves,
};

/** A player-owned copy of the current Card Catalog's Starter Deck. */
export function starterDeck(faction: FactionId) {
  if (!CURRENT_CATALOG_VERSION) throw new Error("No catalog version");
  const starter = starterDeckOf(getCatalog(CURRENT_CATALOG_VERSION), faction);
  return {
    name: formatCopy(copy.starter, { p0: FACTION_NAME[faction] }),
    faction,
    leader: starter.leader,
    cards: [...starter.cards],
  };
}
