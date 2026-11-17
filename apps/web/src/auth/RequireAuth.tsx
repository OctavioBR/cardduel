import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import copy from "../strings/en.json";
import { useAuth } from "./AuthContext";

/** Every page but sign-in and sign-up needs an account: signed-out players sign in, then come back. */
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
