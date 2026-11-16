import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { AuthForm } from "../auth/AuthForm";
import { CardDetailProvider } from "../cards/CardDetail";
import { MatchBoard } from "../match/MatchBoard";
import { Stage } from "../match/Stage";
import { playerToken } from "../room/token";
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
    const room = new WebSocketRoom({ url: roomSocketUrl(code), token: playerToken() });
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
            onLeave={() => navigate("/")}
          />
        </CardDetailProvider>
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
        <p>Waiting for your opponent. Share the code or this link:</p>
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
