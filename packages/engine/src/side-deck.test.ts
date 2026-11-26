import { describe, expect, it } from "vitest";
import type { CardDefinition, LeaderAbility } from "./cards";
import type { MatchEvent } from "./events";
import { legalActions } from "./legal";
import { createMatch } from "./match";
import { type DeckSpec, type MatchState, opponent, type Seat, type Uid } from "./state";
import { computeStrengths } from "./strength";
import {
  act,
  deck,
  place,
  repeat,
  setup,
  special,
  startMatch,
  toHand,
  unit,
} from "./testing/fixtures";

const CARDS: CardDefinition[] = [
  unit("knight", 6, "close"),
  unit("archer", 4, "ranged"),
  unit("bonded", 3, "close", { abilities: ["tightBond"] }),
  unit("wanderer", 15, "close", { hero: true, abilities: ["muster"], musterCalls: "steed" }),
  unit("heir", 15, "close", { hero: true, abilities: ["muster"], musterCalls: "steed" }),
  unit("mare", 3, "close", { musterGroup: "steed" }),
  unit("cow", 2, "ranged", { abilities: ["summon"], summons: "bull" }),
  unit("bull", 8, "close", { sideDeck: true }),
  unit("berserker", 4, "close", { abilities: ["berserker"], transformsInto: "bear" }),
  unit("bear", 14, "close", { abilities: ["moraleBoost"], sideDeck: true }),
  unit("cub", 2, "ranged", { abilities: ["berserker"], transformsInto: "young-bear" }),
  unit("young-bear", 8, "ranged", { abilities: ["tightBond"], sideDeck: true }),
  unit("druid", 8, "ranged", { hero: true, abilities: ["frenzy"] }),
  unit("raider", 6, "ranged", { abilities: ["battlefieldScorch"] }),
  unit("medic", 1, "siege", { abilities: ["medic"] }),
  special("frost", { type: "weather", rows: ["close"] }),
  special("storm", { type: "weather", rows: ["ranged", "siege"] }),
  special("wildfire", { type: "scorch" }),
  special("bloodcap", { type: "frenzy" }),
];
const LIST = [
  ...repeat("knight", 6),
  ...repeat("archer", 4),
  ...repeat("bonded", 3),
  "wanderer",
  "heir",
  "mare",
  "cow",
  "berserker",
  ...repeat("cub", 2),
  "druid",
  "raider",
  "medic",
  "frost",
  "storm",
  "wildfire",
  "bloodcap",
];

function leader(ability: LeaderAbility): CardDefinition {
  return {
    id: `leader-${ability.type}`,
    kind: "leader",
    faction: "vikings",
    maxCopies: 1,
    ability,
  };
}

function board(
  options: { ability?: LeaderAbility; factions?: [DeckSpec["faction"], DeckSpec["faction"]] } = {},
) {
  const lead = options.ability ? leader(options.ability) : null;
  const spec = { ...deck(LIST, "vikings"), ...(lead ? { leader: lead.id } : {}) };
  const { state } = startMatch(setup(61, [spec, spec], [...CARDS, ...(lead ? [lead] : [])]));
  const a = state.turn as Seat;
  const b = opponent(a);
  if (options.factions) {
    state.sides[a].faction = options.factions[0];
    state.sides[b].faction = options.factions[1];
  }
  return { state, a, b };
}

function idsOf(state: MatchState, uids: Uid[]): string[] {
  return uids.map((u) => state.cards[u]?.cardId ?? "?").sort();
}

function play(state: MatchState, seat: Seat, cardId: string, row?: CardDefinition["id"]) {
  const uid = toHand(state, seat, cardId);
  const def = state.defs[cardId];
  const playRow = row ?? (def?.kind === "unit" ? def.row : undefined);
  return act(state, seat, {
    type: "play",
    card: uid,
    ...(playRow ? { row: playRow as "close" } : {}),
  });
}

function endRound(state: MatchState, a: Seat, b: Seat) {
  const first = act(state, a, { type: "pass" });
  return act(first.state, b, { type: "pass" });
}

describe("Side Deck", () => {
  it("holds one card for each Summon card and Berserker in the Deck, hidden from hand and deck", () => {
    const { state } = createMatch(setup(1, [deck(LIST), deck(["knight"])], CARDS));
    expect(idsOf(state, state.sides[0].sideDeck)).toEqual([
      "bear",
      "bull",
      "young-bear",
      "young-bear",
    ]);
    expect(state.sides[1].sideDeck).toEqual([]);
    const all = [...state.sides[0].hand, ...state.sides[0].deck];
    expect(idsOf(state, all)).not.toContain("bull");
  });
});

describe("Muster with musterCalls", () => {
  it("Plays the called group but is not called back by it", () => {
    const { state, a } = board();
    const { state: after } = play(state, a, "wanderer");
    expect(idsOf(after, after.sides[a].rows.close.units)).toEqual(["mare", "wanderer"]);
    expect(idsOf(after, [...after.sides[a].hand, ...after.sides[a].deck])).toContain("heir");
  });

  it("a called card Played on its own Plays nothing else", () => {
    const { state, a } = board();
    const { state: after } = play(state, a, "mare");
    expect(idsOf(after, after.sides[a].rows.close.units)).toEqual(["mare"]);
  });
});

