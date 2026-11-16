import { DEV_PLAIN_CARDS, devPlainDeck, getCatalog } from "@card-duel/catalog";
import type { Seat } from "@card-duel/engine";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { CardDetailProvider } from "../cards/CardDetail";
import { MatchBoard } from "../match/MatchBoard";
import { Stage } from "../match/Stage";
import { LocalRoom } from "../room/local-room";
import { SCENARIOS } from "../room/local-scenarios";
import { useRoom } from "../room/useRoom";

/** Parses `?seed=` so a Local Room Match is reproducible. */
export function seedFromParams(params: URLSearchParams): number {
  const raw = Number(params.get("seed"));
  return params.has("seed") && Number.isFinite(raw) ? raw : 1;
}

export type LocalDecks = "plain" | "starter";

/** `?deck=starter` plays the v1 Starter Decks (Swarm against Court); the default is plain Units. */
export function createDevLocalRoom(seed: number, decks: LocalDecks = "plain"): LocalRoom {
  if (decks === "starter") {
    const v1 = getCatalog("v1");
    return new LocalRoom({
      seed,
      decks: [v1.starterDecks.swarm, v1.starterDecks.court],
      cards: v1.cards,
    });
  }
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
  const decks: LocalDecks = params.get("deck") === "starter" ? "starter" : "plain";
  const scenario = params.get("scenario");
  const room = useMemo(() => {
    const chosen = scenario ? SCENARIOS[scenario] : undefined;
    if (chosen) return new LocalRoom(chosen.setup, chosen.prepare);
    return createDevLocalRoom(seed, decks);
  }, [seed, decks, scenario]);
  const state = useRoom(room);
  const [seat, setSeat] = useState<Seat>(room.viewingSeat);
  const viewSeat = (s: Seat) => {
    room.viewSeat(s);
    setSeat(s);
  };
  // "S" switches Seat, so a whole Local Room Match can be played from the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "s" || e.key === "S") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const next: Seat = room.viewingSeat === 0 ? 1 : 0;
        room.viewSeat(next);
        setSeat(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [room]);
  if (!state.view) return null;
  return (
    <>
      <Stage>
        <CardDetailProvider>
          <MatchBoard
            view={state.view}
            send={(a) => room.send(a)}
            error={state.error?.message ?? null}
          />
        </CardDetailProvider>
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
