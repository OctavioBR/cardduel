import {
  DEFAULT_TURN_TIMER_SECONDS,
  MAX_TURN_TIMER_SECONDS,
  MIN_TURN_TIMER_SECONDS,
} from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { FACTION_NAME } from "../cards/factions";
import { type Deck, deckApi } from "../decks/api";
import { defaultDeck, seatableDecks } from "../decks/default-deck";
import { clock } from "../room/clock";
import { type SearchState, searchSeconds, useQueueSearch } from "../room/queue-search";
import copy from "../strings/en.json";
import en from "../strings/home.en.json";

interface Record {
  wins: number;
  losses: number;
  draws: number;
  disconnectWins: number;
  disconnectLosses: number;
}

/** Room navigation state: the Home Deck takes the Seat (#108). */
export interface RoomEntry {
  deckId: string;
}

/** Home navigation state: Find another Match after a Matched Room closed with no Match. */
export interface HomeEntry {
  findMatch?: { deckId: string; competitive: boolean };
}

/**
 * Home, top to bottom: title, Deck picker, the Recently Active Players count (#119), Find a
 * Match, one compact Room row (Create, then join by code) and the Record (#108). The selected
 * Deck is the one that takes the Seat.
 */
export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { account } = useAuth();
  const [record, setRecord] = useState<Record | null>(null);
  const [recordError, setRecordError] = useState(false);
  // Recently Active Players come with the Record (#119); on failure the count just stays hidden.
  const [recentlyActive, setRecentlyActive] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setRecord(null);
    setRecordError(false);
    setRecentlyActive(null);
    if (account)
      fetch("/api/record")
        .then(async (res) => {
          if (!res.ok) throw new Error();
          const body = (await res.json()) as { record: Record; recentlyActive: number };
          if (!alive) return;
          setRecord(body.record);
          setRecentlyActive(body.recentlyActive);
        })
        .catch(() => {
          if (alive) setRecordError(true);
        });
    return () => {
      alive = false;
    };
  }, [account]);

  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [decksError, setDecksError] = useState<string | null>(null);
  const [deckId, setDeckId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    deckApi.choices().then(
      ({ decks, lastDeckId }) => {
        if (!alive) return;
        setDecks(decks);
        setDeckId((current) => current ?? defaultDeck(decks, lastDeckId)?.id ?? null);
      },
      (e: Error) => alive && setDecksError(e.message),
    );
    return () => {
      alive = false;
    };
  }, []);
  const choices = decks ? seatableDecks(decks) : [];
  const deck = choices.find((d) => d.id === deckId) ?? null;
  const competitiveProblem = deck?.problems.competitive[0]?.message ?? null;
  const deckCompetitive = !!deck && !competitiveProblem;

  const [findCompetitive, setFindCompetitive] = useState(false);
  const [roomCompetitive, setRoomCompetitive] = useState(false);
  // Only a Competitive Deck may enter a Competitive Room or the Competitive Queue.
  useEffect(() => {
    if (deckCompetitive) return;
    setFindCompetitive(false);
    setRoomCompetitive(false);
  }, [deckCompetitive]);
  const [turnTimerOn, setTurnTimerOn] = useState(false);
  const [turnTimer, setTurnTimer] = useState(String(DEFAULT_TURN_TIMER_SECONDS));
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const search = useQueueSearch((matched) => navigate(`/r/${matched}`));
  const searching = search.state.status === "connecting" || search.state.status === "searching";

  // Find another Match: back in the Queue with the same Deck as before.
  const again = (location.state as HomeEntry | null)?.findMatch;
  const startedAgain = useRef(false);
  useEffect(() => {
    if (!again || startedAgain.current || !decks) return;
    startedAgain.current = true;
    navigate(".", { replace: true, state: null });
    const previous = seatableDecks(decks, again.competitive).find((d) => d.id === again.deckId);
    if (!previous) return;
    setDeckId(previous.id);
    setFindCompetitive(again.competitive);
    search.start(again.competitive ? "competitive" : "casual", previous.id);
  }, [again, decks, navigate, search.start]);

  const find = () => {
    if (!deck) return;
    setError(null);
    search.start(findCompetitive && deckCompetitive ? "competitive" : "casual", deck.id);
  };

  const create = async () => {
    if (!deck) return;
    const seconds = Number(turnTimer);
    if (
      turnTimerOn &&
      !(
        Number.isInteger(seconds) &&
        seconds >= MIN_TURN_TIMER_SECONDS &&
        seconds <= MAX_TURN_TIMER_SECONDS
      )
    ) {
      setError(
        formatCopy(en.turnTimerRange, { min: MIN_TURN_TIMER_SECONDS, max: MAX_TURN_TIMER_SECONDS }),
      );
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitive: roomCompetitive && deckCompetitive,
          turnTimer: turnTimerOn ? seconds : null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? en.createError);
      }
      const body = (await res.json()) as { code: string };
      navigate(`/r/${body.code}`, { state: { deckId: deck.id } satisfies RoomEntry });
    } catch (e) {
      setError((e as Error).message || en.createError);
    } finally {
      setCreating(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed && deck)
      navigate(`/r/${trimmed}`, { state: { deckId: deck.id } satisfies RoomEntry });
  };

  const noDeck = !deck;
  return (
    <main className="page home">
      <h1>{en.title}</h1>
      <section className="home-deck" aria-label={en.deckSection}>
        {decksError ? (
          <p role="alert">{decksError}</p>
        ) : decks === null ? (
          <p role="status">{copy.loadingDecks}</p>
        ) : decks.length === 0 ? (
          <p>
            <Link to="/decks">{en.createFirstDeck}</Link>
            {en.createFirstDeckHint}
          </p>
        ) : choices.length === 0 ? (
          <p>
            <Link to="/decks">{en.finishADeck}</Link>
            {en.finishADeckHint}
          </p>
        ) : (
          <div className="home-row">
            <label htmlFor="home-deck" className={`home-deck-icon f-${deck?.faction ?? "neutral"}`}>
              <DeckIcon />
              <span className="visually-hidden">{en.deck}</span>
            </label>
            <select
              id="home-deck"
              value={deck?.id ?? ""}
              disabled={searching}
              onChange={(e) => setDeckId(e.target.value)}
            >
              {choices.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatCopy(en.deckOption, {
                    name: d.name,
                    faction: FACTION_NAME[d.faction],
                  })}
                </option>
              ))}
            </select>
            <Link to="/decks">{en.myDecks}</Link>
          </div>
        )}
        {deck && competitiveProblem ? (
          <p className="hint" id="competitive-reason">
            {formatCopy(en.notCompetitive, { reason: competitiveProblem })}
          </p>
        ) : null}
      </section>

      <section className="home-find" aria-label={en.findAMatch}>
        {recentlyActive !== null ? (
          <p className="hint" data-testid="recently-active">
            {recentlyActive === 1
              ? en.oneRecentlyActivePlayer
              : formatCopy(en.recentlyActivePlayers, { count: recentlyActive })}
          </p>
        ) : null}
        {searching ? (
          <div className="home-row">
            <Searching state={search.state} />
            <button type="button" onClick={search.cancel}>
              {en.cancel}
            </button>
          </div>
        ) : (
          <div className="home-row">
            <button type="button" className="primary" onClick={find} disabled={noDeck}>
              {en.findAMatch}
            </button>
            <CompetitiveToggle
              label={en.competitiveQueue}
              checked={findCompetitive && deckCompetitive}
              disabled={!deckCompetitive}
              reason={!!competitiveProblem}
              onChange={setFindCompetitive}
            />
          </div>
        )}
        {search.state.status === "failed" ? <p role="alert">{search.state.message}</p> : null}
      </section>

      <section className="home-room" aria-labelledby="home-room-label">
        <h2 id="home-room-label" className="home-label">
          {en.room}
        </h2>
        <div className="home-row">
          <button type="button" onClick={create} disabled={creating || noDeck}>
            {en.create}
          </button>
          <CompetitiveToggle
            label={en.competitiveRoom}
            checked={roomCompetitive && deckCompetitive}
            disabled={!deckCompetitive}
            reason={!!competitiveProblem}
            onChange={setRoomCompetitive}
          />
          <label className="toggle">
            <input
              type="checkbox"
              checked={turnTimerOn}
              onChange={(e) => setTurnTimerOn(e.target.checked)}
            />
            {en.turnTimer}
          </label>
          {turnTimerOn ? (
            <span className="turn-timer-length">
              <input
                className="turn-timer-input"
                type="number"
                inputMode="numeric"
                min={MIN_TURN_TIMER_SECONDS}
                max={MAX_TURN_TIMER_SECONDS}
                step={1}
                value={turnTimer}
                onChange={(e) => setTurnTimer(e.target.value)}
                aria-label={en.turnTimerSeconds}
                aria-describedby="turn-timer-range"
              />
              <span aria-hidden="true">{en.seconds}</span>
              <span id="turn-timer-range" className="visually-hidden">
                {formatCopy(en.turnTimerRange, {
                  min: MIN_TURN_TIMER_SECONDS,
                  max: MAX_TURN_TIMER_SECONDS,
                })}
              </span>
            </span>
          ) : null}
          <form className="home-join" onSubmit={join}>
            <label htmlFor="room-code" className="visually-hidden">
              {en.roomCode}
            </label>
            <input
              id="room-code"
              className="room-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={en.codePlaceholder}
              maxLength={6}
              size={8}
              autoComplete="off"
            />
            <button type="submit" disabled={noDeck}>
              {en.join}
            </button>
          </form>
        </div>
      </section>
      {error ? <p role="alert">{error}</p> : null}

      {account ? (
        <section aria-label={en.record}>
          <h2>{en.record}</h2>
          {record ? (
            <dl className="home-record" data-testid="record">
              {(["wins", "losses", "draws", "disconnectWins", "disconnectLosses"] as const).map(
                (key) => (
                  <div key={key}>
                    <dt>{en[key]}</dt>
                    <dd data-testid={`record-${key}`}>{record[key]}</dd>
                  </div>
                ),
              )}
            </dl>
          ) : (
            <p role={recordError ? "alert" : "status"}>
              {recordError ? en.recordError : en.loadingRecord}
            </p>
          )}
        </section>
      ) : null}
    </main>
  );
}

