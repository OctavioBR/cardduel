import { describe, expect, it } from "vitest";
import { cardDef, catalog } from "../cards/strings";
import { countCopies, deckCounters, deckGroups, poolCards } from "./pool";

const cards = catalog?.cards ?? [];
const all = { row: "all", type: "all", ability: "all" } as const;

describe("pool", () => {
  it("shows the Faction's cards and Neutral Cards, never Leaders or the other Faction", () => {
    const pool = poolCards(cards, "swarm", all);
    expect(
      pool.every((c) => c.kind !== "leader" && (c.faction === "swarm" || c.faction === "neutral")),
    ).toBe(true);
    expect(pool.some((c) => c.faction === "neutral")).toBe(true);
  });

  it("sorts Units by Strength, highest first, then by name; Special Cards after all Units", () => {
    const pool = poolCards(cards, "court", all);
    const firstSpecial = pool.findIndex((c) => c.kind === "special");
    expect(pool.slice(firstSpecial).every((c) => c.kind === "special")).toBe(true);
    const strengths = pool.slice(0, firstSpecial).map((c) => (c.kind === "unit" ? c.strength : 0));
    expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
  });

  it("filters by Row (Agile counts for Close and Ranged), type and ability", () => {
    const ranged = poolCards(cards, "swarm", { ...all, row: "ranged" });
    expect(ranged.map((c) => c.id)).toContain("swarm-gale-shrike");
    expect(
      poolCards(cards, "swarm", { ...all, type: "hero" }).every((c) => c.kind === "unit" && c.hero),
    ).toBe(true);
    expect(poolCards(cards, "swarm", { ...all, ability: "muster" }).map((c) => c.id)).toContain(
      "swarm-burrow-gnawer",
    );
  });

  it("counts copies and the Deck's live counters, and groups the Deck by Row", () => {
    const deck = [
      "swarm-needle-wing",
      "swarm-needle-wing",
      "swarm-bone-warlord",
      "neutral-war-drum",
    ];
    expect(countCopies(deck).get("swarm-needle-wing")).toBe(2);
    expect(deckCounters(deck, cardDef)).toEqual({ units: 3, specials: 1, strength: 14, heroes: 1 });
    expect(
      deckGroups(deck, cardDef).map((g) => [g.label, g.entries.map((e) => [e.def.id, e.count])]),
    ).toEqual([
      ["Close", [["swarm-bone-warlord", 1]]],
      ["Ranged", [["swarm-needle-wing", 2]]],
      ["Special Cards", [["neutral-war-drum", 1]]],
    ]);
  });
});
