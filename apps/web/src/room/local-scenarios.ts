import { getCatalog } from "@card-duel/catalog";
import {
  applyAction,
  type MatchSetup,
  type MatchState,
  ROWS,
  type RowId,
  type Seat,
  type Uid,
} from "@card-duel/engine";

/**
 * Development-only Local Room scenarios: fixed boards for building and testing the Play
 * Preview UI. They rearrange a fresh Match directly; never used outside /dev routes.
 */
export type ScenarioName = "scorch" | "horn";

export const SCENARIOS: Record<
  ScenarioName,
  { setup: MatchSetup; prepare: (s: MatchState) => MatchState }
> = {
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
};

function starterSetup(seed: number): MatchSetup {
  const v1 = getCatalog("v1");
  const swarm = {
    ...v1.starterDecks.swarm,
    cards: [
      ...v1.starterDecks.swarm.cards,
      "neutral-wildfire",
      "swarm-thornback-crawler",
      "swarm-siege-grub",
    ],
  };
  const court = {
    ...v1.starterDecks.court,
    cards: [...v1.starterDecks.court.cards, "court-palace-champion"],
  };
  return { seed, decks: [swarm, court], cards: v1.cards };
}

interface Arrangement {
  you: Partial<Record<RowId, string[]>>;
  opponent: Partial<Record<RowId, string[]>>;
  /** Cards that must be in the hand of the Seat to move. */
  hand: string[];
}

/** Confirms both Redraws, then moves named cards onto the battlefield and into the hand. */
function arrange(initial: MatchState, plan: Arrangement): MatchState {
  let state = initial;
  for (const seat of [0, 1] as const) {
    const result = applyAction(state, seat, { type: "confirmRedraw" });
    if (result.ok) state = result.state;
  }
  // Scenarios always give Seat 0 (the Swarm Deck) the Turn.
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
    [you, plan.you],
    [opponent, plan.opponent],
  ] as const) {
    for (const row of ROWS)
      for (const id of rows[row] ?? []) state.sides[seat].rows[row].units.push(take(seat, id));
  }
  for (const id of plan.hand) {
    if (!state.sides[you].hand.some((uid) => state.cards[uid]?.cardId === id)) {
      state.sides[you].hand.unshift(take(you, id));
    }
  }
  return state;
}
