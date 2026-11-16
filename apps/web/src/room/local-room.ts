import {
  type Action,
  applyAction,
  createMatch,
  filterEvents,
  type MatchEvent,
  type MatchSetup,
  type MatchState,
  type Seat,
  viewFor,
} from "@card-duel/engine";
import { bareAction, Emitter, type RoomConnection } from "./connection";

/**
 * Runs the engine in the browser and controls both Seats, for building and testing the
 * board without the server. Development only: never reachable in production builds.
 */
export class LocalRoom implements RoomConnection {
  private emitter = new Emitter();
  private state: MatchState;
  private viewing: Seat = 0;

  /**
   * `prepare` may rearrange the freshly created Match (development scenarios only), for
   * example to put chosen cards on the battlefield.
   */
  constructor(setup: MatchSetup, prepare?: (state: MatchState) => MatchState) {
    const created = createMatch(setup);
    const state = prepare ? prepare(created.state) : created.state;
    const events = prepare ? [] : created.events;
    this.state = state;
    this.viewing = state.turn ?? 0;
    this.publish(events);
  }

  getState() {
    return this.emitter.state;
  }

  subscribe(listener: Parameters<RoomConnection["subscribe"]>[0]) {
    return this.emitter.subscribe(listener);
  }

  /** Applies the action as the Seat currently being looked at. */
  send(action: Action): void {
    const result = applyAction(this.state, this.viewing, bareAction(action));
    if (!result.ok) {
      this.emitter.update({ error: { code: "rejected", message: result.rejection.message } });
      return;
    }
    this.state = result.state;
    this.publish(result.events);
  }

  close(): void {
    this.emitter.update({ status: "closed" });
  }

  get viewingSeat(): Seat {
    return this.viewing;
  }

  /** Switches which Seat's filtered view is shown (and which Seat acts). */
  viewSeat(seat: Seat): void {
    this.viewing = seat;
    this.publish([]);
  }

  /** The full engine state, for tests. */
  get matchState(): MatchState {
    return this.state;
  }

  private publish(events: MatchEvent[]): void {
    this.emitter.update(
      {
        status: "open",
        seat: this.viewing,
        waitingCode: null,
        view: viewFor(this.state, this.viewing),
        error: null,
      },
      filterEvents(events, this.viewing),
    );
  }
}
