import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import copy from "../strings/en.json";
import { useAuth } from "./AuthContext";

/** Every page but sign-in and sign-up needs an account: signed-out players sign in, then come back. */
export function RequireAuth({
  children,
  allowIncomplete = false,
}: {
  children: ReactNode;
  allowIncomplete?: boolean;
}) {
  const { account, error, reload, signOut } = useAuth();
  const location = useLocation();
  if (error)
    return (
      <main className="page">
        <p role="alert">{error}</p>
        <button type="button" onClick={() => void reload()}>
          {copy.tryAgain}
        </button>
        <button type="button" onClick={() => void signOut()}>
          {copy.signOut}
        </button>
      </main>
    );
  if (account === undefined) return <main className="page">{copy.loading}</main>;
  if (account === null) {
    return (
      <Navigate
        to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  if (!allowIncomplete && !account.displayName)
    return (
      <Navigate
        to={`/onboarding?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  return <>{children}</>;
}
