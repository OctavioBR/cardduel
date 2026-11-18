import { useEffect, useRef, useState } from "react";
import { Link, Outlet } from "react-router";
import { useAuth } from "../auth/AuthContext";
import copy from "../strings/en.json";

/** The fluid, responsive frame for every screen except the Match stage (ADR-0006). */
export function AppShell() {
  return (
    <div className="shell">
      <header className="shell-header">
        <Link to="/" className="brand">
          {copy.cardDuel}
        </Link>
        <AccountMenu />
      </header>
      <Outlet />
    </div>
  );
}

function AccountMenu() {
  const { account, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Signed-out players only ever see sign-in and sign-up, which need no account links.
  if (!account) return null;
  return (
    <div className="account-menu" ref={ref}>
      <Link to="/decks" className="nav-link">
        {copy.myDecks}
      </Link>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {account.displayName ?? copy.accountSettings}
      </button>
      {open ? (
        <div className="account-dropdown" role="menu">
          <Link role="menuitem" to="/account" onClick={() => setOpen(false)}>
            {copy.accountSettings}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
            }}
          >
            {copy.signOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}
