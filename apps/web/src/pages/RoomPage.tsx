import type { LobbyInfo } from "@card-duel/engine";
import { formatCopy } from "@card-duel/strings";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { CardDetailProvider } from "../cards/CardDetail";
import { FACTION_NAME } from "../cards/factions";
import { type Deck, deckApi } from "../decks/api";
import { defaultDeck, seatableDecks } from "../decks/default-deck";
import { MatchBoard } from "../match/MatchBoard";
import { Stage } from "../match/Stage";
import { clock } from "../room/clock";
import { DisconnectBanner } from "../room/DisconnectBanner";
import roomStrings from "../room/strings/en.json";
import { useEventBatch, useRoom } from "../room/useRoom";
import { roomSocketUrl, WebSocketRoom } from "../room/websocket-room";
import copy from "../strings/en.json";

import en from "../strings/home.en.json";
import type { HomeEntry, RoomEntry } from "./HomePage";

/** "Casual Room", or "Competitive Room · Turn Timer 2:00" (#109). */
export function roomLabel(lobby: Pick<LobbyInfo, "competitive" | "turnTimer">): string {
  const type = lobby.competitive ? copy.competitiveRoom : copy.casualRoom;
  return lobby.turnTimer === null
    ? type
    : formatCopy(roomStrings.withTurnTimer, { room: type, time: clock(lobby.turnTimer) });
}

/** A Room by its code. The router signs players in first (RequireAuth). */
export function RoomPage() {
  const { code = "" } = useParams();
  return <RoomConnectionPage code={code} />;
}

function RoomConnectionPage({ code }: { code: string }) {
  const [connection, setConnection] = useState<WebSocketRoom | null>(null);
  useEffect(() => {
    const room = new WebSocketRoom({ url: roomSocketUrl(code) });
    setConnection(room);
    return () => room.close();
  }, [code]);
  if (!connection) return null;
  return <RoomScreen code={code} connection={connection} />;
}

