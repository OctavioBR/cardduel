import type { FactionId } from "@card-duel/engine";
import copy from "../strings/en.json";

/** Every playable Faction, in the order the Decks page shows them. */
export const FACTIONS: readonly FactionId[] = ["swarm", "court", "kingdom", "vikings", "elves"];

export const FACTION_NAME: Record<FactionId, string> = {
  swarm: copy.swarm,
  court: copy.court,
  kingdom: copy.kingdom,
  vikings: copy.vikings,
  elves: copy.elves,
};
