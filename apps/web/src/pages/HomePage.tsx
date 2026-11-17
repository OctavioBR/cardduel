import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { useAuth } from "../auth/AuthContext";
import en from "../strings/home.en.json";

interface Record {
  wins: number;
  losses: number;
  draws: number;
  disconnectWins: number;
  disconnectLosses: number;
}

export function HomePage() {
  const navigate = useNavigate();
  const { account } = useAuth();
  const [record, setRecord] = useState<Record | null>(null);
  const [recordError, setRecordError] = useState(false);
  useEffect(() => {
    let alive = true;
    setRecord(null);
    setRecordError(false);
    if (account)
      fetch("/api/record")
        .then(async (res) => {
          if (!res.ok) throw new Error();
          const body = (await res.json()) as { record: Record };
          if (alive) setRecord(body.record);
        })
        .catch(() => {
          if (alive) setRecordError(true);
        });
    return () => {
      alive = false;
    };
  }, [account]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [competitive, setCompetitive] = useState(false);

  const create = async () => {
    if (!account) {
      navigate("/signin?next=%2F");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitive }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { code: string };
      navigate(`/r/${body.code}`);
    } catch {
      setError(en.createError);
    } finally {
      setCreating(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed) navigate(`/r/${trimmed}`);
  };

  return (
    <main className="page">
      <h1>{en.title}</h1>
      {account ? (
        <>
          <section aria-label={en.myDecks}>
            <h2>
              <Link to="/decks">{en.myDecks}</Link>
            </h2>
            <p>{en.deckHint}</p>
          </section>
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
        </>
      ) : null}
      <section>
        <h2>{en.createHeading}</h2>
        <label>
          <input
            type="checkbox"
            checked={competitive}
            onChange={(e) => setCompetitive(e.target.checked)}
          />{" "}
          {en.competitive}
        </label>
        <button type="button" onClick={create} disabled={creating}>
          {en.create}
        </button>
      </section>
      <section>
        <h2>{en.joinHeading}</h2>
        <form onSubmit={join}>
          <label htmlFor="room-code">{en.roomCode}</label>
          <input
            id="room-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            autoComplete="off"
          />
          <button type="submit">{en.join}</button>
        </form>
      </section>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
