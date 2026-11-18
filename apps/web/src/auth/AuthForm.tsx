import { SignIn, SignUp } from "@clerk/react";
import copy from "../strings/en.json";
import { type AuthMode, useAuth } from "./AuthContext";

/** Clerk owns password, verification, recovery and Google authentication. */
export function AuthForm({
  initialMode = "signup",
  target = "/",
}: {
  initialMode?: AuthMode;
  target?: string;
}) {
  const { configured } = useAuth();
  if (!configured) return <p role="alert">{copy.signInUnavailable}</p>;
  const next = `?next=${encodeURIComponent(target)}`;
  return (
    <div className="managed-auth">
      {initialMode === "signup" ? (
        <SignUp routing="hash" signInUrl={`/signin${next}`} forceRedirectUrl={target} />
      ) : (
        <SignIn routing="hash" signUpUrl={`/signup${next}`} forceRedirectUrl={target} />
      )}
    </div>
  );
}
