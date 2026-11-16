import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import copy from "../strings/en.json";
import { useAuth } from "./AuthContext";

/** Pages that need an account send signed-out players to sign in, then back. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { account } = useAuth();
  const location = useLocation();
  if (account === undefined) return <main className="page">{copy.loading}</main>;
  if (account === null) {
    return (
      <Navigate
        to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  return <>{children}</>;
}
