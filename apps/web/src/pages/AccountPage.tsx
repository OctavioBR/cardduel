import { UserProfile } from "@clerk/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { returnPath } from "../auth/redirect";
import copy from "../strings/en.json";

export function AccountPage({ onboarding = false }: { onboarding?: boolean }) {
  const { account, updateDisplayName } = useAuth();
  const [name, setName] = useState(account?.displayName ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = returnPath(params.get("next"));
  useEffect(() => {
    if (onboarding) input.current?.focus();
  }, [onboarding]);
  if (onboarding && account?.displayName) return <Navigate to={next} replace />;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const failure = await updateDisplayName(name);
    setBusy(false);
    if (failure) setError(failure);
    else if (onboarding) navigate(next, { replace: true });
    else setMessage(copy.displayNameSaved);
  };
  return (
    <main className={onboarding ? "page narrow" : "page wide"}>
      <h1>{onboarding ? copy.chooseDisplayName : copy.accountSettings}</h1>
      <form className="auth-form" onSubmit={save}>
        <label htmlFor="display-name">{copy.displayName}</label>
        <input
          ref={input}
          id="display-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoComplete="nickname"
          aria-describedby="display-name-hint"
        />
        <p id="display-name-hint" className="hint">
          {copy.displayNameHint}
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {message ? <p role="status">{message}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? copy.saving : onboarding ? copy.continue : copy.save}
        </button>
      </form>
      {!onboarding ? (
        <section aria-label={copy.signInAndSecurity}>
          <h2>{copy.signInAndSecurity}</h2>
          <div className="managed-auth">
            <UserProfile routing="hash" />
          </div>
        </section>
      ) : null}
    </main>
  );
}
