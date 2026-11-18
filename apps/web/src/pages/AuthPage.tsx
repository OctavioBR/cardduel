import { Navigate, useSearchParams } from "react-router";
import { type AuthMode, useAuth } from "../auth/AuthContext";
import { AuthForm } from "../auth/AuthForm";
import { returnPath } from "../auth/redirect";

export function AuthPage({ mode }: { mode: AuthMode }) {
  const [params] = useSearchParams();
  const { account } = useAuth();
  const target = returnPath(params.get("next"));
  if (account)
    return (
      <Navigate
        to={account.displayName ? target : `/onboarding?next=${encodeURIComponent(target)}`}
        replace
      />
    );
  return (
    <main className="page narrow">
      <AuthForm initialMode={mode} target={target} />
    </main>
  );
}
