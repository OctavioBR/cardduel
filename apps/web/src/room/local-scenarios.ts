import { getCatalog, starterDeckOf } from "@card-duel/catalog";
import {
  applyAction,
  type LeaderAbility,
  type MatchSetup,
  type MatchState,
  ROWS,
  type RowId,
  type Seat,
  type Uid,
} from "@card-duel/engine";

/**
 * Development-only Local Room scenarios: fixed boards on the current (v2) Card Catalog for
 * building and testing the Match UI. They rearrange a fresh Match directly; never used
 * outside /dev routes. Seat 0 always has the Turn; it plays Swarm against Court, except in
 * the Medic scenario, where it plays Court (the Faction with Medics) against Swarm.
 */
export interface Scenario {
  setup: MatchSetup;
  prepare: (s: MatchState) => MatchState;
}

interface Arrangement {
  you?: Partial<Record<RowId, string[]>>;
  opponent?: Partial<Record<RowId, string[]>>;
  /** Cards that must be in your hand. */
  hand?: string[];
  /** Cards put in your Discard Pile. */
  discard?: string[];
  /** Cards that must stay in your deck (moved there from the hand if dealt). */
  deck?: string[];
  weather?: string[];
}

/** The v2 Leader each Leader scenario gives Seat 0, by Leader kind. */
const LEADERS: Partial<Record<LeaderAbility["type"], string>> = {
  playWeatherFromDeck: "swarm-leader-storm-caller",
  clearWeather: "kingdom-leader-field-commander",
  hornRow: "swarm-leader-war-queen",
  scorchRow: "elves-leader-valley-queen",
  returnFromDiscard: "swarm-leader-carrion-mother",
  discardToDrawChosen: "swarm-leader-hive-mind",
  lookAtOpponentHand: "court-leader-whisper-master",
};

/** Leader kinds a scenario can give Seat 0. */
export const LEADER_KINDS = Object.keys(LEADERS) as LeaderAbility["type"][];

/** Extra cards each scenario Deck carries on top of its v2 Starter Deck. */
const EXTRAS: Record<"swarm" | "court", string[]> = {
  swarm: [
    "neutral-black-ice",
    "swarm-horned-ravager",
    "swarm-cave-lurker",
    "swarm-needle-wing",
    "swarm-rubble-golem",
  ],
  court: [
    "court-siege-mender",
    "court-ebon-knight",
    "court-palace-swordsman",
    "court-marksman-captain",
  ],
};

export const SCENARIOS: Record<string, Scenario> = {
  scorch: {
    setup: starterSetup(11),
    prepare: (state) =>
      arrange(state, {
        you: {
          close: ["swarm-horned-ravager", "swarm-cave-lurker"],
          ranged: ["swarm-needle-wing"],
        },
        opponent: {
          close: ["court-ebon-knight", "court-palace-swordsman"],
          ranged: ["court-marksman-captain"],
        },
        hand: ["neutral-wildfire"],
      }),
  },
  horn: {
    setup: starterSetup(12),
    prepare: (state) =>
      arrange(state, {
        you: {
          close: ["swarm-horned-ravager", "swarm-cave-lurker"],
          siege: ["swarm-rubble-golem"],
        },
        opponent: { ranged: ["court-marksman-captain"] },
        hand: ["neutral-war-drum"],
      }),
  },
  medic: {
    setup: starterSetup(13, "court"),
    prepare: (state) =>
      arrange(state, {
        you: { close: ["court-palace-swordsman"] },
        hand: ["court-siege-mender"],
        discard: ["court-reserve-archer", "court-ebon-knight"],
      }),
  },
  ...Object.fromEntries(LEADER_KINDS.map((kind) => [`leader-${kind}`, leaderScenario(kind)])),
};

function leaderScenario(kind: LeaderAbility["type"]): Scenario {
  const base = starterSetup(20 + LEADER_KINDS.indexOf(kind));
  const leader = LEADERS[kind] as string;
  const setup: MatchSetup = {
    ...base,
    decks: [{ ...base.decks[0], leader }, base.decks[1]],
  };
  return {
    setup,
    prepare: (state) =>
      arrange(state, {
        you: { close: ["swarm-cave-lurker"] },
        opponent: { close: ["court-ebon-knight", "court-palace-swordsman"] },
        discard: ["swarm-horned-ravager"],
        deck: kind === "clearWeather" ? [] : ["neutral-black-ice"],
        weather: kind === "clearWeather" ? ["neutral-black-ice"] : [],
      }),
  };
}

function starterSetup(seed: number, you: "swarm" | "court" = "swarm"): MatchSetup {
  const v2 = getCatalog("v2");
  const deck = (faction: "swarm" | "court") => {
    const starter = starterDeckOf(v2, faction);
    return { ...starter, cards: [...starter.cards, ...EXTRAS[faction]] };
  };
  const opponent = you === "swarm" ? "court" : "swarm";
  return { seed, decks: [deck(you), deck(opponent)], cards: v2.cards };
}

/** Confirms both Redraws, then moves named cards onto the battlefield, hand, deck and Discard Pile. */
function arrange(initial: MatchState, plan: Arrangement): MatchState {
  let state = initial;
  for (const seat of [0, 1] as const) {
    const result = applyAction(state, seat, { type: "confirmRedraw" });
    if (result.ok) state = result.state;
  }
  const you: Seat = 0;
  const opponent: Seat = 1;
  state.turn = you;
  state.roundStarter = you;
  const take = (seat: Seat, cardId: string): Uid => {
    const side = state.sides[seat];
    for (const pile of [side.deck, side.hand]) {
      const i = pile.findIndex((uid) => state.cards[uid]?.cardId === cardId);
      if (i >= 0) return pile.splice(i, 1)[0] as Uid;
    }
    throw new Error(`Scenario needs ${cardId} for Seat ${seat}`);
  };
  for (const [seat, rows] of [
    [you, plan.you ?? {}],
    [opponent, plan.opponent ?? {}],
  ] as const) {
    for (const row of ROWS)
      for (const id of rows[row] ?? []) state.sides[seat].rows[row].units.push(take(seat, id));
  }
  for (const id of plan.discard ?? []) state.sides[you].discard.push(take(you, id));
  for (const id of plan.weather ?? []) state.weather.push(take(you, id));
  for (const id of plan.deck ?? []) {
    const hand = state.sides[you].hand;
    const i = hand.findIndex((uid) => state.cards[uid]?.cardId === id);
    if (i >= 0) state.sides[you].deck.push(...hand.splice(i, 1));
  }
  for (const id of plan.hand ?? []) {
    if (!state.sides[you].hand.some((uid) => state.cards[uid]?.cardId === id)) {
      state.sides[you].hand.unshift(take(you, id));
    }
  }
  return state;
}
