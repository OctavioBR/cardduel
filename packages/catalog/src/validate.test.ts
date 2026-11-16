import type { CardDefinition } from "@card-duel/engine";
import { describe, expect, it } from "vitest";
import released from "../data/released.json";
import { fingerprint, getCatalog } from "./index";
import { fixtureCatalog } from "./testing";
import type { CatalogData } from "./types";
import { validateCatalog } from "./validate";
import { CATALOG_VERSIONS, CURRENT_CATALOG_VERSION } from "./versions";

describe("validateCatalog", () => {
  it("accepts the fixture catalog", () => {
    expect(validateCatalog(fixtureCatalog())).toEqual([]);
  });

  it("rejects a deliberately broken catalog with readable errors", () => {
    const data = fixtureCatalog();
    const broken: CatalogData = {
      ...data,
      cards: [
        ...data.cards,
        {
          id: "Bad Id",
          kind: "unit",
          faction: "swarm",
          strength: 1,
          row: "close",
          hero: false,
          abilities: [],
          maxCopies: 3,
        },
        { ...(data.cards[0] as CardDefinition) },
        {
          id: "summoner",
          kind: "unit",
          faction: "swarm",
          strength: -1,
          row: "middle" as "close",
          hero: false,
          abilities: ["summon" as "spy", "muster"],
          maxCopies: 0,
        },
        {
          id: "nimble-swarmling",
          kind: "unit",
          faction: "swarm",
          strength: 2,
          row: "close",
          hero: false,
          abilities: ["agile", "muster"],
          musterGroup: "brood",
          maxCopies: 3,
        },
        {
          id: "mardroeme",
          kind: "special",
          faction: "neutral",
          maxCopies: 3,
          effect: { type: "mardroeme" as "horn" },
        },
        {
          id: "passive-lord",
          kind: "leader",
          faction: "court",
          maxCopies: 2,
          ability: { type: "passive" } as never,
        },
      ],
      strings: { en: { ...data.strings.en, ghost: { name: "Ghost", text: "" } } },
      starterDecks: {
        ...data.starterDecks,
        court: { ...data.starterDecks.court, cards: ["court-unit-1"] },
      },
    };
    const errors = validateCatalog(broken);
    expect(errors).toContain('Card "swarm-unit-1": duplicate id.');
    expect(errors).toContain('Card "summoner": strength must be a whole number.');
    expect(errors).toContain('Card "summoner": unknown Row "middle".');
    expect(errors).toContain('Card "summoner": ability "summon" is not in v1.');
    expect(errors).toContain('Card "summoner": a Muster card needs a musterGroup.');
    expect(errors).toContain('Card "summoner": maxCopies must be at least 1.');
    expect(errors).toContain('Card "mardroeme": effect "mardroeme" is not in v1.');
    expect(errors).toContain(
      'Card "passive-lord": Leader ability "passive" is not an approved v1 kind.',
    );
    expect(errors).toContain('Card "passive-lord": a Leader has maxCopies 1.');
    expect(errors).toContain(
      'Muster group "brood": Agile card "nimble-swarmling" is not allowed in a Muster group.',
    );
    expect(errors).toContain('Card "summoner": missing en name.');
    expect(errors).toContain('Strings: "ghost" has strings but no card.');
    expect(errors.some((e) => e.includes("id must be lowercase"))).toBe(true);
  });

  it("requires every Starter Deck to be a Competitive Deck", () => {
    const data = fixtureCatalog();
    data.starterDecks.court.cards.push("frost", "frost", "frost", "horn", "horn", "horn");
    expect(validateCatalog(data)).toEqual([
      "Starter Deck for court is not a Competitive Deck: Competitive Decks hold at most 5 Special Cards (has 6).",
    ]);
  });
});

describe("catalog versions", () => {
  it("every version is valid and loadable, and the current one is the newest", () => {
    for (const data of CATALOG_VERSIONS) {
      expect(validateCatalog(data), data.version).toEqual([]);
      expect(getCatalog(data.version).byId.size).toBe(data.cards.length);
    }
    expect(CURRENT_CATALOG_VERSION).toBe(CATALOG_VERSIONS.at(-1)?.version ?? null);
  });

  it("released versions are never edited in place", () => {
    const locks = released as Record<string, string>;
    for (const [version, print] of Object.entries(locks)) {
      const data = CATALOG_VERSIONS.find((v) => v.version === version);
      expect(data, `released version ${version} must stay loadable`).toBeDefined();
      expect(
        fingerprint(data as CatalogData),
        `released version ${version} changed; make a new version`,
      ).toBe(print);
    }
  });

  it("fingerprints change when card data changes", () => {
    const a = fixtureCatalog();
    const b = fixtureCatalog();
    expect(fingerprint(a)).toBe(fingerprint(b));
    (b.cards[0] as { strength: number }).strength += 1;
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });
});
