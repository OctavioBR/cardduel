import type { FactionId } from "@card-duel/engine";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { type Deck, deckApi } from "../decks/api";

const FACTIONS: { id: FactionId; name: string }[] = [
  { id: "swarm", name: "Swarm" },
  { id: "court", name: "Court" },
];

/** Your Decks, by Faction tab, with New Deck and Copy a Starter Deck. */
export function DecksPage() {
  const navigate = useNavigate();
  const [faction, setFaction] = useState<FactionId>("swarm");
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDecks(null);
    deckApi
      .list(faction)
      .then((d) => alive && setDecks(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [faction]);

  const open = async (make: () => Promise<Deck>) => {
    try {
      const deck = await make();
      navigate(`/decks/${deck.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main className="page wide">
      <h1>My Decks</h1>
      <div className="tabs" role="tablist" aria-label="Faction">
        {FACTIONS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={faction === f.id}
            className={`tab f-${f.id}`}
            onClick={() => setFaction(f.id)}
          >
            {f.name}
          </button>
        ))}
      </div>
      <div className="deck-actions">
        <button
          type="button"
          className="primary"
          onClick={() => open(() => deckApi.create(faction, "New Deck"))}
        >
          New Deck
        </button>
        <button type="button" onClick={() => open(() => deckApi.copyStarter(faction))}>
          Copy a Starter Deck
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {decks === null ? <p>Loading…</p> : null}
      {decks?.length === 0 ? (
        <p className="muted">No {faction === "swarm" ? "Swarm" : "Court"} Decks yet.</p>
      ) : null}
      <ul className="deck-list">
        {decks?.map((d) => (
          <li key={d.id}>
            <Link to={`/decks/${d.id}`}>{d.name}</Link>
            <span className={d.problems.valid.length === 0 ? "status ok" : "status"}>
              {d.problems.valid.length === 0
                ? d.problems.competitive.length === 0
                  ? "Competitive Deck"
                  : "Valid Deck"
                : "Incomplete"}
            </span>
            <button
              type="button"
              className="link"
              onClick={async () => {
                await deckApi.remove(d.id);
                setDecks((list) => list?.filter((x) => x.id !== d.id) ?? null);
              }}
              aria-label={`Delete ${d.name}`}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
