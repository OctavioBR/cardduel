import { useNavigate, useSearchParams } from "react-router";
import type { AuthMode } from "../auth/AuthContext";
import { AuthForm } from "../auth/AuthForm";

/** /signin and /signup: a fluid page that returns to ?next= (or home) when done. */
export function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <main className="page narrow">
      <AuthForm key={mode} initialMode={mode} onDone={() => navigate(target, { replace: true })} />
    </main>
  );
}
