import type { MatchmakingMessage, QueueId } from "@card-duel/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import strings from "./strings/en.json";
import { socketUrl } from "./websocket-room";

export type SearchState =
  | { status: "idle" }
  | { status: "connecting"; queue: QueueId }
  /** In the Queue since `since` (server time); `receivedAt` is when the client heard it. */
  | { status: "searching"; queue: QueueId; since: number; serverNow: number; receivedAt: number }
  | { status: "failed"; message: string };

export interface QueueSearchOptions {
  onChange: (state: SearchState) => void;
  /** Paired: both Seats are taken in the Matched Room with this code. */
  onMatched: (code: string) => void;
  /** Injected for tests. */
  createSocket?: (url: string) => WebSocket;
  origin?: string;
  now?: () => number;
}

/**
 * One search in a Queue (#108). There is no reconnect: closing the socket leaves the Queue,
 * so a dropped connection ends the search and the player starts a new one.
 */
export class QueueSearch {
  private socket: WebSocket | null = null;
  private matched = false;
  private failure: string | null = null;

  constructor(
    queue: QueueId,
    deckId: string,
    private readonly options: QueueSearchOptions,
  ) {
    const create = options.createSocket ?? ((url) => new WebSocket(url));
    const now = options.now ?? (() => Date.now());
    const params = new URLSearchParams({ queue, deck: deckId });
    const socket = create(socketUrl(`/api/matchmaking/ws?${params}`, options.origin));
    this.socket = socket;
    options.onChange({ status: "connecting", queue });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let message: MatchmakingMessage;
      try {
        message = JSON.parse(event.data) as MatchmakingMessage;
      } catch {
        return;
      }
      if (message.type === "searching")
        options.onChange({
          status: "searching",
          queue: message.queue,
          since: message.since,
          serverNow: message.serverNow,
          receivedAt: now(),
        });
      else if (message.type === "matched") {
        this.matched = true;
        options.onMatched(message.code);
      } else this.failure = message.message;
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket || this.matched) return;
      this.socket = null;
      options.onChange({ status: "failed", message: this.failure ?? strings.searchStopped });
    });
  }

  /** Leaves the Queue. */
  cancel(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "Cancelled");
    this.options.onChange({ status: "idle" });
  }
}

/** Find a Match: joins a Queue and calls `onMatched` with the Matched Room's code. */
export function useQueueSearch(onMatched: (code: string) => void) {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const search = useRef<QueueSearch | null>(null);
  const matchedRef = useRef(onMatched);
  matchedRef.current = onMatched;
  const cancel = useCallback(() => {
    search.current?.cancel();
    search.current = null;
  }, []);
  const start = useCallback(
    (queue: QueueId, deckId: string) => {
      cancel();
      search.current = new QueueSearch(queue, deckId, {
        onChange: setState,
        onMatched: (code) => matchedRef.current(code),
      });
    },
    [cancel],
  );
  // Leaving the page leaves the Queue.
  useEffect(() => cancel, [cancel]);
  return { state, start, cancel };
}

/** Whole seconds since `since`, from the server's clock. */
export function searchSeconds(
  state: Extract<SearchState, { status: "searching" }>,
  now: number,
): number {
  return Math.max(0, Math.floor((state.serverNow - state.since + now - state.receivedAt) / 1000));
}