describe("Summon", () => {
  it("replaces a Summon card destroyed by Scorch on its Row at once", () => {
    const { state, a } = board();
    // The Cow is the only Unit on the battlefield, so Scorch destroys it.
    const cow = place(state, a, "cow", "ranged");
    const { state: after, events } = play(state, a, "wildfire");
    expect(after.sides[a].discard).toContain(cow);
    expect(idsOf(after, after.sides[a].rows.ranged.units)).toEqual(["bull"]);
    expect(after.sides[a].sideDeck.map((u) => after.cards[u]?.cardId)).not.toContain("bull");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "cardPlayed", via: "summon", zone: "ranged", side: a }),
    );
  });

  it("replaces a Summon card discarded at Round end, and the replacement stays for the next Round", () => {
    const { state, a, b } = board();
    place(state, a, "cow", "ranged");
    place(state, a, "knight", "close");
    place(state, b, "knight", "close");
    const { state: next } = endRound(state, a, b);
    expect(next.round).toBe(2);
    expect(idsOf(next, next.sides[a].rows.ranged.units)).toEqual(["bull"]);
    expect(next.sides[a].rows.close.units).toEqual([]);
  });

  it("does nothing once the Side Deck card is used", () => {
    const { state, a, b } = board();
    place(state, a, "cow", "ranged");
    state.sides[a].sideDeck = [];
    place(state, b, "knight", "close");
    const { state: next } = endRound(state, a, b);
    expect(next.sides[a].rows.ranged.units).toEqual([]);
  });
});

describe("Frenzy", () => {
  it("turns every Berserker its player controls into its Side Deck form, in place", () => {
    const { state, a, b } = board();
    const berserker = place(state, a, "berserker", "close");
    const cubs = [place(state, a, "cub", "ranged"), place(state, a, "cub", "ranged")];
    const theirs = place(state, b, "berserker", "close");
    const { state: after, events } = play(state, a, "bloodcap");
    expect(idsOf(after, after.sides[a].rows.close.units)).toEqual(["bear"]);
    expect(idsOf(after, after.sides[a].rows.ranged.units)).toEqual(["young-bear", "young-bear"]);
    for (const uid of [berserker, ...cubs]) expect(after.sides[a].sideDeck).toContain(uid);
    expect(after.sides[b].rows.close.units).toEqual([theirs]);
    const strengths = computeStrengths(after);
    const youngBears = after.sides[a].rows.ranged.units.map((u) => strengths.get(u));
    expect(youngBears).toEqual([16, 16]); // Tight Bond doubles each
    const transformed = events.find((e) => e.type === "transformed");
    expect(transformed).toMatchObject({ seat: a });
    expect(transformed?.type === "transformed" && transformed.changes).toHaveLength(3);
    expect(after.sides[a].discard.map((u) => after.cards[u]?.cardId)).toContain("bloodcap");
  });

  it("fires when a Frenzy Unit is Played", () => {
    const { state, a } = board();
    place(state, a, "berserker", "close");
    const { state: after } = play(state, a, "druid");
    expect(idsOf(after, after.sides[a].rows.close.units)).toEqual(["bear"]);
  });

  it("can be Played with no Berserker on the battlefield", () => {
    const { state, a } = board();
    const { state: after, events } = play(state, a, "bloodcap");
    expect(events.some((e) => e.type === "transformed")).toBe(false);
    expect(after.turn).not.toBe(a);
  });
});

describe("Battlefield Scorch on a Unit", () => {
  it("destroys the highest non-Hero Units on both sides when Played", () => {
    const { state, a, b } = board();
    const mine = place(state, a, "knight", "close");
    const theirs = place(state, b, "knight", "close");
    place(state, b, "archer", "ranged");
    const { state: after, events } = play(state, a, "raider");
    expect(after.sides[a].discard).toContain(mine);
    expect(after.sides[b].discard).toContain(theirs);
    expect(events).toContainEqual(expect.objectContaining({ type: "destroyed" }));
  });
});

describe("Kingdom", () => {
  it("draws a card when it wins a Round", () => {
    const { state, a, b } = board({ factions: ["kingdom", "kingdom"] });
    place(state, a, "knight", "close");
    const handBefore = state.sides[a].hand.length;
    const { state: next, events } = endRound(state, a, b);
    expect(next.sides[a].hand).toHaveLength(handBefore + 1);
    expect(events).toContainEqual({
      type: "factionPassive",
      seat: a,
      faction: "kingdom",
      effect: "drewCard",
    });
    expect(next.sides[b].hand).toHaveLength(state.sides[b].hand.length);
  });
});