function RoomScreen({ code, connection }: { code: string; connection: WebSocketRoom }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [copyStatus, setCopyStatus] = useState("");
  const state = useRoom(connection);
  const events = useEventBatch(connection);
  // Created or joined from Home: the Home Deck takes the Seat, once (#108).
  const homeDeck = (location.state as RoomEntry | null)?.deckId ?? null;
  const seatSent = useRef(false);
  // Only for the first Match: a Rematch picks its Deck in the Room.
  const [homeSeatDone, setHomeSeatDone] = useState(!homeDeck);
  const lobby = state.lobby;
  const autoSeat = !homeSeatDone && !!lobby && !lobby.you.seated && !lobby.matched;
  useEffect(() => {
    if (!autoSeat || seatSent.current || !homeDeck) return;
    seatSent.current = true;
    connection.takeSeat(homeDeck);
  }, [autoSeat, homeDeck, connection]);
  useEffect(() => {
    if (lobby?.you.seated || state.view || state.error) setHomeSeatDone(true);
  }, [lobby, state.view, state.error]);
  const seating = autoSeat && !state.error;
  if (state.view) {
    return (
      <Stage>
        <div style={{ display: "contents" }} inert={state.status !== "open"}>
          <CardDetailProvider>
            <MatchBoard
              view={state.view}
              send={(a) => connection.send(a)}
              error={state.error?.message ?? null}
              events={events}
              turnTimer={state.turnTimer}
              onRematch={
                state.rematch?.accepted || state.rematch?.declined
                  ? undefined
                  : () => connection.rematch()
              }
              rematchStatus={
                state.rematch?.declined
                  ? roomStrings.rematchDeclined
                  : state.rematch?.accepted
                    ? roomStrings.rematchWaiting
                    : state.rematch?.opponentAccepted
                      ? roomStrings.rematchOffer
                      : null
              }
              onLeave={() => {
                connection.close();
                navigate("/");
              }}
            />
          </CardDetailProvider>
        </div>
        {state.status === "open" && state.view.phase !== "ended" ? (
          <DisconnectBanner disconnect={state.disconnect} onClaim={() => connection.claimWin()} />
        ) : null}
        {state.status === "reconnecting" ? (
          <div className="reconnecting-overlay" role="status">
            {roomStrings.reconnecting}
          </div>
        ) : null}
      </Stage>
    );
  }
  if (state.error?.code === "no_match") {
    const again: HomeEntry | null = lobby?.you.lastDeckId
      ? { findMatch: { deckId: lobby.you.lastDeckId, competitive: lobby.competitive } }
      : null;
    return (
      <main className="page">
        <h1>{roomStrings.noMatch}</h1>
        <p>{state.error.message}</p>
        <div className="home-row">
          <button type="button" className="primary" onClick={() => navigate("/", { state: again })}>
            {roomStrings.findAnotherMatch}
          </button>
          <button type="button" onClick={() => navigate("/")}>
            {roomStrings.home}
          </button>
        </div>
      </main>
    );
  }
  if (state.error?.code === "room_full") {
    return (
      <main className="page">
        <h1>{copy.roomFull}</h1>
        <p>
          {copy.bothSeatsInRoom}
          {code}
          {copy.areTaken}
        </p>
      </main>
    );
  }
  if (state.waitingCode && lobby?.matched && lobby.you.seated && lobby.opponent.seated) {
    // Both Seats were taken in the Queue; the Match starts once both players connect. A
    // Matched Room's code is shown to no one else, so there is no link to share.
    return (
      <main className="page">
        <h1>{roomStrings.matchFound}</h1>
        <p>{roomLabel(lobby)}</p>
        <p role="status">{roomStrings.waitingToConnect}</p>
      </main>
    );
  }
  if (state.waitingCode) {
    const link = `${window.location.origin}/r/${state.waitingCode}`;
    const matched = !!lobby?.matched;
    return (
      <main className="page">
        <h1>
          {matched ? (
            roomStrings.matchFound
          ) : (
            <>
              {copy.room}
              {state.waitingCode}
            </>
          )}
        </h1>
        <p>{lobby ? roomLabel(lobby) : null}</p>
        {state.error ? <p role="alert">{state.error.message}</p> : null}
        {lobby?.you.seated ? (
          <p>
            {copy.youChose}
            {lobby.you.deckName}
            {copy.waitingForYourOpponentToChoose}
          </p>
        ) : seating ? (
          <p role="status">{roomStrings.takingSeat}</p>
        ) : (
          <DeckPicker
            lastDeckId={lobby?.you.lastDeckId ?? homeDeck}
            competitive={lobby?.competitive ?? false}
            onChoose={(id) => connection.takeSeat(id)}
          />
        )}
        {lobby?.opponent.present ? (
          <p>
            {lobby.opponent.displayName}
            {copy.isHere}
            {lobby.opponent.seated ? copy.opponentHasChosen : ""}
            {copy.label2}
          </p>
        ) : (
          <p>{copy.waitingForYourOpponentShareThe}</p>
        )}
        {matched ? null : (
          <>
            <p>
              <code data-testid="room-link">{link}</code>
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopyStatus(en.copied);
                } catch {
                  setCopyStatus(en.copyError);
                }
              }}
            >
              {en.copyLink}
            </button>
            <p role="status">{copyStatus}</p>
          </>
        )}
      </main>
    );
  }
  return (
    <main className="page">
      <p>{state.status === "reconnecting" ? copy.reconnecting : copy.connecting}</p>
    </main>
  );
}

/**
 * The Room's Deck picker, used when opening a shared link and for a Rematch. The default Deck
 * is preselected: this Room's last Deck, else the one Home would select (#108).
 */
function DeckPicker({
  lastDeckId,
  competitive,
  onChoose,
}: {
  lastDeckId: string | null;
  competitive: boolean;
  onChoose: (id: string) => void;
}) {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [accountLast, setAccountLast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    deckApi.choices().then(
      (r) => {
        setDecks(r.decks);
        setAccountLast(r.lastDeckId);
      },
      (e: Error) => setError(e.message),
    );
  }, []);
  const choices = decks ? seatableDecks(decks, competitive) : [];
  const preselected = decks
    ? (choices.find((d) => d.id === lastDeckId) ?? defaultDeck(decks, accountLast, competitive))
    : null;
  return (
    <section aria-label={copy.chooseADeck}>
      <h2>{copy.takeASeat}</h2>
      <p>
        {copy.chooseA}
        {competitive ? copy.competitive2 : copy.valid}
        {copy.deckForThisMatch}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {decks === null ? (
        <p>{copy.loadingDecks}</p>
      ) : choices.length === 0 ? (
        <p>
          {copy.youHaveNo}
          {competitive ? copy.competitive2 : copy.valid}
          {copy.decksCreateOneInMyDecks}
        </p>
      ) : (
        <ul className="deck-choices">
          {choices.map((deck) => (
            <li key={deck.id}>
              <button
                type="button"
                className={`deck-choice f-${deck.faction}`}
                aria-pressed={deck.id === preselected?.id}
                onClick={() => onChoose(deck.id)}
              >
                {deck.name}
                {copy.label5}
                {FACTION_NAME[deck.faction]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
