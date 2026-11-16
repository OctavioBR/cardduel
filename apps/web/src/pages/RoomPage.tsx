import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { CardDetailProvider } from "../cards/CardDetail";
import { MatchBoard } from "../match/MatchBoard";
import { Stage } from "../match/Stage";
import { playerToken } from "../room/token";
import { useRoom } from "../room/useRoom";
import { roomSocketUrl, WebSocketRoom } from "../room/websocket-room";

export function RoomPage() {
  const { code = "" } = useParams();
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
  const state = useRoom(connection);
  if (state.view) {
    return (
      <Stage>
        <CardDetailProvider>
          <MatchBoard
            view={state.view}
            send={(a) => connection.send(a)}
            error={state.error?.message ?? null}
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
