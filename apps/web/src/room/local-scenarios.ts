import { getCatalog } from "@card-duel/catalog";
import {
  applyAction,
  type CardDefinition,
  type LeaderAbility,
  type MatchSetup,
  type MatchState,
  ROWS,
  type RowId,
  type Seat,
  type Uid,
} from "@card-duel/engine";

/**
 * Development-only Local Room scenarios: fixed boards for building and testing the Match
 * UI. They rearrange a fresh Match directly; never used outside /dev routes. Seat 0 (the
 * Swarm Deck) always has the Turn.
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

/** Leader kinds a scenario can give Seat 0; v1 Leaders where they exist, else a dev Leader. */
export const LEADER_KINDS: LeaderAbility["type"][] = [
  "playWeatherFromDeck",
  "clearWeather",
  "hornRow",
  "scorchRow",
  "returnFromDiscard",
  "drawChosenFromDeck",
  "lookAtOpponentHand",
];

const DEV_CLEAR_LEADER: CardDefinition = {
  id: "dev-leader-clear-weather",
  kind: "leader",
  faction: "swarm",
  maxCopies: 1,
  ability: { type: "clearWeather" },
};

export const SCENARIOS: Record<string, Scenario> = {
  scorch: {
    setup: starterSetup(11),
    prepare: (state) =>
      arrange(state, {
        you: {
          close: ["swarm-thornback-crawler", "swarm-carapace-guard"],
          ranged: ["swarm-hive-drone"],
        },
        opponent: {
          close: ["court-palace-champion", "court-halberd-guard"],
          ranged: ["court-tower-archer"],
        },
        hand: ["neutral-wildfire"],
      }),
  },
  horn: {
    setup: starterSetup(12),
    prepare: (state) =>
      arrange(state, {
        you: {
          close: ["swarm-thornback-crawler", "swarm-carapace-guard"],
          siege: ["swarm-siege-grub"],
        },
        opponent: { ranged: ["court-tower-archer"] },
        hand: ["neutral-war-drum"],
      }),
  },
  medic: {
    setup: starterSetup(13, [
      "swarm-brood-tender",
      "swarm-brood-tender",
      "swarm-thornback-crawler",
    ]),
    prepare: (state) =>
      arrange(state, {
        you: { close: ["swarm-carapace-guard"] },
        hand: ["swarm-brood-tender"],
        discard: ["swarm-brood-tender", "swarm-thornback-crawler"],
      }),
  },
  ...Object.fromEntries(LEADER_KINDS.map((kind) => [`leader-${kind}`, leaderScenario(kind)])),
};

function leaderScenario(kind: LeaderAbility["type"]): Scenario {
  const v1 = getCatalog("v1");
  const leader =
    v1.cards.find((c) => c.kind === "leader" && c.ability.type === kind) ?? DEV_CLEAR_LEADER;
  const base = starterSetup(20 + LEADER_KINDS.indexOf(kind), ["swarm-thornback-crawler"]);
  const setup: MatchSetup = {
    ...base,
    decks: [{ ...base.decks[0], leader: leader.id }, base.decks[1]],
    cards: [...base.cards, DEV_CLEAR_LEADER],
  };
  return {
    setup,
    prepare: (state) =>
      arrange(state, {
        you: { close: ["swarm-carapace-guard"] },
        opponent: { close: ["court-palace-champion", "court-halberd-guard"] },
        discard: ["swarm-thornback-crawler"],
        deck: kind === "clearWeather" ? [] : ["neutral-black-ice"],
        weather: kind === "clearWeather" ? ["neutral-black-ice"] : [],
      }),
  };
}

function starterSetup(seed: number, extraSwarm: string[] = []): MatchSetup {
  const v1 = getCatalog("v1");
  const swarm = {
    ...v1.starterDecks.swarm,
    cards: [
      ...v1.starterDecks.swarm.cards,
      "neutral-wildfire",
      "swarm-thornback-crawler",
      "swarm-siege-grub",
      ...extraSwarm,
    ],
  };
  const court = {
    ...v1.starterDecks.court,
    cards: [...v1.starterDecks.court.cards, "court-palace-champion"],
  };
  return { seed, decks: [swarm, court], cards: v1.cards };
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
