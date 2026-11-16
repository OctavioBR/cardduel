import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";

export function HomePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { code: string };
      navigate(`/r/${body.code}`);
    } catch {
      setError("Could not create a Room. Try again.");
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
      <h1>Card Duel</h1>
      <section>
        <h2>Create a Room</h2>
        <button type="button" onClick={create} disabled={creating}>
          Create Room
        </button>
      </section>
      <section>
        <h2>Join a Room</h2>
        <form onSubmit={join}>
          <label htmlFor="room-code">Room code</label>
          <input
            id="room-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            autoComplete="off"
          />
          <button type="submit">Join</button>
        </form>
      </section>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
