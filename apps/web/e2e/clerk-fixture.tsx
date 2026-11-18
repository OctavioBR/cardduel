import { type FormEvent, type ReactNode, useState } from "react";

/** Controlled provider UI for app integration tests; no authentication bypass exists in the Worker. */
export function ClerkProvider({ children }: { children: ReactNode }) {
  return children;
}
export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: document.cookie.includes("__session="),
    userId: document.cookie.includes("__session=") ? "fixture-user" : null,
  };
}
export function useClerk() {
  return {
    signOut: async () => {
      for (const name of ["__session", "__client_uat", "__clerk_db_jwt"])
        await cookieStore.delete({ name, path: "/" });
      window.location.assign("/");
    },
  };
}
function Form({
  signup,
  target = "/",
  other = "/signin",
}: {
  signup: boolean;
  target?: string;
  other?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function login(google = false) {
    const response = await fetch("https://clerk-fixture.invalid/session", {
      method: "POST",
      body: JSON.stringify({
        email: google ? `google_${crypto.randomUUID()}@example.test` : email,
      }),
    });
    const { token } = (await response.json()) as { token: string };
    await cookieStore.set({ name: "__session", value: token, path: "/", sameSite: "lax" });
    await cookieStore.set({ name: "__client_uat", value: "1", path: "/", sameSite: "lax" });
    await cookieStore.set({ name: "__clerk_db_jwt", value: "fixture", path: "/", sameSite: "lax" });
    window.location.assign(target);
  }
  return (
    <section>
      <h1>{signup ? "Create an account" : "Sign in"}</h1>
      <button type="button" onClick={() => void login(true)}>
        Continue with Google
      </button>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void login();
        }}
      >
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">{signup ? "Sign up" : "Sign in"}</button>
      </form>
      <a href={other}>{signup ? "Sign in" : "Create an account"}</a>
    </section>
  );
}
export function SignIn({
  forceRedirectUrl,
  signUpUrl,
}: {
  forceRedirectUrl?: string;
  signUpUrl?: string;
}) {
  return <Form signup={false} target={forceRedirectUrl} other={signUpUrl} />;
}
export function SignUp({
  forceRedirectUrl,
  signInUrl,
}: {
  forceRedirectUrl?: string;
  signInUrl?: string;
}) {
  return <Form signup target={forceRedirectUrl} other={signInUrl} />;
}
export function UserProfile() {
  return <p>Provider account settings fixture</p>;
}