describe("Vikings", () => {
  it("Puts two random Units from its Discard Pile on the battlefield when Round 3 starts", () => {
    const { state, a, b } = board({ factions: ["vikings", "swarm"] });
    // Round 1: a wins; Round 2: b wins.
    place(state, a, "knight", "close");
    place(state, a, "archer", "ranged");
    const round2 = endRound(state, a, b).state;
    const starter2 = round2.turn as Seat;
    place(round2, b, "knight", "close");
    place(round2, b, "knight", "close");
    const { state: round3, events } = endRound(round2, starter2, opponent(starter2));
    expect(round3.round).toBe(3);
    const put = events.find(
      (e): e is Extract<MatchEvent, { faction: "vikings" }> =>
        e.type === "factionPassive" && e.faction === "vikings",
    );
    expect(put?.cards).toHaveLength(2);
    const onBoard = Object.values(round3.sides[a].rows).flatMap((r) => r.units);
    expect(onBoard.sort()).toEqual(put?.cards.map((c) => c.uid).sort());
    for (const c of put?.cards ?? []) expect(round3.sides[a].discard).not.toContain(c.uid);
  });
});

describe("Storm-Hardened", () => {
  it("Weather lowers its Controller's Units to half their printed Strength, rounded up", () => {
    const { state, a, b } = board({ ability: { type: "passive", passive: "stormHardened" } });
    state.sides[b].leader = "leader-plain";
    const mine = [place(state, a, "knight", "close"), place(state, a, "berserker", "close")];
    const theirs = place(state, b, "knight", "close");
    place(state, a, "frost", "weather");
    const strengths = computeStrengths(state);
    expect(mine.map((u) => strengths.get(u))).toEqual([3, 2]);
    expect(strengths.get(theirs)).toBe(1);
  });
});

describe("new Leader abilities", () => {
  it("playCardFromDeck Plays that Special Card from the deck at once", () => {
    const { state, a } = board({ ability: { type: "playCardFromDeck", card: "storm" } });
    toHand(state, a, "frost"); // not the named card
    const deckStorm = state.sides[a].deck.find((u) => state.cards[u]?.cardId === "storm");
    if (deckStorm === undefined) {
      const i = state.sides[a].hand.findIndex((u) => state.cards[u]?.cardId === "storm");
      state.sides[a].deck.push(...state.sides[a].hand.splice(i, 1));
    }
    const { state: after, events } = act(state, a, { type: "leader" });
    expect(idsOf(after, after.weather)).toEqual(["storm"]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "cardPlayed", zone: "weather", via: "leader" }),
    );
  });

  it("playCardFromDeck is not usable without the card in the deck", () => {
    const { state, a } = board({ ability: { type: "playCardFromDeck", card: "storm" } });
    toHand(state, a, "storm");
    expect(legalActions(state, a).filter((x) => x.type === "leader")).toEqual([]);
  });

  it("hornRow with a fixed Row offers only that Row", () => {
    const { state, a } = board({ ability: { type: "hornRow", row: "siege" } });
    expect(legalActions(state, a).filter((x) => x.type === "leader")).toEqual([
      { type: "leader", row: "siege" },
    ]);
  });

  it("playBondCopyFromDeck Plays a deck copy of a Tight Bond Unit on the battlefield", () => {
    const { state, a } = board({ ability: { type: "playBondCopyFromDeck" } });
    expect(legalActions(state, a).filter((x) => x.type === "leader")).toEqual([]);
    for (const pile of [state.sides[a].hand]) {
      const extra = pile.filter((u) => state.cards[u]?.cardId === "bonded");
      state.sides[a].deck.push(...extra);
      state.sides[a].hand = pile.filter((u) => !extra.includes(u));
    }
    place(state, a, "bonded", "close");
    const used = act(state, a, { type: "leader" });
    expect(used.state.pending[0]?.kind).toBe("leaderBond");
    const options = legalActions(used.state, a);
    expect(options).toEqual([{ type: "choose", cardId: "bonded", row: "close" }]);
    const { state: after } = act(used.state, a, options[0] as never);
    expect(idsOf(after, after.sides[a].rows.close.units)).toEqual(["bonded", "bonded"]);
  });

  it("shuffleDiscardsIntoDecks returns both Discard Piles to the decks, Side Deck cards to the Side Deck", () => {
    const { state, a, b } = board({ ability: { type: "shuffleDiscardsIntoDecks" } });
    const knight = toHand(state, a, "knight");
    state.sides[a].hand.splice(state.sides[a].hand.indexOf(knight), 1);
    state.sides[a].discard.push(knight);
    const bull = state.sides[a].sideDeck.find((u) => state.cards[u]?.cardId === "bull") as Uid;
    state.sides[a].sideDeck.splice(state.sides[a].sideDeck.indexOf(bull), 1);
    state.sides[a].discard.push(bull);
    const archer = toHand(state, b, "archer");
    state.sides[b].hand.splice(state.sides[b].hand.indexOf(archer), 1);
    state.sides[b].discard.push(archer);
    const { state: after, events } = act(state, a, { type: "leader" });
    expect(after.sides[a].discard).toEqual([]);
    expect(after.sides[b].discard).toEqual([]);
    expect(after.sides[a].deck).toContain(knight);
    expect(after.sides[a].sideDeck).toContain(bull);
    expect(after.sides[b].deck).toContain(archer);
    expect(events).toContainEqual({ type: "discardsShuffled", counts: a === 0 ? [2, 1] : [1, 2] });
  });
});
