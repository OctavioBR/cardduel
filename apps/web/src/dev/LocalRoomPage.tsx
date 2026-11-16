import { DEV_PLAIN_CARDS, devPlainDeck } from "@card-duel/catalog";
import type { Seat } from "@card-duel/engine";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { MatchBoard } from "../match/MatchBoard";
import { Stage } from "../match/Stage";
import { LocalRoom } from "../room/local-room";
import { useRoom } from "../room/useRoom";

/** Parses `?seed=` so a Local Room Match is reproducible. */
export function seedFromParams(params: URLSearchParams): number {
  const raw = Number(params.get("seed"));
  return params.has("seed") && Number.isFinite(raw) ? raw : 1;
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
  const [seat, setSeat] = useState<Seat>(room.viewingSeat);
  const viewSeat = (s: Seat) => {
    room.viewSeat(s);
    setSeat(s);
  };
  if (!state.view) return null;
  return (
    <>
      <Stage>
        <MatchBoard
          view={state.view}
          send={(a) => room.send(a)}
          error={state.error?.message ?? null}
        />
      </Stage>
      <SeatToggle seat={seat} onChange={viewSeat} />
    </>
  );
}

export function SeatToggle({ seat, onChange }: { seat: Seat; onChange: (seat: Seat) => void }) {
  return (
    <fieldset className="seat-toggle" data-testid="seat-toggle">
      <legend>Local Room · looking at</legend>
      {([0, 1] as const).map((s) => (
        <label key={s}>
          <input type="radio" name="seat" checked={seat === s} onChange={() => onChange(s)} /> Seat{" "}
          {s + 1}
        </label>
      ))}
    </fieldset>
  );
}
