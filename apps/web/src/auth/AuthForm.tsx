import { type FormEvent, useId, useState } from "react";
import copy from "../strings/en.json";
import { type AuthMode, useAuth } from "./AuthContext";

/**
 * Sign in or sign up in one form, switchable in place, so a player sent to sign in from a
 * shared Room link can create an account without losing where they were going.
 */
export function AuthForm({
  initialMode = "signup",
  onDone,
}: {
  initialMode?: AuthMode;
  onDone?: () => void;
}) {
  const { submit } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await submit(mode, username, password);
    setBusy(false);
    if (message) setError(message);
    else onDone?.();
  };

  const signUp = mode === "signup";
  return (
    <form className="auth-form" onSubmit={onSubmit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{signUp ? copy.createAnAccount : copy.signIn}</h2>
      <label htmlFor={`${id}-user`}>{copy.username}</label>
      <input
        id={`${id}-user`}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        minLength={3}
        maxLength={20}
        pattern="[A-Za-z0-9_]{3,20}"
        title={copy.text3To20LettersDigitsOr}
        required
      />
      {signUp ? <p className="hint">{copy.text3To20LettersDigitsOr2}</p> : null}
      <label htmlFor={`${id}-pass`}>{copy.password}</label>
      <input
        id={`${id}-pass`}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={signUp ? "new-password" : "current-password"}
        minLength={signUp ? 8 : undefined}
        required
      />
      {signUp ? <p className="hint">{copy.atLeast8CharactersThereIs}</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="primary" disabled={busy}>
        {signUp ? copy.signUp : copy.signIn}
      </button>
      <p className="switch">
        {signUp ? copy.alreadyHaveAnAccount : copy.newHere}{" "}
        <button
          type="button"
          className="link"
          onClick={() => setMode(signUp ? "signin" : "signup")}
        >
          {signUp ? copy.signIn : copy.createAnAccount}
        </button>
      </p>
    </form>
  );
}
