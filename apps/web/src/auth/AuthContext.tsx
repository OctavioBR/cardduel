import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import copy from "../strings/en.json";

export interface Account {
  id: string;
  username: string;
}

export type AuthMode = "signin" | "signup";

interface AuthState {
  /** undefined while loading, null when signed out. */
  account: Account | null | undefined;
  submit: (mode: AuthMode, username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** The signed-in account, read from /api/me (ADR-0005 session cookie). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { credentials: "same-origin" })
      .then(async (res) =>
        res.ok ? (((await res.json()) as { account: Account | null }).account ?? null) : null,
      )
      .catch(() => null)
      .then((a) => {
        if (alive) setAccount(a);
      });
    return () => {
      alive = false;
    };
  }, []);

  /** Signs in or up; returns an error message, or null on success. */
  const submit = useCallback(async (mode: AuthMode, username: string, password: string) => {
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      const body = (await res.json().catch(() => ({}))) as { account?: Account; message?: string };
      if (!res.ok || !body.account) return body.message ?? copy.somethingWentWrongTryAgain;
      setAccount(body.account);
      return null;
    } catch {
      return copy.couldNotReachTheServerTry;
    }
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/signout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
    setAccount(null);
  }, []);

  const value = useMemo(() => ({ account, submit, signOut }), [account, submit, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth needs an AuthProvider");
  return ctx;
}
