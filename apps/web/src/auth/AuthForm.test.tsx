import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "./AuthContext";
import { AuthForm } from "./AuthForm";

describe("AuthForm", () => {
  it("renders sign up with the username rules and a switch to sign in", () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <AuthForm initialMode="signup" />
      </AuthProvider>,
    );
    expect(html).toContain("Create an account");
    expect(html).toContain('pattern="[A-Za-z0-9_]{3,20}"');
    expect(html).toContain('minLength="8"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain("Already have an account?");
  });

  it("renders sign in", () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <AuthForm initialMode="signin" />
      </AuthProvider>,
    );
    expect(html).toContain(">Sign in</button>");
    expect(html).toContain('autoComplete="current-password"');
  });
});
