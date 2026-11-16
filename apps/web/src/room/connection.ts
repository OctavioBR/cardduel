import type { Action, MatchEvent, Seat, SeatView, ServerErrorCode } from "@card-duel/engine";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface RoomError {
  code: ServerErrorCode | "connection_lost";
  message: string;
}

/** What the UI renders. Everything about the Match comes from `view` (ADR-0002). */
export interface RoomClientState {
  status: ConnectionStatus;
  seat: Seat | null;
  /** The Room code while waiting for the opponent to take their Seat. */
  waitingCode: string | null;
  view: SeatView | null;
  /** The last error, cleared by the next view. */
  error: RoomError | null;
}

export interface RoomUpdate {
  state: RoomClientState;
  /** Filtered events that produced this view; empty on (re)connect. */
  events: MatchEvent[];
}

/**
 * The one interface the board talks to, so it can be built and tested against the
 * Local Room without the server.
 */
export interface RoomConnection {
  getState(): RoomClientState;
  subscribe(listener: (update: RoomUpdate) => void): () => void;
  /** Sends an action based on the last view received. */
  send(action: Action): void;
  close(): void;
}

export const INITIAL_STATE: RoomClientState = {
  status: "connecting",
  seat: null,
  waitingCode: null,
  view: null,
  error: null,
};

/** Shared listener bookkeeping for connection implementations. */
export class Emitter {
  private listeners = new Set<(update: RoomUpdate) => void>();
  state: RoomClientState = INITIAL_STATE;

  subscribe(listener: (update: RoomUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(patch: Partial<RoomClientState>, events: MatchEvent[] = []): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener({ state: this.state, events });
  }
}

/** Strips a legal action's Play Preview: only the action itself is sent. */
export function bareAction(action: Action & { preview?: unknown }): Action {
  const { preview: _preview, ...rest } = action;
  return rest as Action;
}