/** A stack of card backs; the top one takes the selected Deck's Faction colour (`--tint`). */
function DeckIcon() {
  return (
    <svg viewBox="0 0 34 32" width="36" height="34" aria-hidden="true" focusable="false">
      {/* Fanned out from the bottom-left corner, so the cards beneath show to the right. */}
      <rect
        className="back"
        x="4"
        y="6"
        width="16"
        height="23"
        rx="2.5"
        transform="rotate(24 5 29)"
      />
      <rect
        className="back"
        x="4"
        y="6"
        width="16"
        height="23"
        rx="2.5"
        transform="rotate(12 5 29)"
      />
      <rect className="top" x="4" y="6" width="16" height="23" rx="2.5" />
      <rect className="top-inner" x="7" y="9" width="10" height="17" rx="1.5" />
    </svg>
  );
}

/** A Competitive toggle, off and disabled unless the selected Deck is a Competitive Deck. */
function CompetitiveToggle(props: {
  label: string;
  checked: boolean;
  disabled: boolean;
  /** The line saying why the selected Deck is not a Competitive Deck is shown. */
  reason: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        aria-describedby={props.reason ? "competitive-reason" : undefined}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {en.competitive}
    </label>
  );
}

/** "Searching… 0:42", counted from when the server put the player in the Queue. */
function Searching({ state }: { state: SearchState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const seconds = state.status === "searching" ? searchSeconds(state, now) : 0;
  return (
    <>
      <span role="status">{en.searching}</span>
      <span className="search-time" data-testid="search-time">
        {clock(seconds)}
      </span>
    </>
  );
}
