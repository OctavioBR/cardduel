import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { AuthForm } from "../auth/AuthForm";
import { CardDetailProvider } from "../cards/CardDetail";
import { type Deck, deckApi } from "../decks/api";
import { MatchBoard } from "../match/MatchBoard";
import { Stage } from "../match/Stage";
import roomStrings from "../room/strings/en.json";
import { useEventBatch, useRoom } from "../room/useRoom";
import { roomSocketUrl, WebSocketRoom } from "../room/websocket-room";

export function RoomPage() {
  const { code = "" } = useParams();
  const { account } = useAuth();
  if (account === undefined) {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    );
  }
  if (account === null) {
    // A shared Room link while signed out: sign up (or in) right here, then go on to the Seat.
    return (
      <main className="page narrow">
        <h1>Room {code.toUpperCase()}</h1>
        <p>You need an account to take a Seat. It takes a moment.</p>
        <AuthForm initialMode="signup" />
      </main>
    );
  }
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
  const state = useRoom(connection);
  const events = useEventBatch(connection);
  if (state.view) {
    return (
      <Stage>
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
            onLeave={() => {
              connection.close();
              navigate("/");
            }}
          />
        </CardDetailProvider>
        {state.rematch &&
        (state.rematch.accepted || state.rematch.opponentAccepted || state.rematch.declined) ? (
          <p role="status" data-testid="rematch-status" className="result-banner">
            {state.rematch.declined
              ? roomStrings.rematchDeclined
              : state.rematch.accepted
                ? roomStrings.rematchWaiting
                : roomStrings.rematchOffer}
          </p>
        ) : null}
        {state.status === "reconnecting" ? (
          <div className="result-banner">Reconnecting…</div>
        ) : null}
      </Stage>
    );
  }
  if (state.error?.code === "room_full") {
    return (
      <main className="page">
        <h1>Room full</h1>
        <p>Both Seats in Room {code} are taken.</p>
      </main>
    );
  }
  if (state.waitingCode) {
    const link = `${window.location.origin}/r/${state.waitingCode}`;
    return (
      <main className="page">
        <h1>Room {state.waitingCode}</h1>
        <p>{state.lobby?.competitive ? "Competitive Room" : "Casual Room"}</p>
        {state.lobby?.you.seated ? (
          <p>You chose {state.lobby.you.deckName}. Waiting for your opponent to choose a Deck.</p>
        ) : (
          <DeckPicker
            lastDeckId={state.lobby?.you.lastDeckId ?? null}
            competitive={state.lobby?.competitive ?? false}
            onChoose={(id) => connection.takeSeat(id)}
          />
        )}
        {state.lobby?.opponent.present ? (
          <p>
            {state.lobby.opponent.username} is here
            {state.lobby.opponent.seated ? " and has chosen a Deck" : ""}.
          </p>
        ) : (
          <p>Waiting for your opponent. Share the code or this link:</p>
        )}
        <p>
          <code data-testid="room-link">{link}</code>
        </p>
      </main>
    );
  }
  return (
    <main className="page">
      <p>{state.status === "reconnecting" ? "Reconnecting…" : "Connecting…"}</p>
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
    <section aria-label="Choose a Deck">
      <h2>Take a Seat</h2>
      <p>Choose a {competitive ? "Competitive " : "Valid "}Deck for this Match.</p>
      {error ? <p role="alert">{error}</p> : null}
      {decks === null ? (
        <p>Loading Decks…</p>
      ) : decks.filter(
          (d) =>
            d.problems.valid.length === 0 && (!competitive || d.problems.competitive.length === 0),
        ).length === 0 ? (
        <p>You have no {competitive ? "Competitive " : "Valid "}Decks. Create one in My Decks.</p>
      ) : (
        <ul>
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
                  aria-pressed={deck.id === lastDeckId}
                  onClick={() => onChoose(deck.id)}
                >
                  {deck.name} — {deck.faction}
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
