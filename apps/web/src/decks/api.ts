import type { DeckProblem } from "@card-duel/catalog";
import type { FactionId } from "@card-duel/engine";

export interface Deck {
  id: string;
  name: string;
  faction: FactionId;
  leader: string | null;
  cards: string[];
  updatedAt: number;
  catalogVersion: string;
  problems: { valid: DeckProblem[]; competitive: DeckProblem[] };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/decks${path}`, {
    ...init,
    credentials: "same-origin",
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const deckApi = {
  list: (faction?: FactionId) =>
    call<{ decks: Deck[] }>(faction ? `?faction=${faction}` : "").then((r) => r.decks),
  get: (id: string) => call<{ deck: Deck }>(`/${id}`).then((r) => r.deck),
  create: (faction: FactionId, name: string) =>
    call<{ deck: Deck }>("", { method: "POST", body: JSON.stringify({ faction, name }) }).then(
      (r) => r.deck,
    ),
  copyStarter: (faction: FactionId) =>
    call<{ deck: Deck }>("/copy-starter", {
      method: "POST",
      body: JSON.stringify({ faction }),
    }).then((r) => r.deck),
  save: (id: string, patch: { name?: string; leader?: string | null; cards?: string[] }) =>
    call<{ deck: Deck }>(`/${id}`, { method: "PUT", body: JSON.stringify(patch) }).then(
      (r) => r.deck,
    ),
  remove: (id: string) => call<void>(`/${id}`, { method: "DELETE" }),
};
