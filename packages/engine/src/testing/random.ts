import type { Action } from "../actions";
import type { MatchEvent } from "../events";
import { legalActions } from "../legal";
import { applyAction, createMatch } from "../match";
import { nextInt } from "../rng";
import type { MatchSetup, MatchState, Seat } from "../state";

export interface Step {
  before: MatchState;
  seat: Seat;
  action: Action;
  after: MatchState;
  events: MatchEvent[];
}

/**
 * Plays a whole Match by picking random legal actions with a test-side seeded generator.
 * `onStep` sees every accepted action.
 */
export function playRandomMatch(
  setup: MatchSetup,
  pickerSeed: number,
  onStep: (step: Step) => void = () => {},
  maxSteps = 500,
): MatchState {
  const picker = { rng: pickerSeed };
  let { state } = createMatch(setup);
  for (let i = 0; i < maxSteps && state.phase !== "ended"; i++) {
    const seat = actingSeat(state);
    if (seat === null) break;
    const options = legalActions(state, seat);
    // Pass rarely, so Matches cover full hands and empty ones.
    const plays = options.filter((a) => a.type !== "pass");
    const action =
      plays.length > 0 && nextInt(picker, 6) !== 0
        ? (plays[nextInt(picker, plays.length)] as Action)
        : (options[nextInt(picker, options.length)] as Action);
    const result = applyAction(state, seat, action);
    if (!result.ok) throw new Error(`Legal action rejected: ${result.rejection.message}`);
    onStep({ before: state, seat, action, after: result.state, events: result.events });
    state = result.state;
  }
  return state;
}

/** The Seat that has something to do now. */
export function actingSeat(state: MatchState): Seat | null {
  return state.turn;
}
