import { env, SELF } from "cloudflare:test";
import { CURRENT_CATALOG_VERSION, getCatalog } from "@card-duel/catalog";
import { describe, expect, it } from "vitest";
import type { DeckJson } from "../src/decks";
import { newIdentity, sessionToken } from "./identity";

const BASE = "https://card-duel.test";
const newPlayer = newIdentity;

function api(cookie: string, path: string, method = "GET", body?: unknown) {
  return SELF.fetch(`${BASE}/api/decks${path}`, {
    method,
    headers: {
      Cookie: cookie,
      Origin: BASE,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function deckOf(res: Response): Promise<DeckJson> {
  return ((await res.json()) as { deck: DeckJson }).deck;
}

describe("Deck API", () => {
  it("requires a signed-in session", async () => {
    expect((await SELF.fetch(`${BASE}/api/decks`)).status).toBe(401);
  });

  it("gives a new player one current Starter Deck per Faction", async () => {
    const me = await newPlayer();
    const { decks } = (await (await api(me, "")).json()) as { decks: DeckJson[] };
    expect(decks).toHaveLength(5);
    expect(new Set(decks.map((deck) => deck.id)).size).toBe(5);
    if (!CURRENT_CATALOG_VERSION) throw new Error("No catalog version");
    const catalog = getCatalog(CURRENT_CATALOG_VERSION);
    const names = {
      swarm: "Swarm Starter",
      court: "Court Starter",
      kingdom: "Kingdom Starter",
      vikings: "Vikings Starter",
      elves: "Elves Starter",
    } as const;
    for (const faction of ["swarm", "court", "kingdom", "vikings", "elves"] as const) {
      expect(decks.find((deck) => deck.faction === faction)).toMatchObject({
        ...catalog.starterDecks[faction],
        name: names[faction],
        catalogVersion: CURRENT_CATALOG_VERSION,
        problems: { valid: [], competitive: [] },
      });
    }
    expect(((await (await api(me, "")).json()) as { decks: DeckJson[] }).decks).toEqual(decks);
  });

  it("keeps Starter Deck edits and deletions across later authenticated requests", async () => {
    const me = await newPlayer();
    const { decks } = (await (await api(me, "")).json()) as { decks: DeckJson[] };
    const swarm = decks.find((deck) => deck.faction === "swarm") as DeckJson;
    const others = decks.filter((deck) => deck.faction !== "swarm");
    const edited = await deckOf(
      await api(me, `/${swarm.id}`, "PUT", { name: "My Swarm", cards: [] }),
    );
    for (const other of others) {
      expect((await api(me, `/${other.id}`, "DELETE")).status).toBe(204);
    }
    expect(((await (await api(me, "")).json()) as { decks: DeckJson[] }).decks).toEqual([edited]);
    expect((await api(me, `/${swarm.id}`, "DELETE")).status).toBe(204);
    expect(((await (await api(me, "")).json()) as { decks: DeckJson[] }).decks).toEqual([]);
  });

  it("does not seed Starter Decks for an existing account without Decks", async () => {
    const userId = `user_${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT INTO accounts (id, clerk_user_id, display_name, created_at) VALUES (?, ?, 'Player', 0)",
    )
      .bind(crypto.randomUUID(), userId)
      .run();
    const token = await sessionToken(userId, BASE);
    const cookie = `__clerk_db_jwt=fixture; __client_uat=1; __session=${token}`;
    const response = await api(cookie, "");
    expect(response.status).toBe(200);
    const { decks } = (await response.json()) as { decks: DeckJson[] };
    expect(decks).toEqual([]);
  });

  it("creates an incomplete Deck and reports its Valid Deck problems", async () => {
    const me = await newPlayer();
    const res = await api(me, "", "POST", { name: "Hive draft", faction: "swarm" });
    expect(res.status).toBe(201);
    const deck = await deckOf(res);
    expect(deck).toMatchObject({
      name: "Hive draft",
      faction: "swarm",
      leader: null,
      cards: [],
      catalogVersion: CURRENT_CATALOG_VERSION,
    });
    expect(deck.problems.valid.map((p) => p.code)).toEqual(["no_leader", "too_few_units"]);
  });

  it("copies a Starter Deck into a new Deck with no problems", async () => {
    const me = await newPlayer();
    const deck = await deckOf(await api(me, "/copy-starter", "POST", { faction: "court" }));
    expect(deck.faction).toBe("court");
    expect(deck.leader).toBe("court-leader-whisper-master");
    expect(deck.cards.length).toBeGreaterThanOrEqual(22);
    expect(deck.problems).toEqual({ valid: [], competitive: [] });
  });

  it("keeps several Decks per Faction and lists them by Faction, newest first", async () => {
    const me = await newPlayer();
    await api(me, "/copy-starter", "POST", { faction: "swarm", name: "One" });
    await api(me, "/copy-starter", "POST", { faction: "swarm", name: "Two" });
    await api(me, "/copy-starter", "POST", { faction: "court", name: "Three" });
    const swarm = (await (await api(me, "?faction=swarm")).json()) as { decks: DeckJson[] };
    expect(swarm.decks.map((d) => d.name)).toEqual(["Two", "One", "Swarm Starter"]);
    const all = (await (await api(me, "")).json()) as { decks: DeckJson[] };
    expect(all.decks).toHaveLength(8);
  });

  it("updates name, Leader and cards; reports Competitive problems as warnings", async () => {
    const me = await newPlayer();
    const created = await deckOf(await api(me, "/copy-starter", "POST", { faction: "swarm" }));
    const extra = ["neutral-black-ice", "neutral-mudslide", "neutral-sea-mist"];
    const res = await api(me, `/${created.id}`, "PUT", {
      name: "Heavier",
      leader: "swarm-leader-hive-mind",
      cards: [...created.cards, ...extra],
    });
    expect(res.status).toBe(200);
    const updated = await deckOf(res);
    expect(updated).toMatchObject({ name: "Heavier", leader: "swarm-leader-hive-mind" });
    expect(updated.problems.valid).toEqual([]);
    expect(updated.problems.competitive.map((p) => p.code)).toEqual(["competitive_specials"]);
    expect(await deckOf(await api(me, `/${created.id}`))).toMatchObject({ name: "Heavier" });
  });

  it("refuses to change a Deck's Faction and validates input", async () => {
    const me = await newPlayer();
    const created = await deckOf(await api(me, "", "POST", { faction: "court" }));
    expect((await api(me, `/${created.id}`, "PUT", { faction: "swarm" })).status).toBe(400);
    expect((await api(me, "", "POST", { faction: "pirates" })).status).toBe(400);
    expect((await api(me, "", "POST", { faction: "swarm", name: "" })).status).toBe(400);
    expect((await api(me, "", "POST", { faction: "swarm", cards: "nope" })).status).toBe(400);
    expect(
      (await api(me, "", "POST", { faction: "swarm", cards: Array(81).fill("x") })).status,
    ).toBe(400);
  });

  it("deletes a Deck", async () => {
    const me = await newPlayer();
    const created = await deckOf(await api(me, "", "POST", { faction: "court" }));
    expect((await api(me, `/${created.id}`, "DELETE")).status).toBe(204);
    expect((await api(me, `/${created.id}`)).status).toBe(404);
  });

  it("another player's Decks cannot be read or changed", async () => {
    const owner = await newPlayer();
    const other = await newPlayer();
    const deck = await deckOf(await api(owner, "/copy-starter", "POST", { faction: "swarm" }));
    expect((await api(other, `/${deck.id}`)).status).toBe(404);
    expect((await api(other, `/${deck.id}`, "PUT", { name: "Stolen" })).status).toBe(404);
    expect((await api(other, `/${deck.id}`, "DELETE")).status).toBe(404);
    const othersDecks = ((await (await api(other, "")).json()) as { decks: DeckJson[] }).decks;
    expect(othersDecks).toHaveLength(5);
    expect(othersDecks.map((d) => d.id)).not.toContain(deck.id);
    expect(await deckOf(await api(owner, `/${deck.id}`))).toMatchObject({ name: deck.name });
  });
});
