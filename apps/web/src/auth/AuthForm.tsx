import { type FormEvent, useId, useState } from "react";
import { type AuthMode, useAuth } from "./AuthContext";

/**
 * Sign in or sign up in one form, switchable in place, so a shared Room link can sign a
 * player up without leaving the page.
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
      <h2 id={`${id}-title`}>{signUp ? "Create an account" : "Sign in"}</h2>
      <label htmlFor={`${id}-user`}>Username</label>
      <input
        id={`${id}-user`}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        minLength={3}
        maxLength={20}
        pattern="[A-Za-z0-9_]{3,20}"
        title="3 to 20 letters, digits or underscores"
        required
      />
      {signUp ? <p className="hint">3 to 20 letters, digits or underscores.</p> : null}
      <label htmlFor={`${id}-pass`}>Password</label>
      <input
        id={`${id}-pass`}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={signUp ? "new-password" : "current-password"}
        minLength={signUp ? 8 : undefined}
        required
      />
      {signUp ? (
        <p className="hint">
          At least 8 characters. There is no email, so there is no password reset: keep it safe.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="primary" disabled={busy}>
        {signUp ? "Sign up" : "Sign in"}
      </button>
      <p className="switch">
        {signUp ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          className="link"
          onClick={() => setMode(signUp ? "signin" : "signup")}
        >
          {signUp ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
}
