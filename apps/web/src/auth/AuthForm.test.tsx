import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AuthForm } from "./AuthForm";

it("shows an accessible unavailable state without authentication configuration", () => {
  expect(renderToStaticMarkup(<AuthForm />)).toContain('role="alert"');
});
