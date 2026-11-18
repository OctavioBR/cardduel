import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { DeckJson } from "../src/decks";
import { newIdentity } from "./identity";

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
      catalogVersion: "v1",
    });
    expect(deck.problems.valid.map((p) => p.code)).toEqual(["no_leader", "too_few_units"]);
  });

  it("copies a Starter Deck into a new Deck with no problems", async () => {
    const me = await newPlayer();
    const deck = await deckOf(await api(me, "/copy-starter", "POST", { faction: "court" }));
    expect(deck.faction).toBe("court");
    expect(deck.leader).toBe("court-leader-spymaster");
    expect(deck.cards.length).toBeGreaterThanOrEqual(22);
    expect(deck.problems).toEqual({ valid: [], competitive: [] });
  });

  it("keeps several Decks per Faction and lists them by Faction, newest first", async () => {
    const me = await newPlayer();
    await api(me, "/copy-starter", "POST", { faction: "swarm", name: "One" });
    await api(me, "/copy-starter", "POST", { faction: "swarm", name: "Two" });
    await api(me, "/copy-starter", "POST", { faction: "court", name: "Three" });
    const swarm = (await (await api(me, "?faction=swarm")).json()) as { decks: DeckJson[] };
    expect(swarm.decks.map((d) => d.name)).toEqual(["Two", "One"]);
    const all = (await (await api(me, "")).json()) as { decks: DeckJson[] };
    expect(all.decks).toHaveLength(3);
  });

  it("updates name, Leader and cards; reports Competitive problems as warnings", async () => {
    const me = await newPlayer();
    const created = await deckOf(await api(me, "/copy-starter", "POST", { faction: "swarm" }));
    const extra = ["neutral-black-ice", "neutral-mudslide", "neutral-sea-mist"];
    const res = await api(me, `/${created.id}`, "PUT", {
      name: "Heavier",
      leader: "swarm-leader-swarmlord",
      cards: [...created.cards, ...extra],
    });
    expect(res.status).toBe(200);
    const updated = await deckOf(res);
    expect(updated).toMatchObject({ name: "Heavier", leader: "swarm-leader-swarmlord" });
    expect(updated.problems.valid).toEqual([]);
    expect(updated.problems.competitive.map((p) => p.code)).toEqual(["competitive_specials"]);
    expect(await deckOf(await api(me, `/${created.id}`))).toMatchObject({ name: "Heavier" });
  });

  it("refuses to change a Deck's Faction and validates input", async () => {
    const me = await newPlayer();
    const created = await deckOf(await api(me, "", "POST", { faction: "court" }));
    expect((await api(me, `/${created.id}`, "PUT", { faction: "swarm" })).status).toBe(400);
    expect((await api(me, "", "POST", { faction: "elves" })).status).toBe(400);
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
    expect(((await (await api(other, "")).json()) as { decks: DeckJson[] }).decks).toEqual([]);
    expect(await deckOf(await api(owner, `/${deck.id}`))).toMatchObject({ name: deck.name });
  });
});
