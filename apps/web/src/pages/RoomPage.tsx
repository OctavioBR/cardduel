import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { CardDetailProvider } from "../cards/CardDetail";
import { type Deck, deckApi } from "../decks/api";
import { MatchBoard } from "../match/MatchBoard";
import { Stage } from "../match/Stage";
import { DisconnectBanner } from "../room/DisconnectBanner";
import roomStrings from "../room/strings/en.json";
import { useEventBatch, useRoom } from "../room/useRoom";
import { roomSocketUrl, WebSocketRoom } from "../room/websocket-room";
import copy from "../strings/en.json";

import en from "../strings/home.en.json";

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
  const [copyStatus, setCopyStatus] = useState("");
  const state = useRoom(connection);
  const events = useEventBatch(connection);
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
  if (state.waitingCode) {
    const link = `${window.location.origin}/r/${state.waitingCode}`;
    return (
      <main className="page">
        <h1>
          {copy.room}
          {state.waitingCode}
        </h1>
        <p>{state.lobby?.competitive ? copy.competitiveRoom : copy.casualRoom}</p>
        {state.lobby?.you.seated ? (
          <p>
            {copy.youChose}
            {state.lobby.you.deckName}
            {copy.waitingForYourOpponentToChoose}
          </p>
        ) : (
          <DeckPicker
            lastDeckId={state.lobby?.you.lastDeckId ?? null}
            competitive={state.lobby?.competitive ?? false}
            onChoose={(id) => connection.takeSeat(id)}
          />
        )}
        {state.lobby?.opponent.present ? (
          <p>
            {state.lobby.opponent.username}
            {copy.isHere}
            {state.lobby.opponent.seated ? copy.opponentHasChosen : ""}
            {copy.label2}
          </p>
        ) : (
          <p>{copy.waitingForYourOpponentShareThe}</p>
        )}
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
      </main>
    );
  }
  return (
    <main className="page">
      <p>{state.status === "reconnecting" ? copy.reconnecting : copy.connecting}</p>
    </main>
  );
}

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
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    deckApi.list().then(setDecks, (e: Error) => setError(e.message));
  }, []);
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
      ) : decks.filter(
          (d) =>
            d.problems.valid.length === 0 && (!competitive || d.problems.competitive.length === 0),
        ).length === 0 ? (
        <p>
          {copy.youHaveNo}
          {competitive ? copy.competitive2 : copy.valid}
          {copy.decksCreateOneInMyDecks}
        </p>
      ) : (
        <ul className="deck-choices">
          {decks
            .filter(
              (d) =>
                d.problems.valid.length === 0 &&
                (!competitive || d.problems.competitive.length === 0),
            )
            .map((deck) => (
              <li key={deck.id}>
                <button
                  type="button"
                  className={`deck-choice f-${deck.faction}`}
                  aria-pressed={deck.id === lastDeckId}
                  onClick={() => onChoose(deck.id)}
                >
                  {deck.name}
                  {copy.label5}
                  {deck.faction === "swarm" ? copy.swarmId : copy.courtId}
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
