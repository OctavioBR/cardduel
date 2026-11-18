import { expect, it } from "vitest";
import { returnPath } from "./redirect";

it("preserves application return links and rejects external or looping destinations", () => {
  expect(returnPath("/r/ABC234?x=1")).toBe("/r/ABC234?x=1");
  for (const path of [
    null,
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/signin",
    "/signup",
    "/onboarding",
    "/%2f%2fevil.test",
    "/r/ABC234\n",
  ])
    expect(returnPath(path)).toBe("/");
});
