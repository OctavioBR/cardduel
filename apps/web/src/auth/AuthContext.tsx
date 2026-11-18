import { ClerkProvider, useClerk, useAuth as useClerkAuth } from "@clerk/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import copy from "../strings/en.json";

export interface Account {
  id: string;
  displayName: string | null;
}
export type AuthMode = "signin" | "signup";
interface AuthState {
  account: Account | null | undefined;
  configured: boolean;
  error: string | null;
  reload: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}
const unavailable: AuthState = {
  account: null,
  configured: false,
  error: null,
  reload: async () => {},
  updateDisplayName: async () => copy.signInUnavailable,
  signOut: async () => {},
};
const Ctx = createContext<AuthState>(unavailable);

export function AuthProvider({ children }: { children: ReactNode }) {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) return <Ctx.Provider value={unavailable}>{children}</Ctx.Provider>;
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/signin"
      signUpUrl="/signup"
      afterSignOutUrl="/"
      appearance={{
        elements: { formButtonPrimary: { color: "#141310" } },
        variables: {
          colorPrimary: "#d3a85c",
          colorBackground: "#201e1a",
          colorForeground: "#f2eee5",
          colorMutedForeground: "#c5bfb3",
        },
      }}
    >
      <ManagedAuth>{children}</ManagedAuth>
    </ClerkProvider>
  );
}

function ManagedAuth({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useClerkAuth();
  const clerk = useClerk();
  const [profile, setProfile] = useState<{ userId: string; account: Account } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!isSignedIn || !userId) {
      setProfile(null);
      return;
    }
    setError(null);
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      const body = (await response.json()) as { account: Account | null };
      if (!response.ok || !body.account) throw new Error();
      setProfile({ userId, account: body.account });
    } catch {
      setError(copy.couldNotReachTheServerTry);
    }
  }, [isSignedIn, userId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const updateDisplayName = async (displayName: string) => {
    try {
      const response = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const body = (await response.json()) as { account?: Account; message?: string };
      if (!response.ok || !body.account || !userId)
        return body.message ?? copy.somethingWentWrongTryAgain;
      setProfile({ userId, account: body.account });
      return null;
    } catch {
      return copy.couldNotReachTheServerTry;
    }
  };
  const account = !isLoaded
    ? undefined
    : !isSignedIn
      ? null
      : profile?.userId === userId
        ? profile.account
        : undefined;
  return (
    <Ctx.Provider
      value={{
        account,
        configured: true,
        error,
        reload,
        updateDisplayName,
        signOut: async () => {
          await clerk.signOut();
          setProfile(null);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(Ctx);
}
