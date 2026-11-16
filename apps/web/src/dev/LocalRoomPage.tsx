import { DEV_PLAIN_CARDS, devPlainDeck } from "@card-duel/catalog";
import type { Seat } from "@card-duel/engine";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { LocalRoom } from "../room/local-room";
import { useRoom } from "../room/useRoom";

/** Parses `?seed=` so a Local Room Match is reproducible. */
export function seedFromParams(params: URLSearchParams): number {
  const raw = Number(params.get("seed"));
  return Number.isFinite(raw) && params.has("seed") ? raw : 1;
}

export function createDevLocalRoom(seed: number): LocalRoom {
  return new LocalRoom({
    seed,
    decks: [devPlainDeck("swarm"), devPlainDeck("court")],
    cards: DEV_PLAIN_CARDS,
  });
}

/** Development-only page at /dev/local. Not linked from the app, absent from production builds. */
export function LocalRoomPage() {
  const [params] = useSearchParams();
  const seed = seedFromParams(params);
  const room = useMemo(() => createDevLocalRoom(seed), [seed]);
  const state = useRoom(room);
  return (
    <main>
      <h1>Local Room (seed {seed})</h1>
      <SeatToggle seat={room.viewingSeat} onChange={(s) => room.viewSeat(s)} />
      <pre data-testid="local-view">{JSON.stringify(state.view, null, 2)}</pre>
    </main>
  );
}

export function SeatToggle({ seat, onChange }: { seat: Seat; onChange: (seat: Seat) => void }) {
  return (
    <fieldset>
      <legend>Looking at</legend>
      {([0, 1] as const).map((s) => (
        <label key={s}>
          <input type="radio" name="seat" checked={seat === s} onChange={() => onChange(s)} /> Seat{" "}
          {s + 1}
        </label>
      ))}
    </fieldset>
  );
}
