import type { MatchEvent } from "@card-duel/engine";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RoomClientState, RoomConnection } from "./connection";

/** Subscribes a component to a Room connection; `onEvents` receives each batch of events. */
export function useRoom(
  connection: RoomConnection,
  onEvents?: (events: MatchEvent[]) => void,
): RoomClientState {
  const onEventsRef = useRef(onEvents);
  onEventsRef.current = onEvents;
  useEffect(
    () =>
      connection.subscribe(({ events }) => {
        if (events.length > 0) onEventsRef.current?.(events);
      }),
    [connection],
  );
  return useSyncExternalStore(
    (notify) => connection.subscribe(notify),
    () => connection.getState(),
  );
}

/** Each non-empty batch of events, numbered, so the board can animate it once (#38). */
export function useEventBatch(
  connection: RoomConnection,
): { seq: number; events: MatchEvent[] } | undefined {
  const [batch, setBatch] = useState<{ seq: number; events: MatchEvent[] }>();
  useEffect(
    () =>
      connection.subscribe(({ events }) => {
        if (events.length > 0) setBatch((b) => ({ seq: (b?.seq ?? 0) + 1, events }));
      }),
    [connection],
  );
  return batch;
}
